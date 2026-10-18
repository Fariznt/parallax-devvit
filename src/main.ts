import { Devvit, ModNote } from "@devvit/public-api";
import { PolicyEngine }  from "./PolicyEngine/engine.js";
import { 
  loadActionMapFromSettings, 
  loadEarlyExitFromSettings, 
  loadLlmSettings,
  loadPolicyFromSettings,
} from "./settings-loader.js";
import { actionFunctions, modmailErr } from "./action-functions.js";
import type { TriggerEventType, Comment, TriggerContext } from "@devvit/public-api";
import type { EvaluationResult, Violation } from "./PolicyEngine/handlers/types.js";
import type { ModelConfig } from "./PolicyEngine/types.js"
import type { SeverityActionMap, ContentInfo } from "./types.js";
import type { LlmSettings } from "./settings-loader.js";

Devvit.configure({
  redditAPI: true,
  http: true,
});

Devvit.addSettings([
  // App-level settings, set by the developer via `devvit settings set <name>`
  {
    name: 'apiKey',
    label: 'Default LLM API Key',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  {
    // optional; defaults to the Gemini OpenAI-compatible endpoint
    name: 'defaultLlmURL',
    label: 'Default LLM Base URL',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  {
    // optional; defaults to gemini-3.5-flash-lite
    name: 'defaultLlmName',
    label: 'Default LLM Model Name',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  {
    // optional; e.g. 'none' for reasoning models that only accept temperature 0 without reasoning
    name: 'defaultLlmReasoningEffort',
    label: 'Default LLM Reasoning Effort',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  {
    // premium settings are used together for subreddits listed in premiumSubreddits
    name: 'premiumApiKey',
    label: 'Premium LLM API Key',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  {
    name: 'premiumLlmURL',
    label: 'Premium LLM Base URL',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  {
    name: 'premiumLlmName',
    label: 'Premium LLM Model Name',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  {
    // optional
    name: 'premiumLlmReasoningEffort',
    label: 'Premium LLM Reasoning Effort',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  {
    // comma-separated subreddit names
    name: 'premiumSubreddits',
    label: 'Subreddits using the premium key',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  // Installation-level settings, set by mods
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
    name: 'overrideApiKey',
    label: 'LLM API Key Override (optional)',
    helpText: 'Use your own OpenAI or Gemini key. Visible to mods with config access. ' +
      'The URL and model overrides below only apply when this is set.',
    type: 'string',
    scope: 'installation',
  },
  {
    name: 'overrideLlmURL',
    label: 'LLM Base URL Override (optional)',
    helpText: 'OpenAI-compatible chat completions endpoint. Defaults to Gemini.',
    type: 'string',
    scope: 'installation',
  },
  {
    name: 'overrideLlmName',
    label: 'LLM Model Name Override (optional)',
    type: 'string',
    scope: 'installation',
  },
  {
    name: 'overrideLlmReasoningEffort',
    label: 'LLM Reasoning Effort Override (optional)',
    helpText: "Sent as reasoning_effort.",
    type: 'string',
    scope: 'installation',
  },
  {
    name: 'earlyExit',
    label: `Early Exiting in 'all_of'`,
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
  }
]);

let engine: PolicyEngine | undefined;
let engineConfigKey: string | undefined;

/**
 * Wrapper around PolicyEngine constructor for skipping repeated instantiation (minor optimization)
 * and abstracting away engine construction. The engine is rebuilt whenever the subreddit,
 * policy, or model config changes, so the URL and model always match the key resolved for this event.
 * @returns PolicyEngine object encoding some policy and providing evaluation utility.
 */
async function getEngine(context: TriggerContext, llm: LlmSettings): Promise<PolicyEngine> {
  const policyJson: Record<string, unknown> = await loadPolicyFromSettings(context);
  const configKey = JSON.stringify(
    [context.subredditName, policyJson, llm.baseUrl, llm.modelName, llm.reasoningEffort]
  );
  if (!engine || engineConfigKey !== configKey) {
    const config: ModelConfig = {
      modelName: llm.modelName,
      baseUrl: llm.baseUrl,
      reasoningEffort: llm.reasoningEffort,
    };
    engine = new PolicyEngine(policyJson, config, 100);
    engineConfigKey = configKey;
  }
  return engine;
}

/** 0 -> A, 25 -> Z, 26 -> AA, ... */
function threadLabel(index: number): string {
  let label = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  }
  return label;
}

async function getThread(
  context: TriggerContext, comment: { id: string; parentId?: string }
): Promise<string[]> {
  let current = comment;
  const chain = [];

  while (current.parentId?.startsWith('t1_')) {
    const parent = await context.reddit.getCommentById(current.parentId);
    if (parent && parent.body) {
      chain.push({ authorId: parent.authorId ?? "Unknown User", text: parent.body });
    }
    current = parent;
  }
  chain.reverse();

  // Replace account IDs with per-thread labels (User A, User B, ...) before anything
  // is sent sent over network (data safety)
  const labels = new Map<string, string>();
  return chain.map(({ authorId, text }) => {
    if (!authorId) return `Unknown User: ${text}`;
    let label = labels.get(authorId);
    if (!label) {
      label = `User ${threadLabel(labels.size)}`;
      labels.set(authorId, label);
    }
    return `${label}: ${text}`;
  });
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
    doEarlyExit  
  }: {
    context: TriggerContext,
    contentInfo: ContentInfo, 
    contextList?: string[], 
    doEarlyExit: boolean 
  }
): Promise<EvaluationResult | null> {
  try {
    // resolve key, URL, and model together so the key only goes to its matching URL
    const llm: LlmSettings = await loadLlmSettings(context);
    console.log(`LLM settings: source=${llm.source} model=${llm.modelName} url=${llm.baseUrl} ` +
      `reasoning_effort=${llm.reasoningEffort ?? "(not sent)"}`);
    // use policy engine to attempt to evaluate content
    const engine = await getEngine(context, llm);
    const result: EvaluationResult = await engine.evaluate({
      text: contentInfo.text, 
      imageUrl: contentInfo.imgUrl,
      contextList: contextList, 
      apiKey: llm.apiKey, 
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
    // In case of failure, send informative error to modmail.
    let message = "Unknown error";

    if (err instanceof Error) {
      message = err.message;
    } else if (typeof err === "string") {
      message = err;
    }
    await modmailErr(context,
    `An error occurred trying to evaluate the ${contentInfo.type} at:
    ${contentInfo.link}
    If settings were recently changed, this could be a syntax error in your policy definition.
    If the error seems unexpected, contact parallax.moderator@gmail.com.
    Error: ${message}`
    )
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
  
  const earlyExit = await loadEarlyExitFromSettings(context);

  const result: EvaluationResult | null = await safeEvaluate({
    context: context,
    contentInfo: commentInfo, 
    contextList: commentThread, 
    doEarlyExit: earlyExit
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
  event: "CommentCreate", // TODO: include posts
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

  const earlyExit = await loadEarlyExitFromSettings(context)
  const result: EvaluationResult | null = await safeEvaluate({
    context: context,
    contentInfo: postInfo, 
    doEarlyExit: earlyExit
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
