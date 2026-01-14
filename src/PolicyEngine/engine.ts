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
		doShortCircuit,
		text,
		imageUrl,
    history,
    apiKey,
  }: {
		// content info and evaluation specifications
		doShortCircuit: boolean | null, // whether we do short-circuiting in logic nodes
    text: string;
		imageUrl?: string | null;
    history?: string[] | null;
    apiKey?: string;
  }
): void {
	// Init empty evaluation state---this will be mutated and carry the evaluation-related info
	// through the whole evaluation process,
	const evalState: EvaluationState = {
		violations: [],
		trace: [], 
		earlyExit: false,
		deferredChecks: []
	}

	/**
	 * Function called by a node evaluator on the node it was called on when doing a downstream
	 * check is appropriate.
	 * @param node The node with a .next_check that this function will execute
	 * @param parentAddress The address of parentNode. If not given, node assumed to be root.
	 */
	function evalNode(node: Policy, parentAddress?: string): void {
		if (!node) {
			throw new Error("evalNode called on nonexistent node")
		}
		
		// construct address of childNode from parentAddress as `${parentAddress}/${nodeLabel(node)}`
		// or policy/nodeLabel(node) for root
		const nodeLabel = (policyNode: Policy): string => {
			if (typeof policyNode.name === "string" && policyNode.name.length > 0) return policyNode.name;
			const key = (Object.keys(nodeEvaluators) as string[]).find(k => k in policyNode);
			if (key) return key;
			return "policy";
		};
		const base = parentAddress ?? "policy";
		const nodeAddress = `${base}/${nodeLabel(node)}`
		
		const key = getDispatchKey(node);
		console.log('Determined dispatch key: ' + key)
		console.log('Dispatching to function: ' + nodeEvaluators[key])
		nodeEvaluators[key]({
				evalState: evalState,
				policyNode: node,
				nodeAddress: nodeAddress, 
				evalNode: evalNode,
				doShortCircuit: doShortCircuit, 
				text: text, 
				imageUrl: imageUrl, 
				history: history, 
				apiKey: apiKey 
			});	
	}

	evalNode(this.policyRoot)
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




		this.evaluateHelper({ 
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
