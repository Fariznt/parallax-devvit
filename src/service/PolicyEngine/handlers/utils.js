import { getDispatchKey } from "./index.js";
export function getNodeIdByType(policyNode, address, type) {
    const id = {
        display_name: policyNode.name,
        address: address,
        type: type,
        result: null
    };
    return id;
}
export function getNodeId(policyNode, address) {
    const key = getDispatchKey(policyNode);
    return getNodeIdByType(policyNode, address, key);
}
export function addToTrace(evalState, policyNode, address) {
    const id = getNodeId(policyNode, address);
    evalState.trace.push(id);
    return id;
}
