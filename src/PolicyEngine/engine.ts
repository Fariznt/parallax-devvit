// PolicyEngine.ts

import { KeyValueStorage } from "@devvit/public-api/apis/key-value-storage/KeyValueStorage.js";
import {
  Policy,
  LogicNode,
  EvaluatorNode,
  NodeSpecification,
  NodeIdentifier,
  Violation,
  EvaluationResult,
	DeferredCheck,
} from "./types.js";

export class InvalidLLMOutput extends Error {
  constructor(message = "LLM output could not be parsed or validated.") {
    super(message);
    this.name = "InvalidLLMOutput";
  }
}

export class PolicyEngine {
  private compiled = false;
  private root: unknown = null;

  private readonly apiKey: string | undefined; // may be provided at evaluation time
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly policyRoot: Policy;

  constructor(opts: {
    policyJson: Record<string, unknown>;
    modelName: string;
    baseUrl: string; // PolicyEngine works with any OpenAI-compatible endpoint ex. OpenRouter
    apiKey?: string | undefined;
  }) {
		if (this.isPolicy(opts.policyJson)) {
			this.policyRoot = opts.policyJson as Policy;
			console.log("PolicyEngine initialized with valid policyJson: " + JSON.stringify(this.policyRoot));
		} else {
			throw new Error("Provided policyJson is not a valid Policy.");
		}

    this.model = opts.modelName;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = (opts.apiKey);
  }

	/**
	 * Type validation for Policy objects. Also serves as syntax validation of user-inputted policy 
	 * under the DSL defined for policy-making.
	 * @param x (Potential) policy object
	 * @returns True if x is correctly shaped for a Policy object
	 */
	private isPolicy(x: unknown): x is Policy {
		if (typeof x !== "object" || x === null) return false;
		const o = x as Record<string, unknown>;
		
		// policy-trees rooted at logic nodes are valid if their children are valid
		if ("any_of" in o)
			return Array.isArray(o.any_of) && o.any_of.every(p => this.isPolicy(p));
		if ("all_of" in o)
			return Array.isArray(o.all_of) && o.all_of.every(p => this.isPolicy(p));
		if ("not" in o)
			return (
				(Array.isArray(o.not) && o.not.every(p => this.isPolicy(p)) && o.not.length === 1) ||
				this.isPolicy(o.not)
			); // rest of isPolicy validates evaluator nodes

		// names are optional, values are strings
		if ("name" in o && typeof o.name !== "string") return false;
		// next_check is optional, but if present value must be a valid policy
		if ("next_check" in o && !this.isPolicy(o.next_check)) return false;

		const checkNames = [
			"regex",
			"containment_check",
			"profanity_check",
			"length_check",
			"llm_check",
			"toxicity_check",
			"language",
		] as const;

		// exactly one evaluation check must be present at each level
		const presentChecks = checkNames.filter(k => k in o);
		if (presentChecks.length !== 1) return false;

		const k = presentChecks[0]!;
		const v = o[k] as unknown;

		if (typeof v !== "object" || v === null) return false;
		const spec = v as Record<string, unknown>;

		if (k === "regex") return typeof spec.template === "string";

		if (k === "containment_check")
			return Array.isArray(spec.blacklist) && spec.blacklist.every(s => typeof s === "string");

		if (k === "profanity_check")
			return spec.level === "mild" || spec.level === "moderate" || spec.level === "severe";

		if (k === "length_check") return typeof spec.length === "number";

		if (k === "llm_check") return typeof spec.prompt === "string";

		if (k === "toxicity_check")
			return (
				typeof spec.violation_threshold === "number" &&
				typeof spec.escalation_threshold === "number"
			);

		if (k === "language")
			return Array.isArray(spec.allowed) && spec.allowed.every(s => typeof s === "string");

		return false;
	}

  private buildSystemPrompt(): string {
    //  TODO rewrite to use policy later
    return (
      'Evaluate the target message on whether it violates the policy (any context provided may or may not be relevant):' +
      '1. Do not mention the word bananas explicitly.\n. ' +
      'Your response should be in strict JSON format with no newlines, markdown, backticks. You MUST output NO other text beyond ' +
      'JSON text in this format, where the bracketed text is replaced by you: ' +
      '{ ' +
      '"violation": [true OR false], ' +
      '"confidence": [A value 0.00 to 1.00 corresponding to your confidence percentage, ' +
      'where a higher value means higher confidence in your decision], ' +
			'"explanation": [' +
				'Write a policy-grounded explanation.' +
				'STYLE: notes only; fragments OK; no full sentences; no grammar fixing.' +
				'USE: abbreviations, symbols (: / → + ()).' +
				'REQUIRE: rule name + trigger + why it applies.' +
				'FORBID: hedging, filler.' +
			'], ' +
			'"modNote": [' +
				'Shorten explanation field above into: "R[rule number], [1-2 phrase hint for human moderator].' +
				'OMIT: repeating words from the rule # mentioned, repeating your ruling on violation vs no violation, redundant wording' +
				'HARD LIMIT: ≤85 characters (count strictly). Any more is complete failure.' +
				'STYLE: ultra-compact; sentence fragments; no grammar fixing; incomplete representation of explanation or reason permitted.' +
			']' +
      '"rule_id": "[The rule identifier, e.g. "1" or "3b"]", ' +
      '}'
    );
  }

async fetchLLMResponse(
	apiKey: string, 
	url: string, 
	model: string, 
	context: string | null, 
	systemPrompt: string, 
	text: string
): Promise<string> {

	const messages = [
		{ role: "system" as const, content: systemPrompt },
		...(context !== null // optional context messages
			? [{ role: "user" as const, content: context }]
			: []),
		{ role: "user" as const, content: text },
	];

	console.log('messages: ' + JSON.stringify(messages));

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages,
			temperature: 0,
		}),
	});

	if (!response.ok) {
		const errText = await response.text();
		throw new Error(`API error ${response.status}: ${errText}`);
	}

	const data = await response.json();
	console.log(data);

	return data.choices[0].message.content;
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



