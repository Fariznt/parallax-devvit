import { Devvit, ModNote } from "@devvit/public-api";
import type { FormField, TriggerEventType, Comment, TriggerContext } from "@devvit/public-api";
import { Policy, EvaluationResult, PolicyEngine }  from "./PolicyEngine.js";
import { handleNuke, handleNukePost } from "./nuke.js";

Devvit.addSettings([
  { // TODO remove; accessed with context.secrets...
    name: 'apiKey',
    label: 'OpenAI API Key',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  { // TODO dont forget to validate JSON; context.setings...
    name: 'policyJson',
    label: 'Policy File (JSON)',
    type: 'paragraph',
    scope: 'installation', 
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
]);

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});


// TODO got to have the interface between policy engine and moderation in this file.


// Loads context.settings.get("PolicyJson") into a Policy.
//
// Assumptions (based on your examples):
// - PolicyJson is either already an object OR a JSON string.
// - any_of / all_of are arrays of child policies.
// - not can be either a single policy OR (as in your YAML) a one-element array; we normalize to a single Policy.
// - Leaf nodes have a required `name` and then arbitrary keys whose values are either an object
//   (Record<string, unknown>) or an array of objects (Array<Record<string, unknown>>).





function normalizePolicy(x: unknown): Policy {
  if (!isObject(x)) throw new Error("Policy must be a JSON object.");

  // Branch nodes
  if ("any_of" in x) {
    const arr = (x as Record<string, unknown>)["any_of"];
    if (!Array.isArray(arr)) throw new Error(`"any_of" must be an array.`);
    return { any_of: arr.map(normalizePolicy) };
  }

  if ("all_of" in x) {
    const arr = (x as Record<string, unknown>)["all_of"];
    if (!Array.isArray(arr)) throw new Error(`"all_of" must be an array.`);
    return { all_of: arr.map(normalizePolicy) };
  }

  if ("not" in x) {
    const v = (x as Record<string, unknown>)["not"];

    // Allow your YAML-shaped case where `not:` points to a one-element list
    // (e.g., `not: [ { name: "...", ... } ]`), and normalize to single Policy.
    if (Array.isArray(v)) {
      if (v.length !== 1) throw new Error(`"not" array must have length 1.`);
      return { not: normalizePolicy(v[0]) };
    }

    return { not: normalizePolicy(v) };
  }

  // Leaf / named nodes
  const name = (x as Record<string, unknown>)["name"];
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`Leaf policy nodes must have a non-empty string "name".`);
  }

  const out: Record<string, unknown> = { name };

  // Optional next-check (normalize if present)
  if ("next-check" in x) {
    const nc = (x as Record<string, unknown>)["next-check"];
    if (nc !== undefined) out["next-check"] = normalizePolicy(nc);
  }

  // Copy other keys with minimal validation to fit your index signature:
  // Record<string, unknown> | Array<Record<string, unknown>>
  for (const [k, v] of Object.entries(x)) {
    if (k === "name" || k === "next-check") continue;

    if (Array.isArray(v)) {
      if (!v.every(isObject)) {
        throw new Error(
          `Key "${k}" must be an object or an array of objects.`
        );
      }
      out[k] = v as Array<Record<string, unknown>>;
    } else if (isObject(v)) {
      out[k] = v as Record<string, unknown>;
    } else {
      throw new Error(`Key "${k}" must be an object or an array of objects.`);
    }
  }

  return out as Policy;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}


// Actual, finalized file below. ===========================================================

type JsonObject = Record<string, unknown>;

let engine: PolicyEngine | undefined;


async function loadPolicyFromSettings(context: TriggerContext): Promise<JsonObject> {
  const raw = await context.settings.get("policyJson");
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error('Setting "PolicyJson" must be a non-empty string');
  }

  let parsed: JsonObject;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`"PolicyJson" is not valid JSON.`);
  }

  return parsed;
}

/**
 * Wrapper around PolicyEngine constructor for skipping repeated instantiation (minor optimization)
 * and abstracting away engine construction.
 * @returns PolicyEngine object encoding some policy and providing evaluation utility.
 */
async function getEngine(context: TriggerContext): Promise<PolicyEngine> {
  if (!engine) {
    const policyJson: JsonObject = await loadPolicyFromSettings(context);

    const modelName = await context.settings.get("llmName");
    if (typeof modelName !== "string" || modelName.length === 0) {
      throw new Error('Setting "llmName" must be a non-empty string');
    }

    const baseUrlRaw = await context.settings.get("llmURL");
    if (typeof baseUrlRaw !== "string" || baseUrlRaw.length === 0) {
      throw new Error('Setting "llmURL" must be a non-empty string');
    }
    const baseUrl = baseUrlRaw.replace(/\/+$/, "");

    engine = new PolicyEngine({
      policyJson,
      modelName,
      baseUrl,
    });

    engine.compile();
  }
  return engine;
}


// TODO warning, comment type might cause issues later. test thoroughly.
export async function getThread(context: TriggerContext, comment: { id: string; parentId?: string }): Promise<string[]> {
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

    const apiKey = await context.settings.get("apiKey");
    if (typeof apiKey !== "string") { throw new Error('Setting "apiKey" must be a string'); }

    const engine = await getEngine(context);
    const result = await engine.evaluateSingle({ text: text, history: commentThread, apiKey: apiKey });
    console.log('Evaluation result:', result);

    if (result.remove) {
      await context.reddit.remove(comment.id, false);
      await context.reddit.addRemovalNote({
        itemIds: [comment.id], 
        reasonId: "", // empty for now---may extract from trace in future
        modNote: result.modNote
      });
      // TODO: add/post removal reason rather than only mod logging?
      // call to a comment wrapper function here to reply to user
    }
  },
});

export default Devvit;
