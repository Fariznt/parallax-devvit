import { evalAnyOf, evalAllOf, evalNot } from "./combinators.js";
import { evalMatch } from "./match.js";
import { evalSemantic, doDeferredChecks } from "./semantic.js";
import { evalLanguage } from "./language.js";
import { evalSafety } from "./safety.js";
export { evalAnyOf, evalAllOf, evalNot, evalMatch, evalSemantic, evalLanguage, evalSafety, doDeferredChecks, };
export const nodeEvaluators = {
    any_of: evalAnyOf,
    all_of: evalAllOf,
    not: evalNot,
    match_check: evalMatch,
    semantic_check: evalSemantic,
    language_check: evalLanguage,
    safety_check: evalSafety,
};
const DISPATCH_KEYS = Object.keys(nodeEvaluators);
/**
 * Gets key used for indexing into nodeEvaluators appropriately.
 * @param node
 * @returns the key of the evaluation function associated with this node type.
 */
export function getDispatchKey(node) {
    const matches = DISPATCH_KEYS.filter((k) => k in node);
    return matches[0];
}
