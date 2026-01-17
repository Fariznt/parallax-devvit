import type { 
  EvaluationState, 
  Policy, 
  NodeIdentifier, 
  Violation, 
  NodeResult,
   EvalRouter, 
   EvaluationResult,
   DeferredCheck} from "../types.js";
import { assertAnyOf, assertAllOf, assertNot } from "../validator.js";

/**
 * Evaluates a list of nodes from an any_of or all_of node and runs evalNode
 * on each one. This is exactly the default behavior of all_of, but this
 * helper is used when any_of is negated (with negate=True):
 * !any_of(x, y) = all_of(!x, !y) by De Morgan's Laws
 * Returns NodeResult = "pass" | "fail" | deferred
 * @nodeList policyNode.any_of or policyNode.all_of to be
 *           evaluated under "all" logic
 * @negate Whether to negate downstream nodes. True if we want this
 *         to behave as "not: any_of"
 */
function allHelper({
  evalState,
  nodeList, 
  negate,
  nodeAddress,
  evalNode,
  doEarlyExit,
}: {
  evalState: EvaluationState;
  nodeList: Policy[];
  negate: boolean;
  nodeAddress: string;
  evalNode: EvalRouter
  doEarlyExit: boolean | null; 
}): NodeResult {
	const origState: EvaluationState = structuredClone(evalState)
	const origViolationCount = origState.violations.length
  let oneFailed = false

	for (const p of nodeList) {
    evalNode(p, negate, nodeAddress)
		if (evalState.violations.length > origViolationCount) {
      oneFailed = true
      if (doEarlyExit) {
        evalState.earlyExit = true
        break
      }
		}
	}

  // set result in trace
  const newDefChecks = origState.deferredChecks.length != evalState.deferredChecks.length
  let result: NodeResult
  if (newDefChecks && !oneFailed) {
    result = "deferred" 
  } else if (oneFailed) {
    result = "fail"
  } else {
    result = "pass"
  }

  return result
}

function anyHelper({
  evalState,
  nodeList, 
  negate,
  nodeAddress,
  evalNode,
}: {
  evalState: EvaluationState; 
  nodeList: Policy[];
  negate: boolean,
  nodeAddress: string,
  evalNode: EvalRouter,
}): NodeResult {
  let onePassed = false;
	const origState: EvaluationState = structuredClone(evalState)
	for (const p of nodeList) {
    const preBranchViol = structuredClone(evalState.violations)
    const preBranchDef = structuredClone(evalState.deferredChecks)
    evalNode(p, negate, nodeAddress)
    const newDeferred = (preBranchDef.length != evalState.deferredChecks.length)
    const newViolation = (evalState.violations.length != preBranchViol.length)

		if (!newViolation && !newDeferred) { // no current or possible future violation found
			onePassed = true // any_of pass condition reached
      // since any_of passed, any downstream deferred checks are unnecessary. revert.
      evalState.deferredChecks = origState.deferredChecks
      // previously recorded violations branching from this any_of
      // do not contribute to the decision anymore
      evalState.violations = origState.violations
      break; // checking any more beyond this is of no benefit, since new violations cant accumulate
		} 
	}

  const start = origState.deferredChecks.length;
  const end = evalState.deferredChecks.length;
  const newDefChecks = end - start
  if (newDefChecks > 1) {
    throw new Error(
      `1> computation-deferring nodes are not permitted downstream an 'any_of' node
       or downstream a 'not' node followed by an 'all_of' node.
      A policy refactor is necessarily possible and cheaper by combining combinator logic 
      into a semantic_node.`
    )
  }

  // set result in trace
  let result: NodeResult
  if (newDefChecks > 0) {
    result = "deferred"
  } else if (onePassed) { // && !newDefChecks
    result = "pass"
  } else { // !onePassed && !newDefChecks
    result = "fail"
  }

  return result
}

export function evalAllOf({
  evalState,
  policyNode, 
  negate,
  nodeAddress,
  evalNode,
  doEarlyExit,
}: {
  evalState: EvaluationState;
  policyNode: Policy;
  negate: boolean;
  nodeAddress: string;
  evalNode: EvalRouter
  doEarlyExit: boolean | null; 
}): void {
  assertAllOf(policyNode, nodeAddress);
  const id: NodeIdentifier = {
      display_name: policyNode.name,
      address: nodeAddress,
      type: "all_of",
      result: null
  }
  evalState.trace.push(id)

  let result: NodeResult
  if (negate) {
    // with negate, anyHelper evaluates any_of(!x, !y) = !all_of(x, y)
    result = anyHelper({
      evalState: evalState, 
      nodeList: policyNode.all_of, 
      negate: true,
      nodeAddress: nodeAddress,
      evalNode: evalNode,
    })
  } else {
    result = allHelper({
      evalState: evalState, 
      nodeList: policyNode.all_of, 
      negate: false,
      nodeAddress: nodeAddress,
      evalNode: evalNode,
      doEarlyExit: doEarlyExit
    })
  }

  id.result = result
}

export function evalAnyOf({
  evalState,
  policyNode, 
  negate,
  nodeAddress,
  evalNode,
  doEarlyExit
}: {
  evalState: EvaluationState;
  policyNode: Policy;
  negate: boolean;
  nodeAddress: string;
  evalNode: EvalRouter
  doEarlyExit: boolean | null; 
}): void {
  assertAnyOf(policyNode, nodeAddress);

  const id: NodeIdentifier = {
      display_name: policyNode.name,
      address: nodeAddress,
      type: "any_of",
      result: null
  }
  evalState.trace.push(id)

  let result: NodeResult
  if (negate) {
    // with negate, allHelper evaluates !all_of(x, y) = any_of(!x, !y)
    console.log("111")
    result = allHelper({
      evalState: evalState, 
      nodeList: policyNode.any_of, 
      negate: true,
      nodeAddress: nodeAddress,
      evalNode: evalNode,
      doEarlyExit: doEarlyExit
    })
  } else {
    console.log("222")

    result = anyHelper({
      evalState: evalState, 
      nodeList: policyNode.any_of, 
      negate: false,
      nodeAddress: nodeAddress,
      evalNode: evalNode,
    })
  }

  id.result = result
}

export function evalNot({
  evalState,
	policyNode,
  negate,
  nodeAddress,
	evalNode, 
}: {
  evalState: EvaluationState;
	policyNode: Policy;
  negate: boolean;
	nodeAddress: string;
	evalNode: EvalRouter
}): void {
  assertNot(policyNode, nodeAddress)

  // add this node to trace to remember execution order
  const id: NodeIdentifier = {
    display_name: policyNode.name,
    address: nodeAddress,
    type: "not",
    result: null // placeholder
  }
  evalState.trace.push(id)

  // save old evaluation state for post-execution comparison
	const origChecks: DeferredCheck[] = structuredClone(evalState.deferredChecks)
  const origViolationCount = evalState.violations.length

  evalNode(policyNode.not, !negate, nodeAddress) // run downstream Policy

  let result: NodeResult
  if (evalState.violations.length > origViolationCount) {
    // new violations?
    result = "fail"
    // no need for deferred checks if violation already confirmed
    evalState.deferredChecks = origChecks
  } else if (evalState.deferredChecks.length > origChecks.length) {
    // new deferred checks with no violation?
    result = "deferred"
  } else {
    // no new violations or deferred checks
    result = "pass"
  }
  id.result = result
}

