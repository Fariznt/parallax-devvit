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
  let passed = true

	for (const p of policyNode.all_of) {
    evalNode(p, nodeAddress)
		if (evalState.violations.length > origViolationCount && doShortCircuit) {
			evalState.earlyExit = true
      passed = false
			break
		}
	}

  const id: NodeIdentifier = {
      display_name: policyNode.name,
      address: nodeAddress,
      type: "all_of" ,
      result: passed
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
  assertAnyOf(policyNode, nodeAddress);

  let oneSuccess = false;
	const origState: EvaluationState = structuredClone(evalState)
	for (const p of policyNode.any_of) {
    evalNode(p, nodeAddress)
		if (evalState.violations.length == origState.violations.length) {
			oneSuccess = true
      break;
		} else if (evalState.violations.length == origState.violations.length + 1) {
      // revert changes to violations---the children of any_of are never the
      // interesting failure/violation point
      // if some downstream violation, if may be that another node succeeds
      // if all downstream nodes are violated, conceptually the failure happens
      // at the any_of node
      evalState = {
        violations: origState.violations,
        trace: origState.trace,
        earlyExit: origState.earlyExit // keep if trace has everything, otherwise noyoure
        deferredChecks: origState.deferredChecks
      }
      evalState.violations = origState.violations
      evalState.deferredChecks
    }
	}

  const id: NodeIdentifier = {
      display_name: policyNode.name,
      address: nodeAddress,
      type: "any_of" 
  }
  evalState.trace.push(id)
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