// TODO: WRITE ANNOTATION FOR THIS FUNCTION. RN ITS UGLY
evaluateHelper(
  {
		policyNode,
		trace,
		doShortCircuit,
		shortCircuitOccurred,
    text,
		imageUrl,
    history,
    apiKey,
  }: {
		// evaluation state
		policyNode: Policy, // current node in policy tree
		violations: Violation[], // accumulated violations so far
		parentAddress: string | null, // address of parent node, or null if at root; used to build current node address in the form <node type>@<parent address>
		trace: NodeIdentifier[], // record of execution through policy tree
		shortCircuitOccurred: boolean, // whether short-circuiting has already occurred in this evaluation
		deferredChecks: DeferredCheck[] // With short circuiting off, LLM calls can be batched outside of this helper. This is a list of expensive checks to do deferred for batching in the parent function.
		// content info and evaluation specifications
		doShortCircuit: boolean | null, // whether we do short-circuiting in logic nodes
    text: string;
		imageUrl?: string | null;
    history?: string[] | null;
    apiKey?: string;
  }
): void {

	if (Object.hasOwn(policyNode, "any_of")) {
		// any_of logic
		Error("Unsupported or unimplemented policy node type in input policy.");
		return
	}	else if (Object.hasOwn(policyNode, "all_of")) {
		// all_of logic
		Error("Unsupported or unimplemented policy node type in input policy.");
		return
	} else if (Object.hasOwn(policyNode, "not")) {
		// not logic
		Error("Unsupported or unimplemented policy node type in input policy.");
		return
	}	else if (Object.hasOwn(policyNode, "llm_check")) {
		Error("Unsupported or unimplemented policy node type in input policy.");
		// llm_check
		return
	} else if (Object.hasOwn(policyNode, "regex")) {
		Error("Unsupported or unimplemented policy node type in input policy.");
		// regex check
		return
	} else if (Object.hasOwn(policyNode, "containment_check")) { // wrap regex
		Error("Unsupported or unimplemented policy node type in input policy.");
		// containment_check
		return
	} else if (Object.hasOwn(policyNode, "profanity_check")) { // wrap containment_check
		Error("Unsupported or unimplemented policy node type in input policy.");
		// profanity_check
		return
	} else if (Object.hasOwn(policyNode, "length_check")) {
		Error("Unsupported or unimplemented policy node type in input policy.");
		// length_check
		return
	} else if (Object.hasOwn(policyNode, "toxicity_check")) {
		Error("Unsupported or unimplemented policy node type in input policy.");
		// toxicity_check
		return
	} else if (Object.hasOwn(policyNode, "language")) {
		Error("Unsupported or unimplemented policy node type in input policy.");
		// language check
		return
	} else {
		Error("Unsupported or unimplemented policy node type in input policy.");
	}
}

async evaluate(
  {
    text,
		imageUrl,
    history,
    apiKey,
  }: {
    text: string;
		imageUrl?: string | null;
    history?: string[] | null;
    apiKey?: string;
  }
): Promise<EvaluationResult> {
		// undefined interpreted as null
		imageUrl ??= null;
		history ??= null; 

		if (imageUrl !== null) {
			console.warn("Image input detected but not yet supported; ignoring image.");
		}

		let key: string;
    if (apiKey !== undefined) {
        key = apiKey;
    } else if (this.apiKey !== undefined) {
        key = this.apiKey;
    } else {
        throw new Error("API key must be provided either at construction or evaluation time.");
    }

		this.evaluateHelper({ 
			policyNode: this.policyRoot, 
			trace: trace, 
			shortCircuit: true, 
			text: text, 
			imageUrl:imageUrl, 
			history: history, 
			apiKey: key });


		result = { violation: false , explanation: null, modNote: null }; // temp. define properly using trace later
		
		return {
			remove: result.violation,
			explanation: result.explanation,
			modNote: result.modNote,
			trace: trace
		};
  }

}
