import type { Policy } from "../types.js";
import type { EvaluationState, EvalRouter, NodeTrace, DeferredCheck, Violation } from "./types.js";
import {
  addToTrace,
} from "./utils.js"
import { assertSemanticCheck } from "../validator.js";

export function evalSemantic({
  evalState,
  policyNode, 
  negate,
  nodeAddress,
}: {
  evalState: EvaluationState;
  policyNode: Policy;
  negate: boolean;
  nodeAddress: string;
}): void {
  assertSemanticCheck(policyNode, nodeAddress);
  const nodeTrace: NodeTrace = addToTrace(evalState, policyNode, nodeAddress)

  const defCheck: DeferredCheck = {
    condition: policyNode.semantic_check.condition,
    negate: negate,
    severity: policyNode.severity,
    nodeTrace: nodeTrace
  }

  evalState.deferredChecks.push(defCheck)

  // no next checks is an enforced invariant. no other checks to do 
  // on this path

  nodeTrace.result = "deferred"
}

/**
 * Converts DeferredChecks into a JSON-ready input format for batched evaluation.
 *
 * Output shape:
 * {
 *   "semantics": [
 *     { "id": 1, "semantic": "..." },
 *     ...
 *   ]
 * }
 */
function getRuleJson(
  checks: Record<number, DeferredCheck>
): {
  conditions: { id: number; condition: string }[];
} {
  const conditions: { id: number; condition: string }[] = [];

  for (const [idStr, check] of Object.entries(checks)) {
    const id = Number(idStr);
    conditions.push({
      id,
      condition: check.condition
    });
  }

  // Optional but recommended: enforce stable ordering
  conditions.sort((a, b) => a.id - b.id);

  return { conditions };
}


// TODO: make better system prompt, this is testing from my python prototype
/**
 * Builds the system prompt to an LLM for a batched semantic check.
 * @param checks 
 * @returns 
 */
function buildSystemPrompt(checks: Record<number, DeferredCheck>): string {
  const conditions = JSON.stringify(getRuleJson(checks))
  return (
    `For each of the conditions in the following conditions JSON, 
    evaluate the target text on whether it fulfills the condition.
    ${conditions} 

    The context to consider will be provided between 
    'CONTEXT_START' and 'CONTEXT_END'
    Likewise, the target text to evaluate under the conditions will be provided between
    'TEXT_START' and 'TEXT_END'.

    Your response should be in strict JSON format with no newlines, markdown, or backticks. 
    You MUST output NO other text beyond JSON text in this format.
    You must adhere to the following format, with one entry in "results" for each condition:

    {
      "results": [
        {
          "id": <number>,
          "match": <boolean>,
          "explanation": "<string>"
        }
      ]
    }
    
    Format rules:
    -"results" should have exactly one corresponding entry for each condition provided.
    -The <number> for "id" should be exactly the "id" provided for the condition in the conditions JSON
    -The <boolean> for "match" should be true if the condition is met, false otherwise.
    -The <string> for "explanation" should be a concise notes-style justification of your choice
    `
  );
}

/**
 * Makes a call to the given url (assumed to be an OpenAPI-compatible LLM API endpoint) with
 * the given model name, api key, and content, and returns the LLM output as string.
 * @param context If present with multiple parties, expected to be marked with user identifiers
 * @param text Target content being evaluated; if context present with multiple parties, 
 * text must mark with an identifier for differentiation from context semantics
 */
