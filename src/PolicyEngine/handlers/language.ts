import type { EvaluationState, Policy } from "../types.js";
import { assertLanguageCheck } from "../validator.js";

export function evalLanguage({
  evalState, // evaluation state (info accumulator)
	policyNode, // the node this was called for
	nextCheck, // function to do checks on a child node
  // content info and evaluation specifications
  doShortCircuit, // whether we do short-circuiting in logic nodes
  text,
  imageUrl,
  history,
  apiKey,
}: {
  evalState: EvaluationState;
	policyNode: Policy;
	nextCheck: (node: Policy) => void;
  doShortCircuit: boolean | null; 
  text: string;
  imageUrl?: string | null;
  history?: string[] | null;
  apiKey?: string;
}): void {
	console.warn('Language nodes are not implemented')
}
