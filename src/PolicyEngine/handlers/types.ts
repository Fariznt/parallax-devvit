import { Policy, Severity } from "../types.js";

// ===Definitions for policy evaluation process===

export type EvalRouter = (
    node: Policy, negate: boolean, parentAddress: string
) => void;

// A function that evaluates some type of individual PolicyNode node (any predicate or combinator)
// during recursive policy evaluation
export type NodeEvaluator = ({
  evalState, // evaluation state (info accumulator)
	policyNode, // the node this was called for
  negate, // whether evaluation should be negated in accordance w/ upstream not node
  nodeAddress, // name_or_type[index if applicable]/parentAddres
	evalNode, // function to do checks on a child node
  // content info and evaluation specifications
  doEarlyExit, // whether we do short-circuiting in all_of nodes or accumulate ALL violations
  text,
  imageUrl,
  contextList,
}: {
  evalState: EvaluationState;
	policyNode: Policy;
  negate: boolean;
	nodeAddress: string;
	evalNode: EvalRouter;
  doEarlyExit: boolean | null; 
  text: string;
  imageUrl?: string | null;
  contextList?: string[] | null;
}) => void;

export type EvaluationState = {
	violations: Violation[]; // accumulated violations so far
	// address of parent node, or null if at root; 
	// used to build current node address in the form <node type>@<parent address>
	trace: NodeTrace[]; // record of execution through policy tree
	// whether short-circuiting has already occurred in this evaluation
	earlyExit: boolean; 
	// With earlyExit circuiting off, LLM calls can be batched outside of this helper. 
	// This is a list of expensive checks to do deferred for batching in the parent function.
	deferredChecks: DeferredCheck[]; 
}

// === Definitions for PolicyEngine evaluation output ===

// Information corresponding to some predicate, returned by evaluateHelper so that
// expensive calls can be done with batching of all checks that wanted to use the 
// expensive tool (ex. LLM)
export type DeferredCheck = {
	condition: string;
	negate: boolean; // flipped by a NOT node
  severity?: Severity;
  nodeTrace: NodeTrace;
}

export type NodeType = 
  | "match_check" | "safety_check" | "semantic_check" 
  | "language_check" | "all_of" | "any_of" | "not" // NEW CHECKS ADDED HERE

export type NodeResult = 
"pass" | "fail" | "deferred" | null // null means not yet evaluated 

// An identifier of nodes in the policy-tree generated lazily at evaluation time
// Exists for humans to understand how policy evaluation occurred and details
export type NodeTrace = { // generated at evaluation time lazily
	display_name?: string;
	// address in policy tree as root...grandparent.parent.node where each is the name or type of the node
	address: string;
	type: NodeType;
  // whether the check passed at the single-node level; deferred for downstream deferredChecks
  result: NodeResult; 
}

// Policy violation representation used in output
export type Violation = {
	node: NodeTrace;
	explanation: string;
	// optional severity score, if applicable (useful for fully autonomous moderation w/ isComprehensive off)
	severity?: Severity; 
}

// The object received by the worker or event handler using PolicyEngine
export type EvaluationResult = {
	violations: Violation[]; // list of all violations found during evaluation
  violation: boolean; // whether the content violates the policy; true if violations length > 0
  modNote: string; // 100 character of less, possibly incomplete summary-note of explanation
  trace: NodeTrace[]; // record of execution through policy tree
	// Whether evaluation was short-circuited in all_of, which indicates incompleteness of 
  // explanation/violations. Should be true if only caring about violation vs no violation
	earlyExit: boolean; 
}