async function fetchLLMResponse(
  apiKey: string, 
  url: string, 
  model: string, 
  context: string | null, 
  systemPrompt: string, 
  text: string
): Promise<string> {

  const messages = [
      { role: "system" as const, content: systemPrompt },
      ...(context !== null // optional context messages
          ? [{ role: "user" as const, content: context }]
          : []),
      { role: "user" as const, content: text },
  ];

  console.log('messages: ' + JSON.stringify(messages));
  const response = await fetch(url, {
      method: "POST",
      headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
          model,
          messages,
          temperature: 0,
      }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  console.log(data);

  return data.choices[0].message.content;
}

/**
 * Parse LLM-produced JSON string into a javascript objects.
 * Errors if JSON is invalid.
 * @param rawResponse Raw response from LLM being parsed
 * @param model Included for informative error
 * @param baseUrl Included for informative error
 * @returns 
 */
function safeParse(rawResponse: string, model: string, baseUrl: string): any {
  try {
    const parsed: any = JSON.parse(rawResponse);
    return parsed
  } catch (err) {
    const e = err as Error;

    const trimmed = rawResponse.trim();
    const max = 800;

    const prefix = trimmed.slice(0, Math.min(max, trimmed.length));
    const suffix =
      trimmed.length > max ? trimmed.slice(Math.max(0, trimmed.length - 200)) : "";

    const details = [
      "LLM did not return valid JSON.",
      `parseError=${e?.message ?? String(err)}`,
      `model=${model}`,
      `baseUrl=${baseUrl}`,
      `chars=${rawResponse.length}`,
      `prefix=${JSON.stringify(prefix)}`,
      suffix ? `suffix=${JSON.stringify(suffix)}` : null,
    ]
      .filter(Boolean)
      .join(" ");

    throw new Error(details, { cause: err });
  }
}

// TODO: adjust in accordance with changes to system prompt
/**
 * Validates the LLM's output JSON as validly shaped for use in generating
 * final outputs.
 */
export function validateResponseShape(data: unknown): asserts data is {
  results: { id: number; match: boolean; explanation: string }[];
} {
  const fail = (): never => {
    throw new Error(
      `LLM formatted the JSON incorrectly.\n\nJSON:\n${JSON.stringify(data, null, 2)}`
    );
  };

  if (typeof data !== "object" || data === null) fail();

  const d = data as Record<string, unknown>;
  if (!("results" in d) || !Array.isArray(d.results)) fail();

  const results = d.results as unknown[]; // safe after Array.isArray check
  for (const r of results) {
    if (typeof r !== "object" || r === null) fail();

    const rec = r as Record<string, unknown>;
    if (typeof rec.id !== "number" || !Number.isFinite(rec.id)) fail();
    if (typeof rec.match !== "boolean") fail();
    if (typeof rec.explanation !== "string") fail();
  }
}

export async function doDeferredChecks(
  evalState: EvaluationState,
  contextList: string[] | null, // usually, thread history
  targetText: string,
  baseUrl: string,
  model: string,
  key: string,
): Promise<void> {
  // let checks: DeferredCheck[] = evalState.deferredChecks
  const checks: Record<number, DeferredCheck> =
    Object.fromEntries(evalState.deferredChecks.map((v, i) => [i + 1, v]));

  // Organize input to LLM
  const systemPrompt = buildSystemPrompt(checks);
  const context = contextList ? `CONTEXT_START\n${contextList.join("\n")}\nCONTEXT_END` : null;
  const target = `TARGET_START\n${targetText}\nTARGET_END`;

  // Fetch response
  const rawResponse = await fetchLLMResponse(
    key,
    baseUrl,
    model,
    context,
    systemPrompt,
    target
  );

  // Parse and validate
  let parsed: unknown = safeParse(rawResponse, model, baseUrl)
  validateResponseShape(parsed)

  // Apply results to the evaluation state
  const results = parsed.results
  for (const item of results) {
    const id = item.id;
    const match = item.match;
    const explanation = item.explanation;

    const check = checks[id] 

    const violated = check.negate ? match : !match
    if (violated) {
      const violation: Violation = {
        node: check.nodeTrace,
        explanation: explanation,
        severity: check.severity
      }
      evalState.violations.push(violation)
      check.nodeTrace.result = "fail"
    } else {
      check.nodeTrace.result = "pass"
    }
  }
}



