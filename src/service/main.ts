import { Devvit, ModNote } from "@devvit/public-api";
import { PolicyEngine }  from "./PolicyEngine/engine.js";
import { 
  loadActionMapFromSettings, 
  loadEarlyExitFromSettings, 
  loadIgnoreFailuresFromSettings,
  loadPolicyFromSettings,
  loadLlmSettings,
  loadRetryMinutesFromSettings,
} from "./settings-loader.js";
import { actionFunctions, modmailErr } from "./action-functions.js";
import { LlmCallError } from "./PolicyEngine/handlers/semantic.js";
import type { TriggerEventType, Comment, Post, TriggerContext } from "@devvit/public-api";
import type { EvaluationResult, Violation } from "./PolicyEngine/handlers/types.js";
import type { ModelConfig } from "./PolicyEngine/types.js"
import type { SeverityActionMap, ContentInfo } from "./types.js";
import type { LlmSettings } from "./settings-loader.js";

Devvit.configure({
  redditAPI: true,
  http: true,
  redis: true,
});

// immediate retries with backoff, for brief LLM blips
const QUICK_RETRIES = 2;
// delayed retries after quick retries are used up, spaced by the "llmRetryMinutes" setting
const MAX_SCHEDULED_RETRIES = 3;
const RETRY_JOB = "retryEvaluation";

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
    // name kept from when this only covered 503s, so existing installs keep their value
    name: "ignoreFailures",
    label: "Silence LLM Failure Reports",
    helpText: "Don't send modmail when a post/comment can't be evaluated because the LLM " +
      "request failed (after any retries). Policy and settings errors are still reported.",
    type: "boolean",
    defaultValue: false,
    scope: 'installation',
  },
  {
    name: 'llmRetryMinutes',
    label: 'LLM Failure Retry Interval (minutes)',
    helpText: `After an LLM request fails (e.g. the provider is overloaded), wait this long before ` +
      `re-evaluating the post/comment. Retried up to ${MAX_SCHEDULED_RETRIES} times. 0 disables retries.`,
    type: 'number',
    defaultValue: 60,
    scope: 'installation',
    onValidate: ({ value }) =>
      value !== undefined && (!Number.isFinite(value) || value < 0) ? 'Must be 0 or more' : undefined,
  },
  {
    name: 'remMailOnApproveRemove',
    label: 'Remove Related Modmail On Modqueue Approve/Remove',
    helpText: `Removes u/Automoderator or u/policy-agent modmail related to a post/comment upon its approval/removal in custom modqueue.`,
    type: 'boolean',
    defaultValue: false,
    scope: 'installation',
  },
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
 * Runs engine.evaluate, retrying retryable LLM failures up to QUICK_RETRIES times
 * with exponential backoff.
 */
