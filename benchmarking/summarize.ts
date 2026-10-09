/**
 * Rebuild summary.json / summary.md of an existing results directory from its
 * {policy}.jsonl files (e.g. after a crashed run, or after changing metrics).
 *
 *   npx tsx benchmarking/summarize.ts benchmarking/results/<dataset>/<results dir>
 */
import { existsSync } from "node:fs";
import { writeSummary } from "./lib/summary.js";

const dir = process.argv[2];
if (!dir || !existsSync(dir)) {
  console.error("Usage: npx tsx benchmarking/summarize.ts <results dir>");
  process.exit(1);
}
writeSummary(dir, null);
console.log(`Wrote ${dir}/summary.json and ${dir}/summary.md`);
