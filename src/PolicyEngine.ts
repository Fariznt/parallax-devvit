// PolicyEngine.ts

import { KeyValueStorage } from "@devvit/public-api/apis/key-value-storage/KeyValueStorage.js";

export type Policy =
  | { any_of: Policy[] }
  | { all_of: Policy[] }
  | { not: Policy[] | Policy }
  | ({
      name: string;
      "next-check"?: Policy;
    } & {
      [key: string]: Record<string, unknown> | Array<Record<string, unknown>>;
    });

export type Trace = unknown; // TODO: implement when policy format + traversal exist

export interface EvaluationResult {
  remove: boolean;
	explanation: string;
  modNote: string;
  // trace?: Trace;
}

type ChatMessage = { // todo necessary?
  role: "system" | "user" | "assistant" | "developer";
  content: string;
};

type OpenAIChatCompletionsResponse = { // TODO nmecessarY?
  choices: Array<{
    message?: { content?: string | null };
  }>;
};


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
  private readonly policyJson: Policy;

  constructor(opts: {
    policyJson: Record<string, unknown>;
    modelName: string;
    baseUrl: string; // PolicyEngine works with any OpenAI-compatible endpoint ex. OpenRouter
    apiKey?: string | undefined;
  }) {
		if (this.isPolicy(opts.policyJson)) {
			this.policyJson = opts.policyJson as Policy;
		} else {
			throw new Error("Provided policyJson is not a valid Policy.");
		}

    this.model = opts.modelName;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = (opts.apiKey);
  }

	// TODO: go over this validation function again later <<< esp. last check
	private isPolicy(x: unknown): x is Policy {
		if (typeof x !== "object" || x === null) return false;
		const o = x as Record<string, unknown>;

		if ("any_of" in o)
			return Array.isArray(o.any_of) && o.any_of.every(p => this.isPolicy(p));

		if ("all_of" in o)
			return Array.isArray(o.all_of) && o.all_of.every(p => this.isPolicy(p));

		if ("not" in o)
			return (
				(Array.isArray(o.not) && o.not.every(p => this.isPolicy(p)) && o.not.length === 1) 
				|| this.isPolicy(o.not)
			);

		if (typeof o.name !== "string") return false;
		if ("next-check" in o && !this.isPolicy(o["next-check"])) return false;

		return Object.entries(o).every(([k, v]) =>
			k === "name" || k === "next-check"
				? true
				: Array.isArray(v)
					? v.every(e => typeof e === "object" && e !== null)
					: typeof v === "object" && v !== null
		);
	}

  compile(): void {
    console.log("PolicyEngine tree compiled.");
    this.compiled = true;
  }

  // TODO: i basically skimmed up to here


  private buildSystemPrompt(): string {
    //  TODO rewrite to use policy later
    return (
      'Evaluate the target message on whether it violates the policy (any context provided may or may not be relevant):' +
      '1. Do not mention bananas by name\n. ' +
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
				'Summarize explanation field above. Omit repeating policy.' +
				'HARD LIMIT: ≤100 characters (count strictly).' +
				'STYLE: ultra-compact notes; fragments only; Incomplete permitted.' +
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


async evaluateSingle(
  {
    text,
    history,
    apiKey,
  }: {
    text: string;
    history?: string[];
    apiKey?: string;
  }
): Promise<EvaluationResult> {

		let key: string;
    if (apiKey !== undefined) {
        key = apiKey;
    } else if (this.apiKey !== undefined) {
        key = this.apiKey;
    } else {
        throw new Error("API key must be provided either at construction or evaluation time.");
    }

    // // temporary return for testing... remove
    // const EvaluationResult = { remove: text.toLowerCase().includes("bananas"), justification: "text contains bananas" };
    // return EvaluationResult;

    // history intentionally ignored for now 
    // void history;

    const systemPrompt = this.buildSystemPrompt();
		const context = history ? `CONTEXT_START\n${history.join("\n")}\nCONTEXT_END` : null;
		const target = `TARGET_START\n${text}\nTARGET_END`;
		const rawResponse = await this.fetchLLMResponse(
			key,
			this.baseUrl,
			this.model,
			context,
			systemPrompt,
			target
		);
		console.log('raw response: ' + rawResponse);

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawResponse);
		} catch {
			throw new Error("LLM did not return valid JSON");
		}

		console.log('parsed:' + parsed);
		// TODO: validate shape of returned JSON, define object for returned shape. also need to finalize shape eventually
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			typeof (parsed as any).violation !== "boolean" ||
			typeof (parsed as any).explanation !== "string" ||
			typeof (parsed as any).modNote !== "string"
		) {
			throw new Error("Unexpected JSON shape");
		}

		const result = parsed as any; // replace with better typing later
    return {
      remove: result.violation,
			explanation: result.explanation,
      modNote: result.modNote,
    };
  }

  async evaluateBatch(_text: string[], _history: string[] | null = null): Promise<EvaluationResult> {
    throw new Error("NotImplementedError");
  }
}
