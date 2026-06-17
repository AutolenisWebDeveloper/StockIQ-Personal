import { limiter, withRetry } from "./ratelimit";

// Thin fetch wrapper: applies the per-provider rate limiter + retry/backoff +
// a timeout, and threads a descriptive User-Agent (SEC requires one). Uses the
// global fetch (Node 22+).

export interface FetchOpts {
  provider: string; // rate-limit bucket key
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  // Accept a non-2xx as "empty" rather than throwing (e.g., 404 for no data).
  okStatuses?: number[];
}

async function rawFetch(url: string, opts: FetchOpts): Promise<Response> {
  await limiter(opts.provider).take();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          opts.headers?.["User-Agent"] ??
          process.env.SEC_USER_AGENT ??
          "StockIQ-Personal/1.0",
        ...opts.headers,
      },
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url: string, opts: FetchOpts): Promise<string | null> {
  return withRetry(
    async () => {
      const res = await rawFetch(url, opts);
      if (!res.ok) {
        if (opts.okStatuses?.includes(res.status)) return null;
        throw new Error(`GET ${url} -> ${res.status}`);
      }
      return res.text();
    },
    { retries: opts.retries, label: url }
  );
}

export async function fetchJson<T>(url: string, opts: FetchOpts): Promise<T | null> {
  return withRetry(
    async () => {
      const res = await rawFetch(url, opts);
      if (!res.ok) {
        if (opts.okStatuses?.includes(res.status)) return null;
        throw new Error(`GET ${url} -> ${res.status}`);
      }
      return (await res.json()) as T;
    },
    { retries: opts.retries, label: url }
  );
}
