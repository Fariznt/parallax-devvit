import type { EvaluationState, Policy } from "../types.js";
import { assertLanguageCheck } from "../validator.js";

export function evalLanguage({
  evalState,
  policyNode, 
  negate,
  nodeAddress,
  evalNode,
  doEarlyExit,
  text,
  imageUrl,
  history,
  models,
  apiKeys,
}: {
  evalState: EvaluationState;
  policyNode: Policy;
  negate: boolean;
  nodeAddress: string;
  evalNode: (
  node: Policy, negate: boolean, parentAddress: string
  ) => void;
  doEarlyExit: boolean | null; 
  text: string;
  imageUrl?: string | null;
  history?: string[] | null;
  // models?: ModelRegistry;
  // apiKeys?: ApiKeys;
}): void {
	console.warn('Language nodes are not implemented')
}
