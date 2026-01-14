

import { NodeEvaluator, Policy } from "../types.js";
import { evalAnyOf, evalAllOf, evalNot } from "./combinators.js";
import { evalRegex } from "./regex.js";
import { evalSemantic } from "./semantic.js";
import { evalLanguage } from "./language.js";
import { evalSafety } from "./safety.js";

export {
  evalAnyOf,
  evalAllOf,
  evalNot,
  evalRegex,
  evalSemantic,
  evalLanguage,
  evalSafety,
};

export const nodeEvaluators: Record<string, NodeEvaluator> = {
    any_of: evalAnyOf,
    all_of: evalAllOf,
    not: evalNot,
    regex: evalRegex,
    semantic: evalSemantic,
    language: evalLanguage,
    safety: evalSafety,
  };

const DISPATCH_KEYS = Object.keys(nodeEvaluators) as Array<keyof typeof nodeEvaluators>;

/**
 * Gets key used for indexing into nodeEvaluators appropriately.
 * @param node 
 * @returns the key of the evaluation function associated with this node type.
 */
export function getDispatchKey(node: Policy): keyof typeof nodeEvaluators {
  const matches = DISPATCH_KEYS.filter((k) => k in node);
  return matches[0];
}