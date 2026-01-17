import type { EvaluationState, Policy } from "../types.js";
import { assertSafetyCheck } from "../validator.js";

export function evalSafety({
  evalState, // evaluation state (info accumulator)
	policyNode, // the node this was called for
	evalNode, // function to do checks on a child node
  // content info and evaluation specifications
  doEarlyExit, // whether we do short-circuiting in all_of nodes or accumulate ALL violations
  text,
  imageUrl,
}: {
  evalState: EvaluationState;
	policyNode: Policy;
	nodeAddress: string;
	evalNode: (node: Policy, parentAddress: string) => void;
  doEarlyExit: boolean | null; 
  text: string;
  imageUrl?: string | null;
}): void {
	console.warn('Safety nodes are not implemented')

}
