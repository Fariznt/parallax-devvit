import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ItemResult } from "./types.js";

// === Metrics ===

export type Metrics = {
  n: number; // evaluated without error
  errors: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  baseRate: number | null; // fraction labeled violating
  positiveRate: number | null; // fraction predicted violating
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
};

export type PolicySummary = Metrics & {
  llmCallRate: number | null; // fraction of items whose evaluation needed the LLM (cache-independent)
  llmFetches: number; // real requests sent this run
  cacheHits: number;
  msPerRequest: number | null; // mean time of a real request
  msPerRequestP95: number | null;
  byCategory: Record<string, Metrics>; // keyed by metadata.categories values, largest first
};

export type Summary = {
  config: Record<string, unknown> | null;
  policies: Record<string, PolicySummary>;
};

export function computeMetrics(rows: ItemResult[]): Metrics {
  const m = { n: 0, errors: 0, tp: 0, fp: 0, tn: 0, fn: 0 };
  for (const r of rows) {
    if (r.prediction === null) { m.errors++; continue; }
    m.n++;
    if (r.prediction && r.label) m.tp++;
    else if (r.prediction && !r.label) m.fp++;
    else if (!r.prediction && !r.label) m.tn++;
    else m.fn++;
  }
  const precision = ratio(m.tp, m.tp + m.fp);
  const recall = ratio(m.tp, m.tp + m.fn);
  return {
    ...m,
    baseRate: ratio(m.tp + m.fn, m.n),
    positiveRate: ratio(m.tp + m.fp, m.n),
    accuracy: ratio(m.tp + m.tn, m.n),
    precision,
    recall,
    f1: precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null,
  };
}

export function summarizePolicy(rows: ItemResult[]): PolicySummary {
  const ok = rows.filter(r => r.prediction !== null);
  const fetched = rows.filter(r => r.llmFetches > 0);
  const llmFetches = sum(rows.map(r => r.llmFetches));

  const byCategoryRows = new Map<string, ItemResult[]>();
  for (const r of rows) {
    const categories = r.metadata.categories;
    if (!Array.isArray(categories)) continue;
    for (const c of categories) {
      if (typeof c !== "string") continue;
      if (!byCategoryRows.has(c)) byCategoryRows.set(c, []);
      byCategoryRows.get(c)!.push(r);
    }
  }
  const byCategory = Object.fromEntries(
    [...byCategoryRows.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([c, rs]) => [c, computeMetrics(rs)])
  );

  return {
    ...computeMetrics(rows),
    llmCallRate: ratio(ok.filter(r => r.llmCalled).length, ok.length),
    llmFetches,
    cacheHits: sum(rows.map(r => r.cacheHits)),
    msPerRequest: ratio(sum(rows.map(r => r.llmMs)), llmFetches),
    msPerRequestP95: percentile(fetched.map(r => r.llmMs / r.llmFetches), 0.95),
    byCategory,
  };
}

function ratio(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

// === Results directory I/O ===

/** Read every {policy}.jsonl in a results directory. */
export function readResults(dir: string): Record<string, ItemResult[]> {
  const results: Record<string, ItemResult[]> = {};
  for (const file of readdirSync(dir).filter(f => f.endsWith(".jsonl")).sort()) {
    results[file.slice(0, -".jsonl".length)] = readFileSync(path.join(dir, file), "utf8")
      .split("\n")
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }
  return results;
}

/**
 * (Re)compute the summary of a results directory from its jsonl files and write
 * summary.json + summary.md. config = null keeps the config of an existing summary.json.
 */
export function writeSummary(dir: string, config: Record<string, unknown> | null): Summary {
  const jsonPath = path.join(dir, "summary.json");
  if (config === null && existsSync(jsonPath)) {
    config = JSON.parse(readFileSync(jsonPath, "utf8")).config ?? null;
  }
  const policies = Object.fromEntries(
    Object.entries(readResults(dir)).map(([name, rows]) => [name, summarizePolicy(rows)])
  );
  const summary: Summary = { config, policies };
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(path.join(dir, "summary.md"), renderMarkdown(summary));
  return summary;
}

// === Markdown rendering ===

export function renderMarkdown({ policies }: Summary): string {
  const rows = Object.entries(policies).map(([name, p]) =>
    `| ${name} | ${p.tp} | ${p.tn} | ${p.fp} | ${p.fn} | ${p.f1 === null ? "–" : p.f1.toFixed(3)} |`
  );
  return [
    "| policy | TP | TN | FP | FN | F1 |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}
