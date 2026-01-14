// ts

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
import { nodeEvaluators, getDispatchKey } from "./handlers/index.js"; // hack-fix
import { assertPolicy } from "./validator.js"

export class PolicyEngine {
  private readonly apiKey: string | undefined; // may be provided at evaluation time
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly policyRoot: Policy;

  constructor(opts: {
    policyJson: Record<string, unknown>;
    modelName: string;
    baseUrl: string; // works with any OpenAI-compatible endpoint ex. OpenRouter
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
	 * Function called by a node evaluator on the node it was called on when doing a downstream
	 * check is appropriate.
	 * @param parentNode The node with a .next_check that this function will execute
	 * @param parentAddress The address of parentNode
	 */
	function doNextCheck(parentNode: Policy, parentAddress?: string): void {
		const childNode = parentNode.next_check;
		if (!childNode) {
			throw new Error("Next check called on node with no downstream check. \
				Verify this node has .next_check field")
		}

		// constructs address of childNode from parentAddress as <child name or type>/parentAddress
		// root has address policy/<name or type> e.g. policy/all_of
		const nodeLabel = (policyNode: Policy): string => {
			if (typeof policyNode.name === "string" && policyNode.name.length > 0) {
				return policyNode.name;
			}
			const k = getDispatchKey(policyNode);
			return String(k);
		};
		const base = parentAddress ?? "policy";
		const childAddress = `${base}/${nodeLabel(childNode)}`;
		
		const key = getDispatchKey(childNode);
		console.log('Determined dispatch key: ' + key)
		console.log('Dispatching to function: ' + nodeEvaluators[key])
		nodeEvaluators[key]({
				evalState: evalState,
				policyNode: childNode,
				nodeAddress: childAddress, 
				doNextCheck: doNextCheck,
				doShortCircuit: doShortCircuit, 
				text: text, 
				imageUrl: imageUrl, 
				history: history, 
				apiKey: apiKey 
			});	
	}

	doNextCheck(this.policyRoot)
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
