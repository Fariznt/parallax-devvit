import { Policy, SafetyCategory, SafetyRule } from "./types.js";

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

export const SAFETY_CATEGORIES = new Set<SafetyCategory>([
	"sexual",
	"sexual/minors",
	"harassment",
	"harassment/threatening",
	"hate",
	"hate/threatening",
	"illicit",
	"illicit/violent",
	"self-harm",
	"self-harm/intent",
	"self-harm/instructions",
	"violence",
	"violence/graphic",
]);

export type AnyOfNode = Policy & { any_of: Policy[] };
export type AllOfNode = Policy & { all_of: Policy[] };
export type NotNode   = Policy & { not: Policy };

export type MatchCheckNode = { 
	match_check: { patterns: string[]; flags?: string; blacklist?: boolean } 
};

export type SafetyCheckNode = {
	safety_check: {
		scope?: "text" | "image" | "both";
	} & (
		| { categories: SafetyCategory[] }
		| { rules: SafetyRule[] }
	);
};
export type SemanticCheckNode = { semantic_check: { condition: string } };
export type LanguageCheckNode = { language_check: { allowed: string[] } };

function err(path: string, msg: string): never {
	throw new Error(`${path}: ${msg}`);
}

function assertObject(x: unknown, path: string): asserts x is Record<string, unknown> {
	if (typeof x !== "object" || x === null) err(path, "expected object");
}

function assertString(x: unknown, path: string): asserts x is string {
	if (typeof x !== "string") err(path, "expected string");
}

function assertNumber(x: unknown, path: string): asserts x is number {
	if (typeof x !== "number") err(path, "expected number");
}

function assertSeverity(x: unknown, path: string): asserts x is number {
	if (typeof x !== "number" && typeof x !== "string") {
		err(path, "expected number or string");
	}
}

function assertBoolean(x: unknown, path: string): asserts x is boolean {
	if (typeof x !== "boolean") err(path, "expected boolean");
}
function assertArray(x: unknown, path: string): asserts x is unknown[] {
	if (!Array.isArray(x)) err(path, "expected array");
}

function nodeLabel(o: Record<string, unknown>): string {
	if (typeof o.name === "string" && o.name.length > 0) return o.name;

	const comb = COMBINATOR_NAMES.find(k => k in o);
	if (comb) return comb;

	const pred = PREDICATE_NAMES.find(k => k in o);
	if (pred) return pred;

	return "policy";
}

function assertSafetyCategory(x: unknown, path: string): asserts x is SafetyCategory {
	assertString(x, path);
	if (!SAFETY_CATEGORIES.has(x as SafetyCategory)) err(path, `invalid SafetyCategory "${x}"`);
}

function assertSafetyRule(x: unknown, path: string): asserts x is SafetyRule {
	assertObject(x, path);

	assertSafetyCategory(x.category, `${path}.category`);

	const assertRange = (r: unknown, rPath: string) => {
		assertArray(r, rPath);
		if (r.length !== 2) err(rPath, "expected tuple [number, number]");
		assertNumber(r[0], `${rPath}[0]`);
		assertNumber(r[1], `${rPath}[1]`);
		if (r[0] < 0 || r[0] > 1) err(`${rPath}[0]`, "expected 0..1");
		if (r[1] < 0 || r[1] > 1) err(`${rPath}[1]`, "expected 0..1");
		if (r[0] > r[1]) err(rPath, "expected low <= high");
	};

	const hasEsc = "escalation_range" in x;
	const hasViol = "violation_range" in x;
	if (!hasEsc && !hasViol) err(path, "expected escalation_range and/or violation_range");

	if (hasEsc) assertRange(x.escalation_range, `${path}.escalation_range`);
	if (hasViol) assertRange(x.violation_range, `${path}.violation_range`);
}

export function assertMatchCheck(node: Record<string, unknown>, path: string): asserts node is MatchCheckNode {
	const v = node.match_check;
	assertObject(v, `${path}.match_check`);

	assertArray(v.patterns, `${path}.match_check.patterns`);
	v.patterns.forEach((p, i) => assertString(p, `${path}.match_check.patterns[${i}]`));

	if ("flags" in v && v.flags !== undefined) {
		assertString(v.flags, `${path}.match_check.flags`);
		if (v.flags.includes('y')) {
			err(`${path}.match_check.flags`, `'y' is an invalid flag`);
		}
	}

	if ("blacklist" in v && v.blacklist !== undefined) {
		assertBoolean(v.blacklist, `${path}.match_check.blacklist`);
	}
}

