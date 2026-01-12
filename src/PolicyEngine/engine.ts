// PolicyEngine.ts

import { KeyValueStorage } from "@devvit/public-api/apis/key-value-storage/KeyValueStorage.js";
import {
  Policy,
  Predicate,
  Combinator,
  NodeSpecification,
  NodeIdentifier,
  Violation,
  EvaluationResult,
	DeferredCheck,
	NodeEvaluator,
	EvaluationState,
} from "./types.js";
import * as nodeEvaluators from "./handlers/index.js";
import { isPolicy } from "./validator.js"


export class PolicyEngine {

  private static readonly nodeEvaluators: Record<string, NodeEvaluator> = {
    any_of: nodeEvaluators.evalAnyOf,
    all_of: nodeEvaluators.evalAllOf,
    not: nodeEvaluators.evalNot,
    regex: nodeEvaluators.evalRegex,
    semantic: nodeEvaluators.evalSemantic,
    language: nodeEvaluators.evalLanguage,
    safety: nodeEvaluators.evalSafety,
  };
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
		if (isPolicy(opts.policyJson)) {
			this.policyRoot = opts.policyJson as Policy;
			console.log("PolicyEngine initialized with valid policyJson: " + JSON.stringify(this.policyRoot));
		} else {
			throw new Error("Provided policyJson is not a valid Policy.");
		}

    this.model = opts.modelName;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = (opts.apiKey);
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

// TODO: WRITE ANNOTATION FOR THIS FUNCTION. RN ITS UGLY
evaluateHelper(
  {
		evalState,
		doShortCircuit,
    text,
		imageUrl,
    history,
    apiKey,
  }: {
		// evaluation state
		evalState: EvaluationState,
		// content info and evaluation specifications
		doShortCircuit: boolean | null, // whether we do short-circuiting in logic nodes
    text: string;
		imageUrl?: string | null;
    history?: string[] | null;
    apiKey?: string;
  }
): void {
	function getDispatchKey(node: unknown): keyof typeof PolicyEngine.nodeEvaluators {
		const o = node as Record<string, unknown>;

		if ("any_of" in o) return "any_of";
		if ("all_of" in o) return "all_of";
		if ("not" in o) return "not";

		for (const k of Object.keys(PolicyEngine.nodeEvaluators) as Array<
			keyof typeof PolicyEngine.nodeEvaluators
		>) {
			if (k in o) return k;
		}

		throw new Error(
			`Unidentifiable predicate or combinator found in Policy object; keys=${Object.keys(o).join(",")}`
		);
	}

	function nextCheck(state: EvaluationState): void {
		PolicyEngine.nodeEvaluators[key]({
				evalState: state,
				doShortCircuit: doShortCircuit, 
				text: text, 
				imageUrl: imageUrl, 
				history: history, 
				apiKey: apiKey 
			});	
	}

  const key = getDispatchKey(evalState.policyNode);
  return PolicyEngine.nodeEvaluators[key]({
		evalState: evalState,
		nextCheck: nextCheck,
		doShortCircuit: doShortCircuit, 
		text: text, 
		imageUrl: imageUrl, 
		history: history, 
		apiKey: apiKey 
	});
}

async evaluate(
  {
    text,
		imageUrl,
    history,
    apiKey,
		shortCircuit
  }: {
    text: string;
		imageUrl?: string | null;
    history?: string[] | null;
    apiKey?: string;
		shortCircuit?: boolean
  }
): Promise<EvaluationResult> {
		// undefined interpreted as null
		imageUrl ??= null;
		history ??= null; 
		shortCircuit ??= false

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


		let evalState: EvaluationState = {
				policyNode: this.policyRoot, 
				violations: [],
				parentAddress: null,
				trace: [], 
				shortCircuitOccurred: false,
				deferredChecks: []
		}

		this.evaluateHelper({ 
			evalState,
			doShortCircuit: shortCircuit, 
			text: text, 
			imageUrl:imageUrl, 
			history: history, 
			apiKey: key 
		});


		result = { violation: false , explanation: null, modNote: null }; // temp. define properly using trace later
		
		return {
			remove: result.violation,
			explanation: result.explanation,
			modNote: result.modNote,
			trace: trace
		};
  }

}
