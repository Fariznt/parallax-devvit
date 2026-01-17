import type { 
  Policy, 
  NodeIdentifier, 
  NodeType
} from "../types.js";
import type { 
  EvaluationState
} from "./types.js";
import { getDispatchKey } from "./index.js";

export function getNodeIdByType(policyNode: Policy, address: string, type: NodeType) {
  const id: NodeIdentifier = {
      display_name: policyNode.name,
      address: address,
      type: type,
      result: null
  }
  return id
}

export function getNodeId(policyNode: Policy, address: string): NodeIdentifier {
    const key: NodeType = getDispatchKey(policyNode) as NodeType
    return getNodeIdByType(policyNode, address, key)
}

export function addToTrace(
    evalState: EvaluationState, policyNode: Policy, address: string
): NodeIdentifier {
    const id: NodeIdentifier = getNodeId(policyNode, address)
    evalState.trace.push(id)
    return id
}