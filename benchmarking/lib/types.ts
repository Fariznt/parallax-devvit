// === Shared benchmark types ===

/**
 * One line of a dataset's common-format jsonl (datasets/{name}/data/*.jsonl),
 * produced by that dataset's preprocessing.py.
 */
export type BenchItem = {
  id: string;
  text: string;
  label: boolean; // true = a correct policy should flag this as a violation
  // free-form, passed through to raw results. If `categories` is a string[],
  // the summary also reports metrics per category.
  metadata?: Record<string, unknown>;
};

/** What an Evaluator returns for one piece of text. */
export type Evaluation = {
  violation: boolean;
  llmCalled: boolean; // whether evaluating this policy required an LLM call (independent of caching)
  result: unknown; // evaluator-specific raw output, stored as-is (EvaluationResult for Parallax)
};

/** LLM traffic actually incurred for one item in this run (see llm-layer.ts) */
export type CallStats = {
  llmFetches: number; // real network requests sent
  cacheHits: number;
  llmMs: number; // time spent inside real requests
};

/** One line of results/{dataset}/results-{timestamp}/{policy}.jsonl */
export type ItemResult = {
  id: string;
  text: string;
  label: boolean;
  metadata: Record<string, unknown>;
  prediction: boolean | null; // null when the item errored
  correct: boolean | null;
  llmCalled: boolean | null;
  llmFetches: number;
  cacheHits: number;
  llmMs: number;
  latencyMs: number; // wall time, including rate limiter waits and retries
  attempts: number;
  error: string | null;
  result: unknown | null;
};
