/**
 * Benchmark PDN policies against one dataset.
 *
 *   npm run bench -- --dataset measuring-hate-speech --policies regex,parallax --sample 500
 *   npm run bench -- --help
 *
 * Each policy is a single PDN policy in datasets/{dataset}/policies/{name}.json and is run
 * over the same (optionally sampled) items from datasets/{dataset}/data/. Raw per-item
 * results ({policy}.jsonl) and summary.json / summary.md are written to
 * results/{dataset}/results-{timestamp}/.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { CACHE_FILE, RESULTS_DIR, loadConfig } from "./lib/config.js";
import { datasetDir, loadItems, loadPolicies, sampleItems } from "./lib/data.js";
import { createParallaxEvaluator } from "./lib/evaluator.js";
import { LLMLayer, ResponseCache } from "./lib/llm-layer.js";
import { runPolicy } from "./lib/runner.js";
import { writeSummary } from "./lib/summary.js";

async function main(): Promise<void> {
  const config = loadConfig(process.argv.slice(2));
  const dir = datasetDir(config.dataset);
  const items = sampleItems(loadItems(path.join(dir, "data", config.dataFile)), config.sample, config.seed);
  const policies = loadPolicies(path.join(dir, "policies"), config.policies);

  // Build every engine before evaluating anything so invalid PDN or a missing key fails fast
  const evaluators = policies.map(p => {
    try {
      return { name: p.name, evaluate: createParallaxEvaluator(p.json, config) };
    } catch (e) {
      throw new Error(`Policy "${p.name}" (${p.file}): ${(e as Error).message}`);
    }
  });

  const cache = config.cache ? new ResponseCache(CACHE_FILE) : null;
  const layer = new LLMLayer({ url: config.baseUrl, delayMs: config.delayMs, cache });
  layer.install();

  const outDir = path.join(RESULTS_DIR, config.dataset, `results-${timestamp()}`);
  mkdirSync(outDir, { recursive: true });

  const { apiKey: _, ...publicConfig } = config; // never write the key to disk
  const runInfo = {
    ...publicConfig,
    policies: evaluators.map(e => e.name),
    items: items.length,
    startedAt: new Date().toISOString(),
  };

  console.error(`${config.dataset}: ${items.length} items, policies: ${runInfo.policies.join(", ")}`);
  console.error(cache ? `LLM cache: ${cache.size} entries` : "LLM cache: off");

  for (const { name, evaluate } of evaluators) {
    const file = path.join(outDir, `${name}.jsonl`);
    let done = 0;
    let errors = 0;
    await runPolicy(items, evaluate, {
      layer,
      concurrency: config.concurrency,
      retries: config.retries,
      onResult: result => {
        appendFileSync(file, JSON.stringify(result) + "\n");
        done++;
        if (result.error) errors++;
        process.stderr.write(`\r[${name}] ${done}/${items.length}  errors: ${errors}`);
      },
    });
    process.stderr.write("\n");
  }

  const summary = writeSummary(outDir, { ...runInfo, finishedAt: new Date().toISOString() });
  for (const [name, p] of Object.entries(summary.policies)) {
    const f = (x: number | null) => (x === null ? "–" : x.toFixed(3));
    console.log(
      `${name}: n=${p.n} errors=${p.errors} acc=${f(p.accuracy)} P=${f(p.precision)} R=${f(p.recall)} ` +
      `F1=${f(p.f1)} llm-call-rate=${f(p.llmCallRate)} fetches=${p.llmFetches} cache-hits=${p.cacheHits}`
    );
  }
  console.log(`\nResults: ${outDir}`);
}

/** Local time as YYYY-MM-DD_HH-MM-SS */
function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
