export type NodeType = "regex" // | ...

export type LogicNode =
  { name?: string } & (
    | { any_of: Policy[] }
    | { all_of: Policy[] }
    | { not: Policy[] | Policy }
  );


export type NodeSpecification = {
  regex: { template: string };
  containment_check: { blacklist: string[] };
	profanity_check: { level: 'mild' | 'moderate' | 'severe' };
  length_check: { length: number };
  llm_check: { prompt: string };
	toxicity_check: { 
		violation_threshold: number; 
		escalation_threshold: number
	}
	language: { allowed: string[] }
};

export type EvaluatorNode = {
  name?: string;
  next_check?: Policy;
	severity?: number; // optional severity score for violating this check
} & {
  [K in keyof NodeSpecification]: {
    [P in K]: NodeSpecification[K];
  }
}[keyof NodeSpecification];

export type Policy =
  | LogicNode
  | EvaluatorNode;

export type DeferredCheck = {
	type: 'llm_check';
	rule: string;
}

export type NodeIdentifier = { // generated at evaluation time lazily
	display_name?: string;
	// unique address in policy tree as node@parent@grandparent...@root where each is the name or type of the node
	address: string;
	type: NodeType;

export type Violation = {
	node: NodeIdentifier;
	explanation: string;
	// optional severity score, if applicable (useful for fully autonomous moderation w/ shortCircuit off
	severity: number | undefined; 
}

export interface EvaluationResult {
	violations: Violation[]; // list of all violations found during evaluation
  violation: boolean; // whether the content violates the policy; true if violations length > 0
  modNote: string; // 100 character of less, possibly incomplete summary-note of explanation
  trace: NodeIdentifier[]; // record of execution through policy tree
	// Whether evaluation was short-circuited, which indicates incompleteness of explanation/violations, 
	// in accordance with traversal recorded in trace
	shortCircuit: boolean; 
}
