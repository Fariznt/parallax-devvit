import type { EvaluationState, Policy, NodeIdentifier } from "../types.js";
import { assertAnyOf, assertAllOf, assertNot } from "../validator.js";

export function evalAllOf({
  evalState,
	policyNode,
  nodeAddress,
	evalNode, 
  doShortCircuit, 
}: {
  evalState: EvaluationState;
	policyNode: Policy;
	nodeAddress: string;
	evalNode: (node: Policy, parentAddress: string) => void;
  doShortCircuit: boolean | null; 
}): void {
  assertAllOf(policyNode, nodeAddress);

	const origViolationCount = evalState.violations.length

	for (const p of policyNode.all_of) {
    evalNode(p, nodeAddress)
		if (evalState.violations.length > origViolationCount && doShortCircuit) {
			evalState.shortCircuitOccurred = true
			break
		}
	}

  const id: NodeIdentifier = {
      display_name: policyNode.name,
      address: nodeAddress,
      type: "all_of" 
  }
  evalState.trace.push(id)
}

export function evalAnyOf({
  evalState,
	policyNode,
  nodeAddress,
	evalNode, 
  doShortCircuit, 
  text,
  imageUrl,
  history,
  apiKey,
}: {
  evalState: EvaluationState;
	policyNode: Policy;
	nodeAddress: string;
	evalNode: (node: Policy, parentAddress: string) => void;
  doShortCircuit: boolean | null; 
  text: string;
  imageUrl?: string | null;
  history?: string[] | null;
  apiKey?: string;
}): void {
  // assertAnyOf(policyNode, nodeAddress);

  // // let oneSuccess = false;
	// // const origViolationCount = evalState.violations.length
	// // for (const p of policyNode.any_of) {
  // //   evalNode(p, nodeAddress)
	// // 	if (evalState.violations.length == origViolationCount) {
	// // 		oneSuccess = true
  // //     break;
	// // 	} else if (evalState.violations.length == origViolationCount + 1) {
  // //     // revert changes
  // //     evalState.violation = false
  // //   }
	// // }

  // const id: NodeIdentifier = {
  //     display_name: policyNode.name,
  //     address: nodeAddress,
  //     type: "any_of" 
  // }
  // evalState.trace.push(id)
}

export function evalNot({
  evalState,
	policyNode,
	evalNode, 
  doShortCircuit, 
  text,
  imageUrl,
  history,
  apiKey,
}: {
  evalState: EvaluationState;
	policyNode: Policy;
	nodeAddress: string;
	evalNode: (node: Policy, parentAddress: string) => void;
  doShortCircuit: boolean | null; 
  text: string;
  imageUrl?: string | null;
  history?: string[] | null;
  apiKey?: string;
}): void {

}

