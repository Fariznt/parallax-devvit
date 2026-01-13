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
import * as _nodeEvaluators from "./handlers/index.js"; // hack-fix
import { assertPolicy } from "./validator.js"

const nodeEvaluators = // hack-fix of an import issue; TODO: do proper fix
  ((_nodeEvaluators as any).default ?? _nodeEvaluators) as typeof _nodeEvaluators;

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
		assertPolicy(opts.policyJson)
		this.policyRoot = opts.policyJson as Policy

    this.model = opts.modelName;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = (opts.apiKey);
  }

/**
 * 
 * @param param0 
 */
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
	/**
	 * Gets key used for indexing into PolicyEngine.nodeEvaluators appropriately.
	 * @param node 
	 * @returns the key of the evaluation function associated with this node type.
	 */
	function getDispatchKey(node: Policy): keyof typeof PolicyEngine.nodeEvaluators {
		if ("any_of" in node) return "any_of";
		if ("all_of" in node) return "all_of";
		if ("not" in node) return "not";

		for (const k of Object.keys(PolicyEngine.nodeEvaluators) as Array<
			keyof typeof PolicyEngine.nodeEvaluators
		>) {
			if (k in node) return k;
		}

		throw new Error(
			`Unidentifiable predicate or combinator found in Policy object; keys=${Object.keys(node).join(",")}`
		);
	}

	/**
	 * Function called by a node evaluator on a node (its child) when doing a downstream
	 * check is appropriate.
	 * @param state The current state of evaluation (violation, execution trac, etc.e)
	 * @param policyNode The next node/policy being evaluated, with information added to the same state
	 */
	function nextCheck(policyNode: Policy): void {
		const key = getDispatchKey(policyNode);
		console.log('Determined dispatch key: ' + key)
		console.log('Dispatching to function: ' + PolicyEngine.nodeEvaluators[key])
		PolicyEngine.nodeEvaluators[key]({
				evalState: evalState,
				policyNode: policyNode,
				nextCheck: nextCheck,
				doShortCircuit: doShortCircuit, 
				text: text, 
				imageUrl: imageUrl, 
				history: history, 
				apiKey: apiKey 
			});	
	}

	nextCheck(this.policyRoot)
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


	const PLACEHOLDER_EVALUATION_RESULT: EvaluationResult = {
		violations: [],
		violation: false,
		modNote: "",
		trace: [],
		shortCircuit: false,
	};
		
		// temp return
		return PLACEHOLDER_EVALUATION_RESULT
  }

}
