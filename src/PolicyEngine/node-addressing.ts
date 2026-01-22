/**
 * Handles assigning addresses to nodes to produce informative errors and traces
 * in other files
 */

export type Address = string;

export const PREDICATE_NAMES = [
    "match_check",
    "safety_check",
    "semantic_check",
    "language_check",
] as const;

export const COMBINATOR_NAMES = [
    "any_of",
    "all_of",
    "not",
] as const;

/**
 * Builds a label for a node that is its .name if present, else if no .name, then its 
 * type (which is the type of predicate or combinator present within)
 * @param o A node object within the policy for which a label is wanted.
 * @returns 
 */
export function nodeLabel(o: Record<string, unknown>): string {
    if (typeof o.name === "string" && o.name.length > 0) return o.name;

    const comb = COMBINATOR_NAMES.find((k) => k in o);
    if (comb) return comb;

    const pred = PREDICATE_NAMES.find((k) => k in o);
    if (pred) return pred;

    return "undefinedNode";
}

/**
 * Construct the address of a child policy node.
 *
 * Address format:
 *   <parent>/<nodeLabel>[<index?>]
 *
 * Examples:
 *   childAddress("PolicyRoot", node)
 *     -> "PolicyRoot/match_check"
 *
 *   childAddress("PolicyRoot/all_of", node, 2)
 *     -> "PolicyRoot/all_of[2]/semantic_check"
 */
export function childAddress(
	parentAddress: Address,
	node: Record<string, unknown>,
	index?: number
): Address {
	const label = nodeLabel(node);

	if (index === undefined) {
		return `${parentAddress}/${label}`;
	}

	return `${parentAddress}/${label}[${index}]`;
}

