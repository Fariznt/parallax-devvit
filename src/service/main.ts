import { Devvit, ModNote } from "@devvit/public-api";
import { PolicyEngine }  from "./PolicyEngine/engine.js";
import { 
  loadActionMapFromSettings, 
  loadEarlyExitFromSettings, 
  loadIgnoreFailuresFromSettings,
  loadKeyFromSettings, 
  loadPolicyFromSettings, 
} from "./settings-loader.js";
import { actionFunctions, modmailErr } from "./action-functions.js";
import type { TriggerEventType, Comment, TriggerContext } from "@devvit/public-api";
import type { EvaluationResult, Violation } from "./PolicyEngine/handlers/types.js";
import type { ModelConfig } from "./PolicyEngine/types.js"
import type { SeverityActionMap, ContentInfo } from "./types.js";

Devvit.configure({
  redditAPI: true,
  http: true,
  redis: true,
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
    helpText: 'This is the base url of the LLM API you are using.',
    type: 'string',
    scope: 'installation', 
    defaultValue: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  },
  {
    name: 'llmName',
    label: 'LLM Model Name',
    type: 'string',
    scope: 'installation', 
    defaultValue: 'gemini-2.5-flash-lite',
  },
  {
    name: 'earlyExit',
    label: `Early Exiting in 'all_of'`,
    helpText: `Early exiting is a feature that allows the policy engine to stop evaluating the policy if it has already found a violation.
    This is useful for saving on LLM calls and reducing latency, at the cost of incomplete evaluation..`,
    defaultValue: false,
    type: 'boolean',
    scope: 'installation'
  },
  {
    name: "enabled",
    label: "Enable Policy Agent",
    type: "boolean",
    defaultValue: false,
    scope: 'installation',
  },
  {
    name: "ignoreFailures",
    label: "Ignore Evaluation Failures",
    type: "boolean",
    defaultValue: false,
    scope: 'installation',
  },
  {
    name: 'remMailOnApprove',
    label: 'Remove Related Modmail On Modqueue Approve',
    helpText: `Removes u/Automoderator or u/policy-agent 
    modmail related to a post/comment upon its approval/removal.`,
    type: 'boolean',
    defaultValue: false,
    scope: 'installation',
  },
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
  // nothing to do if no violations
  if (result.violations.length === 0) {
    return;
  }
  console.log("\nViolations: " + JSON.stringify(result.violations))

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

  if (!actionMap || maxSeverity == null) { 
    // no severity map provided, or no severity in violated nodes, default to modmail
    console.log("No valid actionMap or maxSeverity; defaulting to modmail")
    actionFunctions["sendModmail"](result, contentInfo, context)
  } else {
    const actions: string[] = actionMap[maxSeverity]
    if (!(maxSeverity in actionMap)) {
      await modmailErr(context,
        `A severity level defined in a violated Policy does not exist in actionMap`);
    } else {
      // apply the function corresponding to each action
      console.log("actions:" + actions)
      for (const a of actions) {
        actionFunctions[a](result, contentInfo, context)
      }
    }
  }
}

/**
 * Uses policy engine to return an EvaluationResult, but guarding for errors and 
 * surfacing them to modmail.
 * @returns EvaluationResult if successful, null otherwise
 */
