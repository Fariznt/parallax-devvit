import type { EvaluationState, Policy, NodeIdentifier, Violation, NodeResult } from "../types.js";
import { assertMatchCheck } from "../validator.js";

function evalPatterns(patterns: string[], flags: string, text: string): {
  matchMask: boolean[];
  matchedPatterns: string[];
  unmatchedPatterns: string[];
} {
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
      matchedPatterns.push(pattern);
    } else {
      unmatchedPatterns.push(pattern);
    }
  }

  return { matchMask, matchedPatterns, unmatchedPatterns };
}

function getNodeId(
  name: string | undefined, nodeAddress: string, result: NodeResult
): NodeIdentifier {
  const id: NodeIdentifier = {
    display_name: name,
    address: nodeAddress,
    type: "match_check",
    result: result
  }
  return id
}

export function evalMatch({
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
  text: string;
}): void {
  assertMatchCheck(policyNode, nodeAddress)

  const id: NodeIdentifier = getNodeId(policyNode.name, nodeAddress, null)
  evalState.trace.push(id) 

  // future code for handling NOT smth like 
  // if (negate) { const whitelist = !policyNode.match_check.whitelist } else { below } 
  const whitelist = !policyNode.match_check.blacklist

  // extract regex args
  const patterns = policyNode.match_check.patterns; // list
  const flags = policyNode.match_check.flags ?? "" // string

  const { matchMask, matchedPatterns, unmatchedPatterns } = evalPatterns(patterns, flags, text);

  // useGlobalSeq means we will check if patterns match in sequence
  const useGlobalSeq = flags.includes('g'); 

  // Get failure/nonfailure from match mask
  let matched: boolean;
  if (useGlobalSeq) { matched = matchMask.every(m => m) } // all match
  else { matched = matchMask.some(m => m) } // some match
  let fail: boolean
  if (whitelist) { fail = !matched } // didnt match is failure for whitelist
  else { fail = matched } // did match is failure for blacklist

  // update evaluation result of this node in trace
  const result = fail ? "fail" : "pass"
  id.result = result

   // Generate variables for evalState change
  let explanation: string = ""; // Answers "Why did the check fail?"
  if (fail) {
    if (policyNode.next_check) {
      // there is a next check. This failure only means that we escalate to another node
      evalNode(policyNode.next_check, nodeAddress)
    } else {
      if (useGlobalSeq && whitelist) {
        explanation = `The following patterns required failed to match in sequence:
        ${unmatchedPatterns.map(p => `- ${p}`).join("\n")}`
      } else if (useGlobalSeq && !whitelist) {
        explanation = `The following disallowed patterns matched in sequence:
        ${matchedPatterns.map(p => `- ${p}`).join("\n")}`
      } else if (!useGlobalSeq && whitelist) {
        explanation = `The following patterns required failed to match:
        ${unmatchedPatterns.map(p => `- ${p}`).join("\n")}`
      } else if (!useGlobalSeq && !whitelist) {
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

  }
}
