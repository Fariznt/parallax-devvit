import { modmailErr } from "./action-functions.js";
const ACTIONS = new Set([
    'sendModmail',
    'sendModqueue',
    'remove',
    // 'ban',
]);
export function validateSeverityActions(parsed) {
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("SeverityActionMap must be a JSON object");
    }
    const obj = parsed;
    const result = {};
    for (const [rawKey, value] of Object.entries(obj)) {
        const keyTrimmed = rawKey.trim();
        if (keyTrimmed === "") {
            throw new Error("Severity key cannot be empty");
        }
        // Convert JSON key -> number severity
        const severity = Number(keyTrimmed);
        if (!Number.isFinite(severity)) {
            throw new Error(`Severity key "${rawKey}" must be a finite number (e.g., "1", "10", "0.5")`);
        }
        if (!Array.isArray(value)) {
            throw new Error(`Severity "${rawKey}" must map to an array of actions from [${[...ACTIONS].join(", ")}]`);
        }
        const actions = [];
        for (const action of value) {
            if (typeof action !== "string") {
                throw new Error(`Invalid action for severity "${rawKey}": 
          actions must be strings from [${[...ACTIONS].join(", ")}]`);
            }
            if (!ACTIONS.has(action)) {
                throw new Error(`Invalid action "${action}" for severity "${rawKey}". ` +
                    `Allowed actions: ${Array.from(ACTIONS).join(", ")}, ban:<number of days>`);
            }
            actions.push(action);
        }
        result[severity] = actions;
    }
    return result;
}
export async function loadActionMapFromSettings(context) {
    const raw = await context.settings.get("actionJson");
    if (!raw)
        return null;
    if (typeof raw !== "string") {
        modmailErr(context, 'Setting "actionJson" must be a string');
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        modmailErr(context, '"actionJson" is not valid JSON');
        return null;
    }
    const validated = validateSeverityActions(parsed);
    return validated;
}
export async function loadPolicyFromSettings(context) {
    const raw = await context.settings.get("policyJson");
    if (typeof raw !== "string" || raw.length === 0) {
        throw new Error('Setting "PolicyJson" must be a non-empty string');
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        if (err instanceof Error) {
            throw new Error(`"PolicyJson" is not valid JSON: ${err.message}`);
        }
        throw err;
    }
    return parsed;
}
export async function loadEarlyExitFromSettings(context) {
    const earlyExit = await context.settings.get("earlyExit");
    if (typeof earlyExit !== "boolean") {
        throw new Error('Setting "earlyExit" must be a boolean');
    }
    return earlyExit;
}
export async function loadIgnoreFailuresFromSettings(context) {
    const ignoreFailures = await context.settings.get("ignoreFailures");
    if (typeof ignoreFailures !== "boolean") {
        return false;
    }
    return ignoreFailures;
}
export async function loadKeyFromSettings(context) {
    const apiKey = await context.settings.get("apiKey");
    if (typeof apiKey !== "string" || apiKey.length === 0) {
        throw new Error('Setting "apiKey" must be a non-empty string');
    }
    return apiKey;
}
