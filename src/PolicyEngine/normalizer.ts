import { Policy } from "./types.js";

export function normalize(policy: Policy) {
    recursiveNorm(policy)
}

/**
 * Traverse top-down the policy and have each node take its parent's severity if
 * it doesnt have one of its own.
 * @param policy 
 * @param inheritedSeverity 
 */
export function recursiveNorm(policy: Policy, inheritedSeverity?: number): void {
    // nodes inherit parent's severity if null
	const effective = policy.severity ?? inheritedSeverity; // effective severity
	if (policy.severity == null) policy.severity = effective; 

    // whitelist is false by default if not included
    if ("regex_check" in policy) {
			const rc = policy.regex_check;
			if (rc.whitelist === undefined) {
				rc.whitelist = false;
			}
    }

	// next_check inherits from *this* node’s effective severity
	if (policy.next_check) recursiveNorm(policy.next_check, effective);

	if ("any_of" in policy) {
		for (const child of policy.any_of) recursiveNorm(child, effective);
		return;
	}

	if ("all_of" in policy) {
		for (const child of policy.all_of) recursiveNorm(child, effective);
		return;
	}

	if ("not" in policy) {
		const n = policy.not;
		if (Array.isArray(n)) for (const child of n) recursiveNorm(child, effective);
		else recursiveNorm(n, effective);
		return;
	}
}
