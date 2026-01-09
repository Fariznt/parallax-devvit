// PolicyEngine.ts

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
  justification: string;
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
    console.log("compilation placeholder");
    this.compiled = true;
  }

  // TODO: i basically skimmed up to here


  private buildSystemPrompt(): string {
    // Kept very close to your Python string; consider rewriting later for cleanliness.
    return (
      'Ignore user message history. Evaluate each individual message on whether it violates the policy: ' +
      '1. Dont be mean\n. ' +
      'Your response should be in strict JSON format. You MUST output NO other text beyond ' +
      'JSON text in this format, where the bracketed text is replaced by you: ' +
      '{ ' +
      '"violation": [strictly "true" or "false" without quotes], ' +
      '"confidence": [A value 0.00 to 1.00 corresponding to your confidence percentage, ' +
      'where a higher value means higher confidence in your decision], ' +
      '"justification": [One sentence, policy-grounded justification. ' +
      'N/A permitted for simple cases if violation == false], ' +
      '"rule_id": "[The rule identifier, e.g. "1" or "3b"]", ' +
      '}'
    );
  }

  private async createChatCompletion(messages: ChatMessage[]): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.0,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as OpenAIChatCompletionsResponse;
    const raw = data.choices?.[0]?.message?.content ?? null;

    if (typeof raw !== "string" || raw.trim().length === 0) {
      throw new InvalidLLMOutput("LLM returned empty content.");
    }

    return raw;
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

    if (apiKey !== undefined) {
        const key = apiKey;
    } else if (this.apiKey !== undefined) {
        const key = this.apiKey;
    } else {
        throw new Error("API key must be provided either at construction or evaluation time.");
    }

    // temporary return for testing
    const EvaluationResult = { remove: text.toLowerCase().includes("bananas"), justification: "text contains bananas" };
    return EvaluationResult;

    // history intentionally ignored for now 
    void history;

    const systemPrompt = this.buildSystemPrompt();

    const rawResponse = await this.createChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ]);

    console.log(`raw_response:\n ${rawResponse}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (e) {
      throw new InvalidLLMOutput("LLM output could not be parsed as JSON.");
    }

    // Validate shape minimally
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("violation" in parsed) ||
      !("justification" in parsed)
    ) {
      throw new InvalidLLMOutput("LLM JSON missing required keys.");
    }

    const obj = parsed as { violation: unknown; justification: unknown };

    if (typeof obj.justification !== "string") {
      throw new InvalidLLMOutput("LLM JSON 'justification' must be a string.");
    }

    // Python took whatever is in "violation". Here we coerce common cases safely.
    let remove: boolean;
    if (typeof obj.violation === "boolean") {
      remove = obj.violation;
    } else if (typeof obj.violation === "string") {
      const v = obj.violation.trim().toLowerCase();
      if (v === "true") remove = true;
      else if (v === "false") remove = false;
      else throw new InvalidLLMOutput("LLM JSON 'violation' must be boolean or 'true'/'false'.");
    } else {
      throw new InvalidLLMOutput("LLM JSON 'violation' must be boolean or 'true'/'false'.");
    }

    return {
      remove,
      justification: obj.justification,
    };
  }

  async evaluateBatch(_text: string[], _history: string[] | null = null): Promise<EvaluationResult> {
    throw new Error("NotImplementedError");
  }

  async evaluate(text: string | string[], history: string[] | null = null): Promise<EvaluationResult> {
    if (!this.compiled) throw new Error("PolicyEngine must be compiled before evaluation.");

    if (Array.isArray(text)) {
      return this.evaluateBatch(text, history);
    }
    return this.evaluateSingle(text, history);
  }
}
