import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import type { Envelope } from "../api/types";

export type ConnectionState = "idle" | "live" | "reconnecting" | "failed";

interface Options { pollMs?: number; enabled?: boolean }

/** Fetch + optional polling. Keeps last good data when a refresh fails and reports connection state. */
export function useApi<T>(fetcher: () => Promise<Envelope<T>>, deps: unknown[], opts: Options = {}) {
  const { pollMs, enabled = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [failures, setFailures] = useState(0);
  const [lastSuccess, setLastSuccess] = useState<number | null>(null);
  const reqId = useRef(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const run = useCallback(async (silent: boolean) => {
    const id = ++reqId.current;
    if (!silent) setLoading(true);
    try {
      const r = await fetchRef.current();
      if (id !== reqId.current) return; // stale response
      setData(r.data); setMeta(r.meta); setError(null); setFailures(0); setLastSuccess(Date.now());
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e instanceof ApiError ? e : new ApiError(0, "unknown", String(e)));
      setFailures((f) => f + 1);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    setData(null); setMeta(null); setError(null); setFailures(0);
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    if (!pollMs || !enabled) return;
    const h = setInterval(() => run(true), pollMs);
    return () => clearInterval(h);
  }, [pollMs, enabled, run]);

  const connection: ConnectionState = lastSuccess === null && failures === 0 ? "idle" : failures === 0 ? "live" : failures < 3 ? "reconnecting" : "failed";
  return { data, meta, error, loading, refresh: () => run(true), reload: () => run(false), connection, lastSuccess };
}
