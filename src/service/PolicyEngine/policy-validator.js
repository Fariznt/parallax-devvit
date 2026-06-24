import { childAddress, PREDICATE_NAMES, COMBINATOR_NAMES } from "./node-addressing.js";
export const SAFETY_CATEGORIES = new Set([
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
function err(path, msg) {
    throw new Error(`At address ${path}: ${msg}`);
}
function typeOf(x) {
    if (x === null)
        return "null";
    if (Array.isArray(x))
        return "array";
    return typeof x;
}
function assertObject(x, path) {
    if (typeof x !== "object" || x === null) {
        err(path, `expected object, got ${typeOf(x)}`);
    }
}
function assertArray(x, path) {
    if (!Array.isArray(x))
        err(path, `expected array, got ${typeOf(x)}`);
}
function assertString(x, path) {
    if (typeof x !== "string")
        err(path, `expected string, got ${typeOf(x)}`);
}
function assertNumber(x, path) {
    if (typeof x !== "number")
        err(path, `expected number, got ${typeOf(x)}`);
}
function assertBoolean(x, path) {
    if (typeof x !== "boolean")
        err(path, `expected boolean, got ${typeOf(x)}`);
}
function assertSeverity(x, path) {
    if (typeof x !== "number")
        err(path, `expected number, got ${typeOf(x)}`);
}
// formats keys in a record as "a, b, ... (+2 more)" for listing in errors
function fmtKeys(o, max = 20) {
    const ks = Object.keys(o);
    if (ks.length === 0)
        return "(no keys)";
    if (ks.length <= max)
        return ks.join(", ");
    return `${ks.slice(0, max).join(", ")}, … (+${ks.length - max} more)`;
}
function assertSafetyCategory(x, path) {
    assertString(x, path);
    if (!SAFETY_CATEGORIES.has(x)) {
        err(path, `invalid SafetyCategory "${x}". Expected one of: ${Array.from(SAFETY_CATEGORIES).join(", ")}`);
    }
}
function assertSafetyRule(x, path) {
    assertObject(x, path);
    assertSafetyCategory(x.category, `${path}.category`);
    const assertRange = (r, rPath) => {
        assertArray(r, rPath);
        if (r.length !== 2)
            err(rPath, `expected tuple [number, number], got length ${r.length}`);
        assertNumber(r[0], `${rPath}[0]`);
        assertNumber(r[1], `${rPath}[1]`);
        if (r[0] < 0 || r[0] > 1)
            err(`${rPath}[0]`, "expected 0..1");
        if (r[1] < 0 || r[1] > 1)
            err(`${rPath}[1]`, "expected 0..1");
        if (r[0] > r[1])
            err(rPath, "expected low <= high");
    };
    const hasEsc = "escalation_range" in x;
    const hasViol = "violation_range" in x;
    if (!hasEsc && !hasViol) {
        err(path, `expected escalation_range and/or violation_range. Present keys: ${fmtKeys(x)}`);
    }
    if (hasEsc)
        assertRange(x.escalation_range, `${path}.escalation_range`);
    if (hasViol)
        assertRange(x.violation_range, `${path}.violation_range`);
}
export function assertMatchCheck(node, path) {
    const v = node.match_check;
    assertObject(v, `${path}.match_check`);
    assertArray(v.patterns, `${path}.patterns`);
    v.patterns.forEach((p, i) => assertString(p, `${path}.patterns[${i}]`));
    if ("flags" in v && v.flags !== undefined) {
        assertString(v.flags, `${path}.flags`);
        if (v.flags.includes("y")) {
            err(`${path}.flags`, `'y' is an invalid flag`);
        }
    }
    if ("blacklist" in v && v.blacklist !== undefined) {
        assertBoolean(v.blacklist, `${path}.blacklist`);
    }
}
export function assertSafetyCheck(node, path) {
    const v = node.safety_check;
    assertObject(v, `${path}.safety_check`);
    if (v.scope !== undefined) {
        assertString(v.scope, `${path}.scope`);
        if (v.scope !== "text" && v.scope !== "image" && v.scope !== "both") {
            err(`${path}.scope`, `expected "text" | "image" | "both"`);
        }
    }
    const hasCats = "categories" in v;
    const hasRules = "rules" in v;
    if ((hasCats ? 1 : 0) + (hasRules ? 1 : 0) !== 1) {
        err(`${path}.safety_check`, `expected exactly one of categories or rules. Present keys: ${fmtKeys(v)}`);
    }
    if (hasCats) {
        assertArray(v.categories, `${path}.categories`);
        v.categories.forEach((c, i) => assertSafetyCategory(c, `${path}.categories[${i}]`));
    }
    else {
        assertArray(v.rules, `${path}.rules`);
        v.rules.forEach((r, i) => assertSafetyRule(r, `${path}.rules[${i}]`));
    }
}
export function assertSemanticCheck(node, path) {
    const v = node.semantic_check;
    assertObject(v, `${path}.semantic_check`);
    assertString(v.condition, `${path}.condition`);
    // preserve current behavior: semantic cannot have next_check (even though it's not semantic_check's shape)
    // but make the error location + message more informative
    if ("next_check" in node && node.next_check !== undefined) {
        err(`${path}.next_check`, `semantic_check must be terminal (cannot have next_check). Encode downstream requirements into the semantic condition instead.`);
    }
}
export function assertLanguageCheck(node, path) {
    const v = node.language_check;
    assertObject(v, `${path}.language_check`);
    assertArray(v.allowed, `${path}.allowed`);
    v.allowed.forEach((s, i) => assertString(s, `${path}.allowed[${i}]`));
}
export function assertAnyOf(node, path) {
    const v = node.any_of;
    assertArray(v, `${path}.any_of`);
    v.forEach((p, i) => {
        const elementPath = `${path}.any_of[${i}]`;
        assertObject(p, elementPath);
        // path convention: use address path + label
        const childPath = childAddress(path, p, i);
        assertPolicy(p, childPath);
    });
}
export function assertAllOf(node, path) {
    const v = node.all_of;
    assertArray(v, `${path}.all_of`);
    v.forEach((p, i) => {
        const elementPath = `${path}.all_of[${i}]`;
        assertObject(p, elementPath);
        const childPath = childAddress(path, p, i);
        assertPolicy(p, childPath);
    });
}
export function assertNot(node, path) {
    const v = node.not;
    const objectPath = `${path}.not`;
    assertObject(v, objectPath);
    const childPath = childAddress(path, v);
    return assertPolicy(v, childPath);
}
function describeOperatorSet(presentCombinators, presentPredicates) {
    const combPart = presentCombinators.length
        ? `combinators=[${presentCombinators.join(", ")}]`
        : "combinators=[]";
    const predPart = presentPredicates.length
        ? `predicates=[${presentPredicates.join(", ")}]`
        : "predicates=[]";
    return `${combPart}, ${predPart}`;
}
/**
 * Type validation for Policy objects. Also serves as syntax validation of user-inputted policy
 * under the DSL defined for policy-making. Errors if x is not a Policy.
 */
export function assertPolicy(x, path = "PolicyRoot", disallowSemantic = false) {
    assertObject(x, path);
    // optional metadata validation
    if ("name" in x && x.name !== undefined)
        assertString(x.name, `${path}.name`);
    if ("severity" in x && x.severity !== undefined) {
        assertSeverity(x.severity, `${path}.severity`);
    }
    if ("next_check" in x && x.next_check !== undefined) {
        const nextObjPath = `${path}.next_check`;
        assertObject(x.next_check, nextObjPath);
        assertPolicy(x.next_check, childAddress(path, x.next_check), disallowSemantic);
    }
    // validation of operator existence/count
    const presentCombinators = COMBINATOR_NAMES.filter((k) => k in x);
    const presentPredicates = PREDICATE_NAMES.filter((k) => k in x);
    if (presentCombinators.length + presentPredicates.length !== 1) {
        const expected = [...COMBINATOR_NAMES, ...PREDICATE_NAMES].join(", ");
        const detail = presentCombinators.length + presentPredicates.length === 0
            ? `No operator found. Expected exactly 1 of: ${expected}. Present keys: ${fmtKeys(x)}`
            : `Multiple operators found (${describeOperatorSet(presentCombinators, presentPredicates)}). Expected exactly 1 of: ${expected}. Present keys: ${fmtKeys(x)}`;
        err(path, detail);
    }
    // dispatch to validation for different types of operators
    // dispatch for combinators (fixed)
    if (presentCombinators.length === 1) {
        const c = presentCombinators[0];
        if (c === "any_of")
            return assertAnyOf(x, path);
        if (c === "all_of")
            return assertAllOf(x, path);
        return assertNot(x, path);
    }
    // dispatch for predicates (extend validation here when new nodes added)
    const k = presentPredicates[0];
    if (k === "match_check")
        return assertMatchCheck(x, path);
    if (k === "safety_check")
        return assertSafetyCheck(x, path);
    if (k === "language_check")
        return assertLanguageCheck(x, path);
    if (k === "semantic_check") {
        if (disallowSemantic) {
            err(path, `semantic_check is disallowed in this context, but "${k}" was provided.`);
        }
        return assertSemanticCheck(x, path);
    }
    // new checks added here
    err(path, `An error occurred during input Policy validation. Unimplemented validation of new predicate?`);
}
export function isPolicy(x) {
    try {
        assertPolicy(x);
        return true;
    }
    catch {
        return false;
    }
}