async function safeEvaluate(
  {
    context,
    contentInfo, 
    contextList, 
    apiKey, 
    doEarlyExit,
    ignoreFailures,
  }: {
    context: TriggerContext,
    contentInfo: ContentInfo, 
    contextList?: string[], 
    apiKey: string, 
    doEarlyExit: boolean,
    ignoreFailures: boolean,
  }
): Promise<EvaluationResult | null> {
  try {
    // use policy engine to attempt to evaluate content
    const engine = await getEngine(context);
    const result: EvaluationResult = await engine.evaluate({
      text: contentInfo.text, 
      imageUrl: contentInfo.imgUrl,
      contextList: contextList, 
      apiKey: apiKey, 
      doEarlyExit: doEarlyExit
    });
    console.log("Content safely evaluated.")
    for (const v of result.violations) {
      console.log(`${v.node.display_name ?? "unnamed node"} (${v.node.type}) violation explanation:
        ${v.explanation}`
      )
    }
    return result;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    const status =
      err instanceof Error && "status" in err && typeof err.status === "number"
        ? err.status
        : null;

    if (status === 503) {
      console.warn(
        `LLM unavailable (503) while evaluating ${contentInfo.type} at ${contentInfo.link}`
      );
      if (!ignoreFailures) {
        const link = contentInfo.link ?? "<link could not be obtained>";
        await modmailErr(
          context,
          `This ${contentInfo.type} could not be automatically evaluated because the LLM service is temporarily unavailable due to high server load.
        Please review it manually:
        ${link}`,
        "Unable to evaluate: manual review needed"
        );
      }
      return null;
    }

    // In case of failure, send informative error to modmail.
    await modmailErr(
      context,
      `An error occurred trying to evaluate the ${contentInfo.type} at:
    ${contentInfo.link}
    If settings were recently changed, this could be a syntax error in your policy definition.
    If the error seems unexpected, contact parallax.moderator@gmail.com.
    Error: ${message}`
    );
    return null
  }
}

async function handleCommentCreate(
  event: TriggerEventType["CommentCreate"], 
  context: TriggerContext) {
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
  const ignoreFailures = await loadIgnoreFailuresFromSettings(context);

  console.log(`Evaluating comment: ${event.comment?.id}`);
  const result: EvaluationResult | null = await safeEvaluate({
    context: context,
    contentInfo: commentInfo, 
    contextList: commentThread, 
    apiKey: apiKey, 
    doEarlyExit: earlyExit,
    ignoreFailures: ignoreFailures,
  })

  if (result) {
    console.log("Evaluated comment. Trace: " + JSON.stringify(result.trace))
    resultApply(result, commentInfo, context);
  }
}

/**
 * Event listener for user comments. Uses PolicyEngine to do an evaluation and applies
 * relevant actions.
 */
Devvit.addTrigger({
  // Fires for new comments, including replies.
  event: "CommentCreate", 
  onEvent: async (event: TriggerEventType["CommentCreate"], context) => {
    let enabled = await context.settings.get("enabled");
    if (typeof enabled !== "boolean") {
      await modmailErr(context, `Invalid type for 'enabled' setting. Defaulting to false.`)
      enabled = false;
    }
    if (enabled) {
      console.log('CommentCreate event triggered');
      await handleCommentCreate(event, context)
    }
  },
});

async function handlePostCreate(
  event: TriggerEventType["PostCreate"], 
  context: TriggerContext) {
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
  const earlyExit = await loadEarlyExitFromSettings(context);
  const ignoreFailures = await loadIgnoreFailuresFromSettings(context);
  console.log(`Evaluating post: ${event.post?.id}`);
  const result: EvaluationResult | null = await safeEvaluate({
    context: context,
    contentInfo: postInfo, 
    apiKey: apiKey, 
    doEarlyExit: earlyExit,
    ignoreFailures: ignoreFailures,
  })

  if (result) {
    console.log("Evaluated post. Trace: " + JSON.stringify(result.trace))
    resultApply(result, postInfo, context);
  }
}

/**
 * Event listener for user posts. Uses PolicyEngine to do an evaluation and applies
 * relevant actions.
 */
Devvit.addTrigger({
  // Fires for newly created posts.
  event: "PostCreate",
  onEvent: async (event: TriggerEventType["PostCreate"], context) => {
    let enabled = await context.settings.get("enabled");
    if (typeof enabled !== "boolean") {
      await modmailErr(context, `Invalid type for 'enabled' setting. Defaulting to false.`)
      enabled = false;
    }
    if (enabled) {
      console.log('PostCreate event triggered');
      await handlePostCreate(event, context)
    }
  }
});

export default Devvit;
