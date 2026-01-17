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
	ModelRegistry,
	ModelConfig,
	ApiKeys
} from "./types.js";
import { nodeEvaluators, getDispatchKey } from "./handlers/index.js"; 
import { assertPolicy } from "./validator.js";
import { normalize } from "./normalizer.js";

export class PolicyEngine {
  // private readonly baseUrl: string | undefined;
  // private readonly model: string | undefined;
  private readonly policyRoot: Policy;
	private readonly models: ModelRegistry; 

  constructor(opts: {
    policyJson: Record<string, unknown>;
		models?: ModelRegistry;
  }) {
		assertPolicy(opts.policyJson)
		normalize(opts.policyJson)
		this.policyRoot = opts.policyJson as Policy

		if (opts.models) {
			this.models = opts.models
		}
  }



/**
 * TODO
 * @param param0 
 */
evaluateHelper(
  {
		doEarlyExit,
		text,
		imageUrl,
    history,
    apiKeys,
  }: {
		// content info and evaluation specifications
		doEarlyExit: boolean | null, // whether we do short-circuiting in all_of
    text: string;
		imageUrl?: string | null;
    history?: string[] | null;
    apiKeys: ApiKeys;
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

	const models: ModelRegistry = this.models

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
				doEarlyExit: doEarlyExit, 
				text: text, 
				imageUrl: imageUrl, 
				history: history,
				models: models,
				apiKeys: apiKeys
			});	
	}

	evalNode(this.policyRoot)
}

async evaluate(
  {
    text,
		imageUrl,
    history,
    apiKeys,
		doEarlyExit,
  }: {
    text: string;
		imageUrl?: string | null;
    history?: string[]| null;
    apiKeys: ApiKeys;
		doEarlyExit?: boolean
  }
): Promise<EvaluationResult> {
		// undefined interpreted as null
		imageUrl ??= null;
		history ??= null; 
		doEarlyExit ??= false

		if (imageUrl !== null) {
			console.warn("Image input detected but not yet supported; ignoring image.");
		}


		this.evaluateHelper({ 
			doEarlyExit: doEarlyExit, 
			text: text, 
			imageUrl:imageUrl, 
			history: history, 
			apiKeys: apiKeys
		});


	const PLACEHOLDER_EVALUATION_RESULT: EvaluationResult = {
		violations: [],
		violation: false,
		modNote: "",
		trace: [],
		earlyExit: false,
	};
		
		// temp return
		return PLACEHOLDER_EVALUATION_RESULT
  }

}
