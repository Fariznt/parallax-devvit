import type { Policy, ApiKeys, ModelRegistry, NodeIdentifier, DeferredCheck } from "../types.js";
import type { EvaluationState, EvalRouter } from "./types.js";
import {
  addToTrace,
} from "./utils.js"
import { assertSemanticCheck } from "../validator.js";

export function evalSemantic({
  evalState,
  policyNode, 
  negate,
  nodeAddress,
  evalNode,
}: {
  evalState: EvaluationState;
  policyNode: Policy;
  negate: boolean;
  nodeAddress: string;
  evalNode: EvalRouter;
}): void {
  assertSemanticCheck(policyNode, nodeAddress);
  const id: NodeIdentifier = addToTrace(evalState, policyNode, nodeAddress)

  const defCheck: DeferredCheck = {
    rule: policyNode.semantic_check.rule,
    negate: negate,
    severity: policyNode.severity,
    node_id: id
  }

  evalState.deferredChecks.push(defCheck)

  // no next checks is an enforced invariant. no other checks to do 
  // on this path

  id.result = "deferred"
}

export function doDeferredChecks(checks: DeferredCheck[]) {
  
  Error("function not implemented")
}

// LLM-only evaluation code---was here before policy tree implementation
// async evaluate(
//   {
//     text,
// 		imageUrl,
//     history,
//     apiKey,
//   }: {
//     text: string;
// 		imageUrl?: string | null;
//     history?: string[] | null;
//     apiKey?: string;
//   }
// ): Promise<EvaluationResult> {
// 		// undefined interpreted as null
// 		imageUrl ??= null;
// 		history ??= null; 

// 		if (imageUrl !== null) {
// 			console.warn("Image input detected but not yet supported; ignoring image.");
// 		}

// 		let key: string;
//     if (apiKey !== undefined) {
//         key = apiKey;
//     } else if (this.apiKey !== undefined) {
//         key = this.apiKey;
//     } else {
//         throw new Error("API key must be provided either at construction or evaluation time.");
//     }



//     // // temporary return for testing... remove
//     // const EvaluationResult = { remove: text.toLowerCase().includes("bananas"), justification: "text contains bananas" };
//     // return EvaluationResult;

//     // history intentionally ignored for now 
//     // void history;

//     const systemPrompt = this.buildSystemPrompt();
// 		const context = history ? `CONTEXT_START\n${history.join("\n")}\nCONTEXT_END` : null;
// 		const target = `TARGET_START\n${text}\nTARGET_END`;
// 		const rawResponse = await this.fetchLLMResponse(
// 			key,
// 			this.baseUrl,
// 			this.model,
// 			context,
// 			systemPrompt,
// 			target
// 		);
// 		console.log('raw response: ' + rawResponse);

// 		let parsed: unknown;
// 		try {
// 			parsed = JSON.parse(rawResponse);
// 		} catch {
// 			throw new Error("LLM did not return valid JSON");
// 		}

// 		console.log('parsed:' + parsed);
// 		// TODO: validate shape of returned JSON, define object for returned shape. also need to finalize shape eventually
// 		if (
// 			typeof parsed !== "object" ||
// 			parsed === null ||
// 			typeof (parsed as any).violation !== "boolean" ||
// 			typeof (parsed as any).explanation !== "string" ||
// 			typeof (parsed as any).modNote !== "string"
// 		) {
// 			throw new Error("Unexpected JSON shape");
// 		}

// 		const result = parsed as any; // replace with better typing later
//     return {
//       remove: result.violation,
// 			explanation: result.explanation,
//       modNote: result.modNote,
// 			trace: null, // TODO implement trace later
//     };
//   }

//   private buildSystemPrompt(): string {
//     //  TODO rewrite to use policy later
//     return (
//       'Evaluate the target message on whether it violates the policy (any context provided may or may not be relevant):' +
//       '1. Do not mention the word bananas explicitly.\n. ' +
//       'Your response should be in strict JSON format with no newlines, markdown, backticks. You MUST output NO other text beyond ' +
//       'JSON text in this format, where the bracketed text is replaced by you: ' +
//       '{ ' +
//       '"violation": [true OR false], ' +
//       '"confidence": [A value 0.00 to 1.00 corresponding to your confidence percentage, ' +
//       'where a higher value means higher confidence in your decision], ' +
//             '"explanation": [' +
//                 'Write a policy-grounded explanation.' +
//                 'STYLE: notes only; fragments OK; no full sentences; no grammar fixing.' +
//                 'USE: abbreviations, symbols (: / → + ()).' +
//                 'REQUIRE: rule name + trigger + why it applies.' +
//                 'FORBID: hedging, filler.' +
//             '], ' +
//             '"modNote": [' +
//                 'Shorten explanation field above into: "R[rule number], [1-2 phrase hint for human moderator].' +
//                 'OMIT: repeating words from the rule # mentioned, repeating your ruling on violation vs no violation, redundant wording' +
//                 'HARD LIMIT: ≤85 characters (count strictly). Any more is complete failure.' +
//                 'STYLE: ultra-compact; sentence fragments; no grammar fixing; incomplete representation of explanation or reason permitted.' +
//             ']' +
//       '"rule_id": "[The rule identifier, e.g. "1" or "3b"]", ' +
//       '}'
//     );
//   }


// async fetchLLMResponse(
//     apiKey: string, 
//     url: string, 
//     model: string, 
//     context: string | null, 
//     systemPrompt: string, 
//     text: string
// ): Promise<string> {

//     const messages = [
//         { role: "system" as const, content: systemPrompt },
//         ...(context !== null // optional context messages
//             ? [{ role: "user" as const, content: context }]
//             : []),
//         { role: "user" as const, content: text },
//     ];

//     console.log('messages: ' + JSON.stringify(messages));
    // const response = await fetch(url, {
    //     method: "POST",
    //     headers: {
    //         "Content-Type": "application/json",
    //         "Authorization": `Bearer ${apiKey}`,
    //     },
    //     body: JSON.stringify({
    //         model,
    //         messages,
    //         temperature: 0,
    //     }),
    // });

//     if (!response.ok) {
//         const errText = await response.text();
//         throw new Error(`API error ${response.status}: ${errText}`);
//     }

//     const data = await response.json();
//     console.log(data);

//     return data.choices[0].message.content;
// }