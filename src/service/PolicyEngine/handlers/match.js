import { addToTrace, } from "./utils.js";
import { assertMatchCheck } from "../policy-validator.js";
function evalPatterns(patterns, flags, text) {
    // set up accumulators for looped matching
    const matchMask = [];
    let matchedPatterns = [];
    let unmatchedPatterns = [];
    // useGlobalSeq means we will check if patterns match in sequence
    const useGlobalSeq = flags.includes('g');
    let pos = 0;
    for (const pattern of patterns) {
        const r = new RegExp(pattern, flags);
        let matched;
        if (useGlobalSeq) {
            r.lastIndex = pos; // start where the previous pattern left off
            const m = r.exec(text);
            matched = m !== null;
            if (matched)
                pos = r.lastIndex; // advance shared cursor only on success
        }
        else {
            matched = r.test(text);
        }
        matchMask.push(matched);
        if (matched) {
            matchedPatterns.push(pattern);
        }
        else {
            unmatchedPatterns.push(pattern);
        }
    }
    return { matchMask, matchedPatterns, unmatchedPatterns };
}
export function evalMatch({ evalState, policyNode, negate, nodeAddress, evalNode, text, }) {
    assertMatchCheck(policyNode, nodeAddress);
    const nodeTrace = addToTrace(evalState, policyNode, nodeAddress);
    let whitelist = !policyNode.match_check.blacklist;
    if (negate) {
        whitelist = !whitelist;
    }
    // extract regex args
    const patterns = policyNode.match_check.patterns; // list
    const flags = policyNode.match_check.flags ?? ""; // string
    const { matchMask, matchedPatterns, unmatchedPatterns } = evalPatterns(patterns, flags, text);
    // useGlobalSeq means we will check if patterns match in sequence
    const useGlobalSeq = flags.includes('g');
    // Get failure/nonfailure from match mask
    let matched;
    if (useGlobalSeq) {
        matched = matchMask.every(m => m);
    } // all match
    else {
        matched = matchMask.some(m => m);
    } // some match
    let fail;
    if (whitelist) {
        fail = !matched;
    } // didnt match is failure for whitelist
    else {
        fail = matched;
    } // did match is failure for blacklist
    // update evaluation result of this node in trace
    const result = fail ? "fail" : "pass";
    nodeTrace.result = result;
    // Generate variables for evalState change
    let explanation = ""; // Answers "Why did the check fail?"
    if (fail) {
        if (policyNode.next_check) {
            // there is a next check. This failure only means that we escalate to another node
            evalNode(policyNode.next_check, negate, nodeAddress);
        }
        else {
            if (useGlobalSeq && whitelist) {
                explanation = "The following patterns failed to match in sequence:\n\n" +
                    `${unmatchedPatterns.map(p => `- ${p}`).join("\n\n")}`;
            }
            else if (useGlobalSeq && !whitelist) {
                explanation = "The following patterns matched in sequence:\n\n" +
                    `${matchedPatterns.map(p => `- ${p}`).join("\n\n")}`;
            }
            else if (!useGlobalSeq && whitelist) {
                explanation = "The following patterns failed to match:\n\n" +
                    `${unmatchedPatterns.map(p => `- ${p}`).join("\n\n")}`;
            }
            else if (!useGlobalSeq && !whitelist) {
                explanation = "The following patterns matched:\n\n" +
                    `${matchedPatterns.map(p => `- ${p}`).join("\n\n")}`;
            }
            const newViolation = {
                node: nodeTrace,
                explanation: explanation,
                severity: policyNode.severity
            };
            evalState.violations.push(newViolation);
        }
    }
}
