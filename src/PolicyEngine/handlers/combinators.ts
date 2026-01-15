import type { EvaluationState, Policy, NodeIdentifier, Violation } from "../types.js";
import { assertAnyOf, assertAllOf, assertNot } from "../validator.js";

export function evalAllOf({
  evalState,
	policyNode,
  nodeAddress,
	evalNode, 
  doEarlyExit
}: {
  evalState: EvaluationState;
	policyNode: Policy;
	nodeAddress: string;
	evalNode: (node: Policy, parentAddress: string) => void;
  doEarlyExit
  : boolean | null; 
}): void {
  assertAllOf(policyNode, nodeAddress);

	const origState: EvaluationState = structuredClone(evalState)
	const origViolationCount = origState.violations.length
  let oneFailed = false

	for (const p of policyNode.all_of) {
    evalNode(p, nodeAddress)
		if (evalState.violations.length > origViolationCount && doEarlyExit) {
      oneFailed = true
		}
    if (doEarlyExit && oneFailed) {
      evalState.earlyExit = true
      break
    }
	}

  const newDefChecks = origState.deferredChecks.length != evalState.deferredChecks.length
  let result: "pass" | "deferred" | "fail"
  if (newDefChecks && !oneFailed) {
    result = "deferred" 
  } else if (oneFailed) {
    result = "fail"
  } else {
    result = "pass"
  }
  const id: NodeIdentifier = {
      display_name: policyNode.name,
      address: nodeAddress,
      type: "all_of",
      result: result
  }
  evalState.trace.push(id)
}

export function evalAnyOf({
  evalState,
	policyNode,
  nodeAddress,
	evalNode, 
}: {
  evalState: EvaluationState;
	policyNode: Policy;
	nodeAddress: string;
	evalNode: (node: Policy, parentAddress: string) => void;
}): void {
  assertAnyOf(policyNode, nodeAddress);

  let onePassed = false;
	const origState: EvaluationState = structuredClone(evalState)
	for (const p of policyNode.any_of) {
    const preBranchDef = structuredClone(evalState.deferredChecks)
    evalNode(p, nodeAddress)
    const newDeferred = (preBranchDef.length != evalState.deferredChecks.length)

		if ((evalState.violations.length == origState.violations.length)
        && !newDeferred) { // no on current or possible future violation found
			onePassed = true // any_of pass condition reached
      // since any_of passed, any downstream deferred checks are unnecessary. revert.
      evalState.deferredChecks = origState.deferredChecks
      break; // checking any more beyond this is of no benefit, since new violations cant accumulate
		} else if (evalState.violations.length != origState.violations.length) {
      // individual violations dont matter under any_of; we care if NONE passed
      // if all downstream nodes are violated, conceptually the failure happens
      // at the any_of node
      evalState.violations = origState.violations 
      // downstream early exiting upon failure is not early exiting for AnyOf 
      // (all nodes are checked anyways until one passes under any_of)
      evalState.earlyExit = origState.earlyExit
      // revert to deferredChecks before this branch,
      // since violation is already confirmed for this branch p, no new checks are not needed
      evalState.deferredChecks = preBranchDef
    }
	}

  const newDefChecks = origState.deferredChecks.length != evalState.deferredChecks.length
  
  let result: "pass" | "deferred" | "fail"
  if (newDefChecks) {
    result = "deferred"
  } else if (onePassed) { // && !newDefChecks
    result = "pass"
  } else { // !onePassed && !newDefChecks
    result = "fail"
  }
  const id: NodeIdentifier = {
      display_name: policyNode.name,
      address: nodeAddress,
      type: "any_of",
      result: result
  }
  evalState.trace.push(id)
}

export function evalNot({
  evalState,
	policyNode,
  nodeAddress,
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
  assertNot(policyNode, nodeAddress)

  let child: Policy
  if (Array.isArray(policyNode.not)) {
    child = policyNode.not[0]
  } else {
    child = policyNode.not
  }

	const origState: EvaluationState = structuredClone(evalState)

  evalNode(child, nodeAddress)

  const id: NodeIdentifier = {
    display_name: policyNode.name,
    address: nodeAddress,
    type: "not",
    result: "deferred" // placeholder
  }

  if (evalState.violations.length == origState.violations.length) {
    if (evalState.deferredChecks.length > origState.deferredChecks.length) {
      // there are deferredChecks present with no violation info, result unknown
      id.result = "deferred"
    } else {
      // lack of downstream violation confirmed, which means NOT is violated
      id.result = "fail"
      const newViolation: Violation = {
        node: id,
        explanation: "temp",
        severity: policyNode.severity
      } 
      evalState.violations.push(newViolation)
    }
  } else { 
    // downstream violation occurred, which means NOT is satisfied
    // no need to check deferredChecks in this case
    evalState.deferredChecks = origState.deferredChecks
    // revert downstream violation as a violation
    evalState.violations = origState.violations

  }

  // negate deferred checks so that the code running these checks knows 
  // what would have been a violation is a non-violation and vice versa
  const start = origState.deferredChecks.length;
  for (let i = start; i < evalState.deferredChecks.length; i++) {
    evalState.deferredChecks[i].negate = !evalState.deferredChecks[i].negate;
  }



  // TODO: init result
  // deferred if child was deferred

  // pass if child failed

  // fail if child passed

  evalState.trace.push(id)
}

