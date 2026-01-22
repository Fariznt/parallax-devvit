import { Devvit, ModNote } from "@devvit/public-api";
import { PolicyEngine }  from "./PolicyEngine/engine.js";
import { 
  loadActionMapFromSettings, 
  loadEarlyExitFromSettings, 
  loadKeyFromSettings, 
  loadPolicyFromSettings, 
} from "./settings-loader.js";
import { actionFunctions } from "./action-functions.js";
import type { TriggerEventType, Comment, TriggerContext } from "@devvit/public-api";
import type { EvaluationResult, Violation } from "./PolicyEngine/handlers/types.js";
import type { ModelConfig } from "./PolicyEngine/types.js"
import type { SeverityActionMap, ContentInfo } from "./types.js";

Devvit.configure({
  redditAPI: true,
  http: true,
});

Devvit.addSettings([
  {
    name: 'apiKey',
    label: 'OpenAI API Key',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  {
    name: 'policyJson',
    label: 'Policy Definition',
    type: 'paragraph',
    scope: 'installation', 
  },
  {
    name: 'actionJson',
    label: 'Action List by Severity',
    type: 'paragraph',
    scope: 'installation'
  },
  {
    name: 'llmURL',
    label: 'LLM Base URL',
    type: 'string',
    scope: 'installation', 
  },
  {
    name: 'llmName',
    label: 'LLM Model Name',
    type: 'string',
    scope: 'installation', 
    defaultValue: 'gpt-3.5-turbo',
  },
  {
    name: 'earlyExit',
    label: `Early Exiting / Short-Circuiting in 'all_of'`,
    type: 'string',
    scope: 'installation'
  }
]);

let engine: PolicyEngine | undefined;

/**
 * Wrapper around PolicyEngine constructor for skipping repeated instantiation (minor optimization)
 * and abstracting away engine construction.
 * @returns PolicyEngine object encoding some policy and providing evaluation utility.
 */
async function getEngine(context: TriggerContext): Promise<PolicyEngine> {
  if (!engine) {
    const policyJson: Record<string, unknown> = await loadPolicyFromSettings(context);

    const modelName = await context.settings.get("llmName");
    if (typeof modelName !== "string" || modelName.length === 0) {
      throw new Error('Setting "llmName" must be a non-empty string');
    }

    const baseUrlRaw = await context.settings.get("llmURL");
    if (typeof baseUrlRaw !== "string" || baseUrlRaw.length === 0) {
      throw new Error('Setting "llmURL" must be a non-empty string');
    }
    const baseUrl = baseUrlRaw.replace(/\/+$/, "");

    const config: ModelConfig = {
      modelName: modelName,
      baseUrl: baseUrl
    }
    engine = new PolicyEngine(policyJson, config, 100);
  }
  return engine;
}

// TODO warning, comment type might cause issues later. test thoroughly.
async function getThread(
  context: TriggerContext, comment: { id: string; parentId?: string }
): Promise<string[]> {
  let current = comment;
  const chain = [];

  while (current.parentId?.startsWith('t1_')) {
    const parent = await context.reddit.getCommentById(current.parentId);
    if (parent && parent.body) {
      const author = parent.authorId ?? "Unknown User";
      const text = parent.body;
      chain.push(`${author}: ${text}`);
    }
    current = parent;
  }
  return chain.reverse();
}

/**
 * Takes the EvaluationResult from a PolicyEngine computation and applies the correct actions
 * based on settings.
 * @param result 
 * @param contentId 
 * @param context 
 */
async function resultApply(
  result: EvaluationResult, 
  contentInfo: ContentInfo, 
  context: TriggerContext
): Promise<void> {
  let action: string; 
  let maxSeverity: number | null = null;
  const actionMap: SeverityActionMap | null = await loadActionMapFromSettings(context)

  // set max severity as the highest severity among violations
  for (const v of result.violations) {
    if (v.severity == null) continue;
    if (maxSeverity == null || v.severity > maxSeverity) {
      maxSeverity = v.severity;
    }
  }

  if (!actionMap || !maxSeverity) { 
    // no severity map provided, or no severity in violated nodes, default to modmail
    actionFunctions["modmail"](result, contentInfo, context)
  } else {
    const actions: string[] = actionMap[maxSeverity]
    if (!(maxSeverity in actionMap)) {
      throw new Error(
        `A severity level defined in a violated Policy does not exist in actionMap`)
    } else {
      // apply the function corresponding to each action
      for (const a of actions) {
        actionFunctions[a](result, contentInfo, context)
      }
    }
  }
}

async function safeEvaluate(
  {
    context,
    contentInfo, 
    contextList, 
    apiKey, 
    doEarlyExit  
  }: {
    context: TriggerContext,
    contentInfo: ContentInfo, 
    contextList?: string[], 
    apiKey: string, 
    doEarlyExit: boolean 
  }
): Promise<EvaluationResult | null> {
  try {
    const engine = await getEngine(context);
    const result: EvaluationResult = await engine.evaluate({
      text: contentInfo.text, 
      imageUrl: contentInfo.imgUrl,
      contextList: contextList, 
      apiKey: apiKey, 
      doEarlyExit: doEarlyExit
    });
    return result;
  } catch (err: unknown) {
    // In case of failure, send informative error to modmail
    let message = "Unknown error";

    if (err instanceof Error) {
      message = err.message;
    } else if (typeof err === "string") {
      message = err;
    }
    console.log(`Errored during content evaluation:\n ${message}`)
    await context.reddit.modMail.createConversation({
      body: 
      `An error occurred trying to evaluate the ${contentInfo.type} at:\n${contentInfo.link}
      \nIf settings were recently changed, this could be a syntax error in your policy definition.
      \nIf the error seems unrelated, contact parallax.moderator@gmail.com.
      \nError: ${message}`,
      subredditName: context.subredditName!,
      subject: "Policy-Agent Error",
      to: null // i.e. internal moderator conversation
    });
    return null
  }
}

/**
 * Event listener for user comments. Uses PolicyEngine to do an evaluation and applies
 * relevant actions.
 */
Devvit.addTrigger({
  // Fires for new comments, including replies.
  event: "CommentCreate", // TODO: include posts
  onEvent: async (event: TriggerEventType["CommentCreate"], context) => {
    console.log('CommentCreate event triggered');

    const comment = event.comment;
    const text = comment?.body ?? "";
    if (!comment || !text) return;
    const commentThread: string[] = await getThread(context, comment);

    const commentInfo: ContentInfo = {
      username: event.author?.name ?? null,
      id: event.comment?.id ?? null,
      text: text,
      link: event.comment?.permalink ?? null,
      imgUrl: null,
      type: "comment"
    }
    
    const apiKey = await loadKeyFromSettings(context);
    const earlyExit = await loadEarlyExitFromSettings(context);

    const result: EvaluationResult | null = await safeEvaluate({
      context: context,
      contentInfo: commentInfo, 
      contextList: commentThread, 
      apiKey: apiKey, 
      doEarlyExit: earlyExit
    })

    if (result) {
      resultApply(result, commentInfo, context);
    }
  },
});

/**
 * Event listener for user posts. Uses PolicyEngine to do an evaluation and applies
 * relevant actions.
 */
Devvit.addTrigger({
  // Fires for newly created posts.
  event: "PostCreate",
  onEvent: async (event: TriggerEventType["PostCreate"], context) => {
    console.log("PostCreate event triggered");

    const post = event.post ? await context.reddit.getPostById(event.post.id) : null;
    if (!post) {
      console.warn("PostCreate fired without post payload");
      return;
    }

    const body = post.body ? post.body.trim() : "No Body";
    const title = post.title.trim();
    const text =
      `POST TITLE:\n${title}\n\n` +
      `POST BODY:\n${body}`;

    const enrichedThumbnail = await post.getEnrichedThumbnail();
    const imgLink = enrichedThumbnail?.image.url ?? null;

    const postInfo: ContentInfo = {
      username: event.author?.name ?? null,
      id: event.post?.id ?? null,
      text: text,
      link: event.post?.permalink ?? null,
      imgUrl: imgLink,
      type: "post"
    }

    const apiKey = await loadKeyFromSettings(context);
    const earlyExit = await loadEarlyExitFromSettings(context)
    const result: EvaluationResult | null = await safeEvaluate({
      context: context,
      contentInfo: postInfo, 
      apiKey: apiKey, 
      doEarlyExit: earlyExit
    })

    if (result) {
      resultApply(result, postInfo, context);
    }
  },
});

// /**
//  * Event listener for testing units of code during development
//  */
// Devvit.addMenuItem({
//   location: 'subreddit',
//   label: 'Run PolicyAgent Test',
//   forUserType: 'moderator',
//   onPress: async (event, context) => {
//     const subredditName = context.subredditName;

//     console.log(`PolicyAgent test triggered on r/${subredditName}`);

//     if (subredditName) {
//       // Example: fetch wiki policy
//       const wiki = await context.reddit.getWikiPage(
//         subredditName,
//         'index'
//       );
//       console.log(wiki.content); 
//     } else {
//       console.log("subredditname undefined")
//     }
 
//   },
// });

export default Devvit;
