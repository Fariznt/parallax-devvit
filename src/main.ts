import { Devvit, ModNote } from "@devvit/public-api";
import type { TriggerEventType, Comment, TriggerContext } from "@devvit/public-api";
import { PolicyEngine }  from "./PolicyEngine/engine.js";
import type { EvaluationResult } from "./PolicyEngine/types.js";

Devvit.addSettings([
  {
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
  }
  return engine;
}

async function getKey(context: TriggerContext): Promise<string> {
  const apiKey = await context.settings.get("apiKey");
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new Error('Setting "apiKey" must be a non-empty string');
  }
  return apiKey;
}

// TODO warning, comment type might cause issues later. test thoroughly.
async function getThread(context: TriggerContext, comment: { id: string; parentId?: string }): Promise<string[]> {
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

async function resultApply(result: EvaluationResult, contentId: string, context: TriggerContext): Promise<void> {
  if (result.violation) {
    await context.reddit.remove(contentId, false);
    await context.reddit.addRemovalNote({
      itemIds: [contentId], 
      reasonId: "", // empty for now---may extract from trace in future
      modNote: result.modNote
    });
    // alert modmail as needed
  }
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

    console.log("Evaluation text:" + text);

    const apiKey = await getKey(context);
    const engine = await getEngine(context);
    const result = await engine.evaluate({ text: text, history: commentThread, apiKey: apiKey, shortCircuit: false });
    console.log('Evaluation result:', result);
    resultApply(result, comment.id, context);
  },
});

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

    const apiKey = await getKey(context);
    const engine = await getEngine(context);
    const result = await engine.evaluate({ text: text, imageUrl: imgLink, history: null, apiKey: apiKey });
    console.log('Evaluation result:', result);

    resultApply(result, post.id, context);
  },
});

export default Devvit;