export function assertSafetyCheck(node: Record<string, unknown>, path: string): asserts node is SafetyCheckNode {
	const v = node.safety_check;
	assertObject(v, `${path}.safety_check`);

	if (v.scope !== undefined) {
		assertString(v.scope, `${path}.safety_check.scope`);
		if (v.scope !== "text" && v.scope !== "image" && v.scope !== "both")
			err(`${path}.safety_check.scope`, `expected "text" | "image" | "both"`);
	}

	const hasCats = "categories" in v;
	const hasRules = "rules" in v;
	if ((hasCats ? 1 : 0) + (hasRules ? 1 : 0) !== 1)
		err(`${path}.safety_check`, "expected exactly one of categories or rules");

	if (hasCats) {
		assertArray(v.categories, `${path}.safety_check.categories`);
		v.categories.forEach((c, i) => assertSafetyCategory(c, `${path}.safety_check.categories[${i}]`));
	} else {
		assertArray(v.rules, `${path}.safety_check.rules`);
		v.rules.forEach((r, i) => assertSafetyRule(r, `${path}.safety_check.rules[${i}]`));
	}
}

export function assertSemanticCheck(node: Record<string, unknown>, path: string): asserts node is SemanticCheckNode {
	const v = node.semantic_check;
	assertObject(v, `${path}.semantic_check`);
	assertString(v.condition, `${path}.semantic_check.condition`);
	if (v.next_check) {
		err(`${path}.next_check`, 
			`Semantic checks must be the last check in any sequence where they are used.
			Refactor by encoding downstream checks into the semantic.`);
	}
}

export function assertLanguageCheck(node: Record<string, unknown>, path: string): asserts node is LanguageCheckNode {
	const v = node.language_check;
	assertObject(v, `${path}.language_check`);

	assertArray(v.allowed, `${path}.language_check.allowed`);
	v.allowed.forEach((s, i) => assertString(s, `${path}.language_check.allowed[${i}]`));
}

export function assertAnyOf(node: Record<string, unknown>, path: string): asserts node is AnyOfNode {
	const v = node.any_of;
	assertArray(v, `${path}.any_of`);

	v.forEach((p, i) => {
		const tmp = `${path}.any_of[${i}]`;
		assertObject(p, tmp);
		assertPolicy(p, `${path}/${nodeLabel(p)}[${i}]`);
	});
}

export function assertAllOf(node: Record<string, unknown>, path: string): asserts node is AllOfNode {
	const v = node.all_of;
	assertArray(v, `${path}.all_of`);

	v.forEach((p, i) => {
		const tmp = `${path}.all_of[${i}]`;
		assertObject(p, tmp);
		assertPolicy(p, `${path}/${nodeLabel(p)}[${i}]`);
	});
}

export function assertNot(node: Record<string, unknown>, path: string): asserts node is NotNode {
	const v = node.not;
	const tmp = `${path}.not`;
	assertObject(v, tmp);
	return assertPolicy(v, `${path}/${nodeLabel(v)}`);
}

/**
 * Type validation for Policy objects. Also serves as syntax validation of user-inputted policy
 * under the DSL defined for policy-making. Errors if x is not a Policy.
 * @param x (Potential) policy object
 * @returns True if x is correctly shaped for a Policy object
 */
export function assertPolicy(x: unknown, path = "policy", disallowSemantic = false): asserts x is Policy {
	assertObject(x, path);

	// optional metadata
	if ("name" in x && x.name !== undefined) assertString(x.name, `${path}.name`);
	if ("next_check" in x && x.next_check !== undefined) {
		const tmp = `${path}.next_check`;
		assertObject(x.next_check, tmp);
		assertPolicy(x.next_check, `${path}/${nodeLabel(x.next_check)}`);
	}
	if ("severity" in x && x.severity !== undefined) {
		assertSeverity(x.severity, `${path}.severity`);
	}

  const presentCombinators = COMBINATOR_NAMES.filter(k => k in x);
  const presentPredicates = PREDICATE_NAMES.filter(k => k in x);

  if (presentCombinators.length + presentPredicates.length !== 1) {
    err(
      path,
      `expected exactly 1 node operator (one of: ${[...COMBINATOR_NAMES, ...PREDICATE_NAMES].join(", ")})`
    );
  }

	if (presentCombinators.length === 1) {
		const c = presentCombinators[0]!;
		if (c === "any_of") return assertAnyOf(x, path);
		if (c === "all_of") return assertAllOf(x, path);
		return assertNot(x, path);
	}

	const k = presentPredicates[0]!;
	if (k === "match_check") return assertMatchCheck(x, path);
	if (k === "safety_check") return assertSafetyCheck(x, path);
	if (k === "language_check") return assertLanguageCheck(x, path);
	return assertSemanticCheck(x, path);


	// new checks added here

	err(path, `An error occurred during input Policy validation. Unimplemented validation of new predicate?`);
}

export function isPolicy(x: unknown): x is Policy {
	try {
		assertPolicy(x);
		return true;
	} catch {
		return false;
	}
}
