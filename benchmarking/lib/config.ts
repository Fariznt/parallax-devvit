import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// === Paths ===

export const BENCH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATASETS_DIR = path.join(BENCH_DIR, "datasets");
export const RESULTS_DIR = path.join(BENCH_DIR, "results");
export const CACHE_FILE = path.join(BENCH_DIR, "cache", "llm.jsonl");
const ENV_FILE = path.join(BENCH_DIR, ".env");

// === Defaults (CLI flag > benchmarking/.env > these) ===

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEFAULT_DELAY_MS = 4000; // ~15 requests/min, safe for Gemini's free tier

export type RunConfig = {
  dataset: string;
  policies: string[] | null; // null = every non-empty policy file of the dataset
  dataFile: string;
  sample: number | null; // null = all items
  seed: number;
  modelName: string;
  baseUrl: string;
  apiKey: string | null;
  reasoningEffort: string | null; // sent as reasoning_effort only when set
  delayMs: number;
  concurrency: number;
  retries: number;
  cache: boolean;
  earlyExit: boolean;
};

const USAGE = `Usage: npm run bench -- --dataset <name> [options]

  --dataset <name>       dataset directory under benchmarking/datasets/ (required)
  --policies <a,b,...>   policy file names (without .json) from the dataset's policies/
                         directory; default: every non-empty policy file
  --data <file>          data file in the dataset's data/ directory (default: data.jsonl)
  --sample <n>           evaluate a seeded random sample of n items (default: all)
  --seed <n>             sampling seed (default: 0)
  --model <name>         LLM model name           (env MODEL, default: ${DEFAULT_MODEL})
  --api-key <key>        LLM API key              (env KEY)
  --base-url <url>       OpenAI-compatible chat completions URL
                                                  (env BASE_URL, default: Gemini)
  --reasoning-effort <e> sent as reasoning_effort, e.g. none for gpt-6-luna
                                                  (env REASONING_EFFORT, default: not sent)
  --delay-ms <n>         min gap between real LLM requests (env DELAY_MS, default: ${DEFAULT_DELAY_MS})
  --concurrency <n>      evaluations in flight (default: 4)
  --retries <n>          retries per item on error (default: 3)
  --no-cache             don't read or write the LLM response cache
  --early-exit           pass doEarlyExit to the engine (all_of short-circuiting)
  -h, --help             show this message`;

/**
 * Parse CLI args into a RunConfig, filling unset values from benchmarking/.env then defaults.
 * Prints usage and exits on --help or bad input.
 */
export function loadConfig(argv: string[]): RunConfig {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        dataset: { type: "string" },
        policies: { type: "string" },
        data: { type: "string", default: "data.jsonl" },
        sample: { type: "string" },
        seed: { type: "string", default: "0" },
        model: { type: "string" },
        "api-key": { type: "string" },
        "base-url": { type: "string" },
        "reasoning-effort": { type: "string" },
        "delay-ms": { type: "string" },
        concurrency: { type: "string", default: "4" },
        retries: { type: "string", default: "3" },
        "no-cache": { type: "boolean", default: false },
        "early-exit": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (e) {
    exitWithUsage((e as Error).message);
  }

  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (!values.dataset) exitWithUsage("--dataset is required");

  const env = process.env;
  return {
    dataset: values.dataset,
    policies: values.policies ? values.policies.split(",").map(s => s.trim()).filter(Boolean) : null,
    dataFile: values.data,
    sample: values.sample !== undefined ? toCount("--sample", values.sample, 1) : null,
    seed: toCount("--seed", values.seed, 0),
    modelName: values.model ?? env.MODEL ?? DEFAULT_MODEL,
    baseUrl: (values["base-url"] ?? env.BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    apiKey: values["api-key"] ?? env.KEY ?? null,
    reasoningEffort: values["reasoning-effort"] ?? env.REASONING_EFFORT ?? null,
    delayMs: toCount("--delay-ms", values["delay-ms"] ?? env.DELAY_MS ?? String(DEFAULT_DELAY_MS), 0),
    concurrency: toCount("--concurrency", values.concurrency, 1),
    retries: toCount("--retries", values.retries, 0),
    cache: !values["no-cache"],
    earlyExit: values["early-exit"],
  };
}

function toCount(flag: string, raw: string, min: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) exitWithUsage(`${flag} must be an integer >= ${min}, got "${raw}"`);
  return n;
}

function exitWithUsage(message: string): never {
  console.error(`Error: ${message}\n\n${USAGE}`);
  process.exit(1);
}
