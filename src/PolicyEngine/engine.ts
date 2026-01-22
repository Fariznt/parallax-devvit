import { KeyValueStorage } from "@devvit/public-api/apis/key-value-storage/KeyValueStorage.js";
import {
  Policy,
  Predicate,
  Combinator,
  NodeSpecification,
	ModelConfig,
} from "./types.js";
import {
  NodeTrace,
  Violation,
  EvaluationResult,
	DeferredCheck,
	NodeEvaluator,
	EvaluationState,
} from "./handlers/types.js"
import { nodeEvaluators, getDispatchKey, doDeferredChecks } from "./handlers/index.js"; 
import { assertPolicy } from "./policy-validator.js";
import { normalize } from "./normalizer.js";
import { json } from "stream/consumers";

const debug = true

/**
 * TODO
 */
export class PolicyEngine {
  private readonly policyRoot: Policy;
	private readonly model: ModelConfig| null;
	private readonly noteMax: number; 

	/**
	 * TODO
	 * @param policy 
	 * @param model 
	 * @param noteMax 
	 */
  constructor(
		policy: Record<string, unknown>,
		model?: ModelConfig,
		noteMax: number = 100
  ) {
		assertPolicy(policy)
		normalize(policy)
		this.policyRoot = policy as Policy
		if (model 
			&& typeof model.baseUrl === "string"
			&& typeof model.modelName === "string"
		) {
			this.model = model
		} else {
			this.model = null
		}
		this.noteMax = noteMax
	}

	buildModNote(violations: Violation[]): string {
		const MAX = this.noteMax;

		const parts = violations.map(v => {
			const displayName = v.node.display_name?.trim();
			const fallback = String(v.node.type);
			return displayName || fallback;
		});

		// Builds "violated node 1, node 2, ... node n +X" 
		// where +X counts *unlisted* violations.
		const build = (k: number): string => {
			if (k <= 0) return `+${violations.length}`;
			const listed = parts.slice(0, k).join(", ");
			const unlistedCount = violations.length - k;
			return unlistedCount > 0 ? `${listed} +${unlistedCount}` : listed;
		};

		// If everything fits, return it.
		if (build(parts.length).length <= MAX) return build(parts.length);

		// Find the largest k such that "first k items + +N" fits.
		// O(n^2) worst-case but n is tiny (violations list size).
		for (let k = parts.length - 1; k >= 0; k--) {
			const s = build(k);
			if (s.length <= MAX) return s;
		}

		// Even "+N" might be > MAX only if N has absurd digits; edge case handling
		return build(0).slice(0, MAX);
	}


	/**
	 * TODO annotation
	 * @param param0 
	 */
	evaluateHelper(
		{
			doEarlyExit,
			text,
			imageUrl,
			contextList,
		}: {
			// content info and evaluation specifications
			doEarlyExit: boolean | null, // whether we do short-circuiting in all_of
			text: string;
			imageUrl: string | null;
			contextList: string[] | null;
		}
	): EvaluationState {
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
		function evalNode(node: Policy, negate: boolean, parentAddress: string): void {
			if (!node) {
				throw new Error("evalNode called on nonexistent node")
			}
			
			// construct address of childNode from parentAddress as `${parentAddress}/${nodeLabel(node)}`
			// or policy/nodeLabel(node) for root
			const nodeLabel = (policyNode: Policy): string => {
				if (typeof policyNode.name === "string" && policyNode.name.length > 0) {
					return policyNode.name;
				}
				const key = (Object.keys(nodeEvaluators) as string[]).find(k => k in policyNode);
				if (key) return key;
				return "policy";
			};
			const nodeAddress = `${parentAddress}/${nodeLabel(node)}`
			
			const key = getDispatchKey(node);
			nodeEvaluators[key]({
				evalState: evalState,
				policyNode: node,
				negate: negate,
				nodeAddress: nodeAddress, 
				evalNode: evalNode,
				doEarlyExit: doEarlyExit, 
				text: text, 
				imageUrl: imageUrl, 
				contextList: contextList,
			});	
		}

		evalNode(this.policyRoot, false, "policy")
		return evalState
	}

	async evaluate(
		{
			text,
			imageUrl,
			contextList,
			apiKey,
			doEarlyExit,
		}: {
			text: string;
			imageUrl?: string | null;
			contextList?: string[]| null;
			apiKey?: string | null;
			doEarlyExit?: boolean
		}
	): Promise<EvaluationResult> {
		// undefined interpreted as null
		imageUrl ??= null;
		contextList ??= null; 
		doEarlyExit ??= false
		apiKey ??= null

		const evalState: EvaluationState = this.evaluateHelper({ 
			doEarlyExit: doEarlyExit, 
			text: text, 
			imageUrl:imageUrl, 
			contextList: contextList, 
		});
		
		if (this.model === null || apiKey === null) {
			if (evalState.deferredChecks.length != 0) {
				throw new Error("Policy has semantic checks, but model or api key is not defined.")
			}
		} else {
			if (evalState.deferredChecks.length > 0) {
				await doDeferredChecks(
						evalState, contextList, text, this.model.baseUrl, this.model.modelName, apiKey)
			}

		}

		if (debug) {
			for (const v of evalState.violations) {
				console.log(
					`${v.node.display_name ?? "unnamed"}, ${v.node.type} Violation explanation:
					${v.explanation}`
				)
			}
		}

		const evalResult: EvaluationResult = {
			violations: evalState.violations,
			violation: evalState.violations.length > 0,
			modNote: this.buildModNote(evalState.violations),
			trace: evalState.trace,
			earlyExit: evalState.earlyExit,
		};
			
		return evalResult
	}

}
