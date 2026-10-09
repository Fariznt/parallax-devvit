import type { Evaluator } from "./evaluator.js";
import type { LLMLayer } from "./llm-layer.js";
import type { BenchItem, CallStats, ItemResult } from "./types.js";

/**
 * Evaluate every item with a pool of `concurrency` workers, retrying failed items
 * with exponential backoff. onResult is called as each item finishes (completion order).
 */
export async function runPolicy(
  items: BenchItem[],
  evaluate: Evaluator,
  { layer, concurrency, retries, onResult }: {
    layer: LLMLayer;
    concurrency: number;
    retries: number;
    onResult: (result: ItemResult) => void;
  }
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      onResult(await evaluateItem(item, evaluate, layer, retries));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

async function evaluateItem(
  item: BenchItem,
  evaluate: Evaluator,
  layer: LLMLayer,
  retries: number
): Promise<ItemResult> {
  // accumulates over all attempts, so retries count toward what the item cost
  const stats: CallStats = { llmFetches: 0, cacheHits: 0, llmMs: 0 };
  const start = performance.now();
  const base = { id: item.id, text: item.text, label: item.label, metadata: item.metadata ?? {} };
  const timing = () => ({ ...stats, llmMs: Math.round(stats.llmMs), latencyMs: Math.round(performance.now() - start) });

  let error: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const evaluation = await layer.track(stats, () => evaluate(item.text));
      return {
        ...base,
        prediction: evaluation.violation,
        correct: evaluation.violation === item.label,
        llmCalled: evaluation.llmCalled,
        ...timing(),
        attempts: attempt,
        error: null,
        result: evaluation.result,
      };
    } catch (e) {
      error = e;
      if (attempt <= retries) await sleep(backoffMs(attempt));
    }
  }

  return {
    ...base,
    prediction: null,
    correct: null,
    llmCalled: null,
    ...timing(),
    attempts: retries + 1,
    error: error instanceof Error ? error.message : String(error),
    result: null,
  };
}

/** ~1s, 2s, 4s, ... with +-50% jitter */
function backoffMs(attempt: number): number {
  return 1000 * 2 ** (attempt - 1) * (0.5 + Math.random());
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
