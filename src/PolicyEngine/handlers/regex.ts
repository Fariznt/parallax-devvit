import type { EvaluationState, Policy } from "../types.js";
import { assertRegexCheck } from "../validator.js";

export function evalRegex({
  evalState,
	policyNode,
	doNextCheck, 
  doShortCircuit, 
  text,
  imageUrl,
  history,
  apiKey,
}: {
  evalState: EvaluationState;
	policyNode: Policy;
	nodeAddress: string;
	doNextCheck: (node: Policy, nodeAddress: string) => void;
  doShortCircuit: boolean | null; 
  text: string;
  imageUrl?: string | null;
  history?: string[] | null;
  apiKey?: string;
}): void {
	console.warn('Regex nodes are not implemented')
}