async function evaluateWithBackoff(
  engine: PolicyEngine,
  args: Parameters<PolicyEngine["evaluate"]>[0]
): Promise<EvaluationResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await engine.evaluate(args);
    } catch (err) {
      if (!(err instanceof LlmCallError) || !err.retryable || attempt >= QUICK_RETRIES) throw err;
      // ~1s, then ~2s, with jitter
      const delayMs = 1000 * 2 ** attempt * (0.5 + Math.random());
      console.warn(`LLM request failed (${err.message}); retrying in ${Math.round(delayMs)}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

type RetryJobData = {
  type: ContentInfo["type"];
  id: string;
  scheduledRetries: number; // including the one this job runs
};

/**
 * Schedules RETRY_JOB to re-evaluate the content after the "llmRetryMinutes" setting,
 * unless retries are disabled or used up.
 * @returns whether a retry was scheduled
 */
async function scheduleRetry(
  context: TriggerContext,
  contentInfo: ContentInfo,
  scheduledRetries: number
): Promise<boolean> {
  try {
    const retryMinutes = await loadRetryMinutesFromSettings(context);
    if (!contentInfo.id || retryMinutes === 0 || scheduledRetries >= MAX_SCHEDULED_RETRIES) {
      return false;
    }
    const data: RetryJobData = {
      type: contentInfo.type,
      id: contentInfo.id,
      scheduledRetries: scheduledRetries + 1,
    };
    await context.scheduler.runJob({
      name: RETRY_JOB,
      data,
      runAt: new Date(Date.now() + retryMinutes * 60_000),
    });
    console.warn(`Scheduled retry ${data.scheduledRetries}/${MAX_SCHEDULED_RETRIES} for ` +
      `${contentInfo.type} ${contentInfo.id} in ${retryMinutes} min`);
    return true;
  } catch (err) {
    console.error("Failed to schedule evaluation retry:", err);
    return false;
  }
}

/**
 * Uses policy engine to return an EvaluationResult, but guarding for errors and
 * surfacing them to modmail. Failed LLM requests are retried right away with backoff,
 * then rescheduled with scheduleRetry, and only reported once both are used up.
 * @returns EvaluationResult if successful, null otherwise
 */
async function safeEvaluate(
  {
    context,
    contentInfo,
    contextList,
    doEarlyExit,
    ignoreFailures,
    scheduledRetries,
  }: {
    context: TriggerContext,
    contentInfo: ContentInfo,
    contextList?: string[],
    doEarlyExit: boolean,
    ignoreFailures: boolean,
    scheduledRetries: number, // scheduled retries already done for this content
  }
): Promise<EvaluationResult | null> {
  try {
    // resolve key, URL, and model together so the key only goes to its matching URL
    const llm: LlmSettings = await loadLlmSettings(context);
    console.log(`LLM settings: source=${llm.source} model=${llm.modelName} url=${llm.baseUrl} ` +
      `reasoning_effort=${llm.reasoningEffort ?? "(not sent)"}`);
    // use policy engine to attempt to evaluate content
    const engine = await getEngine(context, llm);
    const result: EvaluationResult = await evaluateWithBackoff(engine, {
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
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";

    if (err instanceof LlmCallError) {
      if (err.retryable && await scheduleRetry(context, contentInfo, scheduledRetries)) {
        return null;
      }
      console.warn(
        `LLM request failed while evaluating ${contentInfo.type} at ${contentInfo.link}: ${message}`
      );
      if (!ignoreFailures) {
        const link = contentInfo.link ?? "<link could not be obtained>";
        const retried = scheduledRetries > 0 ? ` after ${scheduledRetries} scheduled retries` : "";
        await modmailErr(
          context,
          `This ${contentInfo.type} could not be automatically evaluated because the LLM request failed${retried}.
        Please review it manually:
        ${link}
        Error: ${message}`,
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

/** Comment fields used for evaluation, common to trigger payloads and fetched Comments */
type CommentFields = {
  id: string;
  body: string;
  parentId?: string;
  permalink: string;
  authorName?: string;
};

/**
 * Reads the "enabled" setting, reporting it and defaulting to false if malformed.
 */
async function isEnabled(context: TriggerContext): Promise<boolean> {
  const enabled = await context.settings.get("enabled");
  if (typeof enabled !== "boolean") {
    await modmailErr(context, `Invalid type for 'enabled' setting. Defaulting to false.`)
    return false;
  }
  return enabled;
}

async function evaluateComment(
  comment: CommentFields,
  context: TriggerContext,
  scheduledRetries: number) {
  const text = comment.body;
  if (!text) return;
  const commentThread: string[] = await getThread(context, comment);

  const commentInfo: ContentInfo = {
    username: comment.authorName ?? null,
    id: comment.id,
    text: text,
    link: comment.permalink,
    imgUrl: null,
    type: "comment"
  }

  const earlyExit = await loadEarlyExitFromSettings(context);
  const ignoreFailures = await loadIgnoreFailuresFromSettings(context);

  console.log(`Evaluating comment: ${comment.id}`);
  const result: EvaluationResult | null = await safeEvaluate({
    context: context,
    contentInfo: commentInfo,
    contextList: commentThread,
    doEarlyExit: earlyExit,
    ignoreFailures: ignoreFailures,
    scheduledRetries: scheduledRetries,
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
    const comment = event.comment;
    if (comment && await isEnabled(context)) {
      console.log('CommentCreate event triggered');
      await evaluateComment({
        id: comment.id,
        body: comment.body,
        parentId: comment.parentId,
        permalink: comment.permalink,
        authorName: event.author?.name,
      }, context, 0)
    }
  },
});

async function evaluatePost(
  post: Post,
  context: TriggerContext,
  scheduledRetries: number) {
  const body = post.body ? post.body.trim() : "No Body";
  const title = post.title.trim();
  const text =
    `POST TITLE:\n${title}\n\n` +
    `POST BODY:\n${body}`;

  const enrichedThumbnail = await post.getEnrichedThumbnail();
  const imgLink = enrichedThumbnail?.image.url ?? null;

  const postInfo: ContentInfo = {
    username: post.authorName ?? null,
    id: post.id,
    text: text,
    link: post.permalink,
    imgUrl: imgLink,
    type: "post"
  }

  const earlyExit = await loadEarlyExitFromSettings(context);
  const ignoreFailures = await loadIgnoreFailuresFromSettings(context);
  console.log(`Evaluating post: ${post.id}`);
  const result: EvaluationResult | null = await safeEvaluate({
    context: context,
    contentInfo: postInfo,
    doEarlyExit: earlyExit,
    ignoreFailures: ignoreFailures,
    scheduledRetries: scheduledRetries,
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
    if (await isEnabled(context)) {
      console.log('PostCreate event triggered');
      const post = event.post ? await context.reddit.getPostById(event.post.id) : null;
      if (!post) {
        console.warn("PostCreate fired without post payload");
        return;
      }
      await evaluatePost(post, context, 0)
    }
  }
});

/**
 * Re-evaluates content whose LLM request failed earlier (see scheduleRetry), unless a
 * mod has already actioned it in the meantime.
 */
Devvit.addSchedulerJob<RetryJobData>({
  name: RETRY_JOB,
  onRun: async (event, context) => {
    const data = event.data;
    if (!data || !(await isEnabled(context))) return;
    console.log(`Retrying evaluation of ${data.type} ${data.id} ` +
      `(retry ${data.scheduledRetries}/${MAX_SCHEDULED_RETRIES})`);

    // skip anything a mod removed or approved since it was first evaluated
    const alreadyActioned = (c: Comment | Post) => c.removed || c.spam || c.approved;
    if (data.type === "comment") {
      const comment = await context.reddit.getCommentById(data.id);
      if (alreadyActioned(comment)) {
        console.log(`comment ${data.id} was already actioned; skipping retry`);
        return;
      }
      await evaluateComment(comment, context, data.scheduledRetries);
    } else {
      const post = await context.reddit.getPostById(data.id);
      if (alreadyActioned(post)) {
        console.log(`post ${data.id} was already actioned; skipping retry`);
        return;
      }
      await evaluatePost(post, context, data.scheduledRetries);
    }
  },
});

export default Devvit;
