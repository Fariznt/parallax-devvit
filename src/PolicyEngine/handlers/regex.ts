import type { EvaluationState, Policy, NodeIdentifier, Violation } from "../types.js";
import { assertRegexCheck } from "../validator.js";

export function evalRegex({
  evalState, // evaluation state (info accumulator)
	policyNode, // the node this was called for
  nodeAddress,
	evalNode, // function to do checks on a child node
  // content info and evaluation specifications
  text,
}: {
  evalState: EvaluationState;
	policyNode: Policy;
	nodeAddress: string;
	evalNode: (node: Policy, parentAddress: string) => void;
  doEarlyExit: boolean | null; 
  text: string;
  imageUrl?: string | null;
  history?: string[] | null;
  apiKey?: string;
}): void {
	console.warn('Regex nodes are not implemented')
  assertRegexCheck(policyNode, nodeAddress)
  // future code for handling NOT
  // if (negate) { const whitelist = !policyNode.regex_check.whitelist } else { below } 
  const whitelist = policyNode.regex_check.whitelist

  // extract regex args
  const patterns = policyNode.regex_check.patterns; // list
  const flags = policyNode.regex_check.flags ?? "" // string

  // set up accumulators for looped matching
  const matchMask: boolean[] = []; 
  let matchedPatterns: string[] = [];
  let unmatchedPatterns: string[] = [];

  // useGlobalSeq means we will check if patterns match in sequence
  const useGlobalSeq = flags.includes('g'); 
  let pos = 0;

  for (const pattern of patterns) {
    const r = new RegExp(pattern, flags);

    let matched: boolean;

    if (useGlobalSeq) {
      r.lastIndex = pos; // start where the previous pattern left off
      const m = r.exec(text);
      matched = m !== null;
      if (matched) pos = r.lastIndex; // advance shared cursor only on success
    } else {
      matched = r.test(text);
    }

    matchMask.push(matched);
    if (matched) {
      matchedPatterns.push(pattern)
    } else {
      unmatchedPatterns.push(pattern)
    }
  }

  // Get failure/nonfailure from match mask
  let matched: boolean;
  if (useGlobalSeq) { matched = matchMask.every(m => m) } // all match
  else { matched = matchMask.some(m => m) } // some match
  let fail: boolean
  if (whitelist) { fail = !matched } // didnt match is failure for whitelist
  else { fail = matched } // did match is failure for blacklist

  // Generate variables for evalState change
  let result: "pass" | "fail" | "deferred" = fail ? "fail" : "pass"
  const id: NodeIdentifier = {
    display_name: policyNode.name,
    address: nodeAddress,
    type: "regex_check",
    result: result
  }

  let explanation: string = ""; // Answers "Why did the check fail?"
  if (fail) {
    if (useGlobalSeq && whitelist) {
      explanation = `The following patterns required failed to match:
      ${unmatchedPatterns.map(p => `- ${p}`).join("\n")}`
    } else if (useGlobalSeq && !whitelist) {
      explanation = `The following disallowed patterns matched:
      ${matchedPatterns.map(p => `- ${p}`).join("\n")}`
    }

    const newViolation: Violation = {
      node: id,
      explanation: explanation,
      severity: policyNode.severity
    }
    evalState.violations.push(newViolation)
  }

  evalState.trace.push(id)
}
