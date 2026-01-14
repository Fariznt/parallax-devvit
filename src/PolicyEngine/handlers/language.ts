import type { EvaluationState, Policy } from "../types.js";
import { assertLanguageCheck } from "../validator.js";

export function evalLanguage({
  evalState, 
	policyNode, 
	evalNode,
  doEarlyExit, 
  text,
  imageUrl,
  history,
  apiKey,
}: {
  evalState: EvaluationState;
	policyNode: Policy;
	nodeAddress: string;
	evalNode: (node: Policy, parentAddress: string) => void;
  doEarlyExit: boolean | null; 
  text: string;
  imageUrl?: string | null;
  history?: string[] | null;
  apiKey?: string;
}): void {
	console.warn('Language nodes are not implemented')
}
