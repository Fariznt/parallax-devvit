import { Devvit, ModNote } from "@devvit/public-api";
import { PolicyEngine }  from "./PolicyEngine/engine.js";
import { 
  loadActionMapFromSettings, 
  loadEarlyExitFromSettings, 
  loadKeyFromSettings, 
  loadPolicyFromSettings, 
  SeverityActionMap
} from "./settings-loader.js";
import { actionFunctions } from "./action-functions.js";
import type { TriggerEventType, Comment, TriggerContext } from "@devvit/public-api";
import type { EvaluationResult, Violation } from "./PolicyEngine/handlers/types.js";
import type { ModelConfig } from "./PolicyEngine/types.js"

Devvit.configure({
  redditAPI: true,
  redis: true,
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
    engine = new PolicyEngine({
      policy: policyJson,
      model: config,
      noteMax: 100,
    });
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
  result: EvaluationResult, contentId: string, context: TriggerContext
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
    actionFunctions["modmail"]()
  } else {
    const actions: string[] = actionMap[maxSeverity]
    if (!(maxSeverity in actionMap)) {
      throw new Error(
        `A severity level defined in a violated Policy does not exist in actionMap`)
    } else {
      // apply the function corresponding to each action
      for (const a of actions) {
        actionFunctions[a](result, contentId, context)
      }
    }
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
    console.log('commentThread:', commentThread)

    console.log("Evaluation text:" + text);

    const apiKey = await loadKeyFromSettings(context);
    const engine = await getEngine(context);
    const earlyExit = await loadEarlyExitFromSettings(context);
    const result: EvaluationResult = await engine.evaluate({
      text: text, 
      contextList: commentThread, 
      apiKey: apiKey, 
      doEarlyExit: earlyExit
    });
    console.log('Evaluation result:', result);
    resultApply(result, comment.id, context);
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

    console.log("Evaluation text:", text);

    const apiKey = await loadKeyFromSettings(context);
    const engine = await getEngine(context);
    const earlyExit = await loadEarlyExitFromSettings(context)
    const result: EvaluationResult = await engine.evaluate({
      text: text, 
      imageUrl: imgLink,
      apiKey: apiKey, 
      doEarlyExit: earlyExit
    });
    console.log('Evaluation result:', result);

    resultApply(result, post.id, context);
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
