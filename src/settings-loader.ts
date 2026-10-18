import type { TriggerContext } from "@devvit/public-api";
import type { SeverityActionMap } from "./types.js"
import { modmailErr } from "./action-functions.js";

const ACTIONS = new Set([
  'sendModmail',
  'sendModqueue',
  'remove',
  // 'ban',
]);

export function validateSeverityActions(parsed: unknown): SeverityActionMap {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SeverityActionMap must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;
  const result: SeverityActionMap = {};

  for (const [rawKey, value] of Object.entries(obj)) {
    const keyTrimmed = rawKey.trim();
    if (keyTrimmed === "") {
      throw new Error("Severity key cannot be empty");
    }

    // Convert JSON key -> number severity
    const severity = Number(keyTrimmed);
    if (!Number.isFinite(severity)) {
      throw new Error(
        `Severity key "${rawKey}" must be a finite number (e.g., "1", "10", "0.5")`
      );
    }

    if (!Array.isArray(value)) {
      throw new Error(
        `Severity "${rawKey}" must map to an array of actions from [${[...ACTIONS].join(", ")}]`
    );
    }

    const actions: string[] = [];

    for (const action of value) {
      if (typeof action !== "string") {
        throw new Error(
          `Invalid action for severity "${rawKey}": 
          actions must be strings from [${[...ACTIONS].join(", ")}]`
        );
      }

      if (!ACTIONS.has(action)) {
        throw new Error(
          `Invalid action "${action}" for severity "${rawKey}". ` +
            `Allowed actions: ${Array.from(ACTIONS).join(", ")}, ban:<number of days>`
        );
      }

      actions.push(action);
    }

    result[severity] = actions;
  }

  return result;
}

export async function loadActionMapFromSettings(
  context: TriggerContext
): Promise<SeverityActionMap | null> {
  const raw = await context.settings.get("actionJson");
  if (!raw) return null;

  if (typeof raw !== "string") {
    modmailErr(context, 'Setting "actionJson" must be a string');
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    modmailErr(context, '"actionJson" is not valid JSON');
    return null;
  }

  const validated = validateSeverityActions(parsed);
  return validated;
}



export async function loadPolicyFromSettings(
    context: TriggerContext
): Promise<Record<string, unknown>> {
  const raw = await context.settings.get("policyJson");
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error('Setting "PolicyJson" must be a non-empty string');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`"PolicyJson" is not valid JSON: ${err.message}`);
    }
    throw err;
  }

  return parsed;
}

export async function loadEarlyExitFromSettings(
    context: TriggerContext
): Promise<boolean> {
  const earlyExit = await context.settings.get("earlyExit");
  if (typeof earlyExit !== "boolean") {
    throw new Error('Setting "earlyExit" must be a boolean');
  }
  return earlyExit
}

const DEFAULT_LLM_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEFAULT_LLM_NAME = "gemini-3.5-flash-lite";

export interface LlmSettings {
  source: "override" | "premium" | "default"; // which settings group was used
  apiKey: string;
  modelName: string;
  baseUrl: string;
  reasoningEffort?: string; // sent as reasoning_effort only when set
}

async function getString(context: TriggerContext, name: string): Promise<string | null> {
  const value = await context.settings.get(name);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Whether this subreddit is listed in the app-scoped "premiumSubreddits" setting.
 */
async function isPremiumSubreddit(context: TriggerContext): Promise<boolean> {
  const premiumSubreddits = await getString(context, "premiumSubreddits");
  const subredditName = context.subredditName?.toLowerCase();
  if (!premiumSubreddits || !subredditName) return false;
  return premiumSubreddits
    .split(",")
    .map((s) => s.trim().replace(/^r\//i, "").toLowerCase())
    .includes(subredditName);
}

/**
 * Resolves the key, base URL, and model to use for this subreddit, in order of priority:
 * 1. Installation overrides, only if the subreddit provides its own key. URL and model
 *    overrides are ignored otherwise, so the app's key is never sent to a mod-defined URL
 *    and mods can't pick a costlier model on the app's key.
 * 2. App-level premium settings, for subreddits listed in "premiumSubreddits".
 * 3. App-level defaults.
 */
export async function loadLlmSettings(context: TriggerContext): Promise<LlmSettings> {
  const defaultUrl = await getString(context, "defaultLlmURL") ?? DEFAULT_LLM_URL;
  const defaultName = await getString(context, "defaultLlmName") ?? DEFAULT_LLM_NAME;
  const defaultEffort = await getString(context, "defaultLlmReasoningEffort");

  let settings: LlmSettings;
  const overrideKey = await getString(context, "overrideApiKey");
  if (overrideKey) {
    settings = {
      source: "override",
      apiKey: overrideKey,
      baseUrl: await getString(context, "overrideLlmURL") ?? defaultUrl,
      modelName: await getString(context, "overrideLlmName") ?? defaultName,
      reasoningEffort: await getString(context, "overrideLlmReasoningEffort") ?? defaultEffort ?? undefined,
    };
  } else if (await isPremiumSubreddit(context)) {
    const apiKey = await getString(context, "premiumApiKey");
    const baseUrl = await getString(context, "premiumLlmURL");
    const modelName = await getString(context, "premiumLlmName");
    if (!apiKey || !baseUrl || !modelName) {
      throw new Error(
        `r/${context.subredditName} is listed in "premiumSubreddits" but ` +
        `"premiumApiKey", "premiumLlmURL", and "premiumLlmName" are not all set`
      );
    }
    const reasoningEffort = await getString(context, "premiumLlmReasoningEffort") ?? undefined;
    settings = { source: "premium", apiKey, baseUrl, modelName, reasoningEffort };
  } else {
    const apiKey = await getString(context, "apiKey");
    if (!apiKey) {
      throw new Error('Setting "apiKey" must be a non-empty string');
    }
    settings = { source: "default", apiKey, baseUrl: defaultUrl, modelName: defaultName, reasoningEffort: defaultEffort ?? undefined };
  }

  settings.baseUrl = settings.baseUrl.replace(/\/+$/, "");
  // providers only accept lowercase values, e.g. OpenAI rejects "None" but accepts "none"
  settings.reasoningEffort = settings.reasoningEffort?.toLowerCase();
  return settings;
}
