import type { EvaluationState, Policy } from "../types.js";
import { assertAnyOf, assertAllOf, assertNot } from "../validator.js";
// TODO import asserts
// TODO use `${path}/${nodeLabel(x.next_check)}`

export function evalAllOf({
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

	// const id: NodeIdentifier = {
	//     display_name: p.name,
	//     address: (p.name ?? "all_of") + evalState.parentAddress
	//     type: "all_of" 
	// }
	// // assertAnyOf(policyNode);
	// const origViolationCount = evalState.violations.length
	// for (p of policyNode.any_of) {
	// 	nextCheck(p);
	// 	if (evalState.violations.length > origViolationCount && doShortCircuit) {
	// 		evalState.shortCircuitOccurred = true
	// 		break
	// 	}
	// }


}

export function evalAnyOf({
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

}

export function evalNot({
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

}

