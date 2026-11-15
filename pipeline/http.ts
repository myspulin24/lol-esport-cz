// R10/D15: každý dotaz má timeout 20 s a nejvýš 2 opakování (5 s, 15 s);
// každý zdroj má rozpočet 3 min, po jehož překročení se počítá jako neúspěšný.

import { sleep } from './util';

export const REQUEST_TIMEOUT_MS = 20_000;
export const RETRY_DELAYS_MS = [5_000, 15_000];
export const SOURCE_BUDGET_MS = 180_000;

export class BudgetExceededError extends Error {
  constructor(source: string) {
    super(`${source}: překročen rozpočet ${SOURCE_BUDGET_MS / 1000} s`);
  }
}

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retryDelaysMs?: number[];
  deadline?: number; // epoch ms, rozpočet zdroje
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const delays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;
  const doFetch = opts.fetchImpl ?? fetch;
  const doSleep = opts.sleepImpl ?? sleep;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (opts.deadline && Date.now() > opts.deadline) throw new BudgetExceededError(new URL(url).host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await doFetch(url, { headers: opts.headers, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < delays.length) await doSleep(delays[attempt]);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
