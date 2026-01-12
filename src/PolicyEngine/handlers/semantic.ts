import type { NodeEvaluator } from "../types";


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