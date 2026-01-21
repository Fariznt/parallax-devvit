import type { Policy } from "../types.js";
import type {
  EvaluationState, 
  EvalRouter,
} from "./types.js";
import { assertSafetyCheck } from "../policy-validator.js";

export function evalSafety({
  evalState,
  policyNode, 
  negate,
  nodeAddress,
  evalNode,
  doEarlyExit,
  text,
  imageUrl,
  history,
  // models,
  // apiKeys,
}: {
  evalState: EvaluationState;
  policyNode: Policy;
  negate: boolean;
  nodeAddress: string;
  evalNode: (
  node: Policy, negate: boolean, parentAddress: string
  ) => void;
  doEarlyExit: boolean | null; 
  text: string;
  imageUrl?: string | null;
  history?: string[] | null;
  // models?: ModelRegistry;
  // apiKeys?: ApiKeys;
}): void {
	console.warn('Safety nodes are not implemented')

}
