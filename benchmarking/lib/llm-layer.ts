import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CallStats } from "./types.js";

/**
 * Sits between the policy engine and the LLM API by replacing globalThis.fetch
 * (the engine calls the global fetch at request time; see semantic.ts fetchLLMResponse).
 *
 * Only POSTs to the configured LLM URL made inside track() are intercepted:
 *  - cache: keyed on sha256(url + request body). The body holds the model, the engine's
 *    prompt with the batched conditions, and the target text, so identical requests from
 *    different policies share entries, and edited conditions/models/prompts miss.
 *  - rate limit: real requests start at least delayMs apart, across all concurrent evaluations.
 *  - stats: real fetches, cache hits and request time are added to the tracked CallStats.
 */
export class LLMLayer {
  private readonly context = new AsyncLocalStorage<{ stats: CallStats; pending: CacheEntry[] }>();
  private readonly realFetch = globalThis.fetch;
  private nextSlot = 0; // earliest start time (ms epoch) of the next real request

  constructor(
    private readonly opts: { url: string; delayMs: number; cache: ResponseCache | null }
  ) {}

  install(): void {
    globalThis.fetch = ((input, init) => this.fetch(input, init)) as typeof fetch;
  }

  /**
   * Run one evaluation attempt, counting its LLM traffic into `stats`. Responses it
   * fetched are only cached if fn resolves, so replies the engine rejected never get cached.
   */
  async track<T>(stats: CallStats, fn: () => Promise<T>): Promise<T> {
    const ctx = { stats, pending: [] as CacheEntry[] };
    const value = await this.context.run(ctx, fn);
    for (const entry of ctx.pending) this.opts.cache?.add(entry);
    return value;
  }

  private async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const ctx = this.context.getStore();
    const url = input instanceof Request ? input.url : String(input);
    if (!ctx || url !== this.opts.url || typeof init?.body !== "string") {
      return this.realFetch(input, init);
    }

    const key = createHash("sha256").update(`${url}\n${init.body}`).digest("hex");
    const cached = this.opts.cache?.get(key);
    if (cached !== undefined) {
      ctx.stats.cacheHits++;
      return new Response(cached, { status: 200, headers: { "Content-Type": "application/json" } });
    }

    await this.waitForSlot();
    ctx.stats.llmFetches++;
    const start = performance.now();
    try {
      const res = await this.realFetch(input, init);
      const body = await res.text();
      if (res.ok) {
        ctx.pending.push({ key, model: modelOf(init.body), createdAt: new Date().toISOString(), body });
      }
      return new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
      });
    } finally {
      ctx.stats.llmMs += performance.now() - start;
    }
  }

  /** Reserve the next start slot synchronously so concurrent callers stay spaced out. */
  private async waitForSlot(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.opts.delayMs;
    if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
  }
}

function modelOf(body: string): string | null {
  try {
    return JSON.parse(body).model ?? null;
  } catch {
    return null;
  }
}

// === Response cache ===

type CacheEntry = { key: string; model: string | null; createdAt: string; body: string };

/** Append-only jsonl of LLM responses, loaded into memory at startup. Delete the file to clear it. */
export class ResponseCache {
  private readonly entries = new Map<string, string>();

  constructor(private readonly file: string) {
    if (!existsSync(file)) return;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry: CacheEntry = JSON.parse(line);
        this.entries.set(entry.key, entry.body);
      } catch {
        // a line cut off by a crash mid-write; skip it
      }
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): string | undefined {
    return this.entries.get(key);
  }

  add(entry: CacheEntry): void {
    if (this.entries.has(entry.key)) return;
    this.entries.set(entry.key, entry.body);
    mkdirSync(path.dirname(this.file), { recursive: true });
    appendFileSync(this.file, JSON.stringify(entry) + "\n");
  }
}
