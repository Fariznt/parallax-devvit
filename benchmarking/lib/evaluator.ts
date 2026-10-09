// The only module coupled to the policy engine. Other evaluators (e.g. a raw LLM
// classifier baseline) can be added alongside as long as they return an Evaluation.
import { PolicyEngine } from "../../src/PolicyEngine/engine.js";
import type { Evaluation } from "./types.js";

export type Evaluator = (text: string) => Promise<Evaluation>;

/**
 * Build an Evaluator that runs a PDN policy through PolicyEngine. Validates the policy
 * immediately (throws on invalid PDN, or an LLM-using policy without an API key).
 */
export function createParallaxEvaluator(
  policy: Record<string, unknown>,
  { modelName, baseUrl, apiKey, earlyExit }: {
    modelName: string;
    baseUrl: string;
    apiKey: string | null;
    earlyExit: boolean;
  }
): Evaluator {
  if (apiKey === null && usesLLM(policy)) {
    throw new Error("policy has semantic_check nodes and needs an LLM; set KEY in benchmarking/.env or pass --api-key");
  }
  // the engine normalizes the policy in place, so give it its own copy
  const engine = new PolicyEngine(structuredClone(policy), { modelName, baseUrl });

  return async (text) => {
    const result = await engine.evaluate({
      text,
      imageUrl: null,
      contextList: null,
      apiKey,
      doEarlyExit: earlyExit,
    });
    return {
      violation: result.violation,
      llmCalled: result.trace.some(node => node.type === "semantic_check"),
      result,
    };
  };
}

/** Whether any node in the policy tree is a semantic_check */
function usesLLM(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  if ("semantic_check" in node) return true;
  return Object.values(node).some(usesLLM);
}
