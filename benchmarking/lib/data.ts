import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DATASETS_DIR } from "./config.js";
import type { BenchItem } from "./types.js";

/** Absolute path of a dataset directory; errors listing the available datasets if missing. */
export function datasetDir(dataset: string): string {
  const dir = path.join(DATASETS_DIR, dataset);
  if (!existsSync(dir)) {
    const available = readdirSync(DATASETS_DIR).join(", ");
    throw new Error(`Unknown dataset "${dataset}". Available: ${available}`);
  }
  return dir;
}

// === Items ===

/** Load and validate a common-format jsonl file. */
export function loadItems(file: string): BenchItem[] {
  if (!existsSync(file)) {
    throw new Error(`Data file not found: ${file}\nRun the dataset's preprocessing.py first.`);
  }
  const items: BenchItem[] = [];
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const x = JSON.parse(line);
    if (typeof x.id !== "string" || typeof x.text !== "string" || typeof x.label !== "boolean") {
      throw new Error(`${file}:${i + 1}: expected {id: string, text: string, label: boolean, metadata?}`);
    }
    items.push(x);
  });
  return items;
}

/**
 * Seeded random sample of n items (Fisher-Yates over a copy). Same file + seed + n
 * gives the same items. n = null returns all items in file order.
 */
export function sampleItems(items: BenchItem[], n: number | null, seed: number): BenchItem[] {
  if (n === null) return items;
  const rand = mulberry32(seed);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// === Policies ===

export type LoadedPolicy = {
  name: string; // file name without .json
  file: string;
  json: Record<string, unknown>; // a single PDN policy root
};

/**
 * Load policies from a dataset's policies/ directory. `names` = null loads every
 * non-empty .json file (empty placeholders are skipped with a warning); explicitly
 * named files must exist and be non-empty.
 */
export function loadPolicies(dir: string, names: string[] | null): LoadedPolicy[] {
  const explicit = names !== null;
  names ??= readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => f.slice(0, -".json".length))
    .sort();

  const policies: LoadedPolicy[] = [];
  for (const name of names) {
    const file = path.join(dir, `${name}.json`);
    if (!existsSync(file)) throw new Error(`Policy "${name}" not found at ${file}`);

    const raw = readFileSync(file, "utf8");
    if (!raw.trim()) {
      if (explicit) throw new Error(`Policy file ${file} is empty`);
      console.warn(`Skipping empty policy file ${file}`);
      continue;
    }

    const json = JSON.parse(raw);
    if (typeof json !== "object" || json === null || Array.isArray(json)) {
      throw new Error(`Policy file ${file} must contain a single PDN policy object`);
    }
    policies.push({ name, file, json });
  }

  if (policies.length === 0) throw new Error(`No policies to run in ${dir}`);
  return policies;
}
