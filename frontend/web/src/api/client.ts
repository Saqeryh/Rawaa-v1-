import type { Envelope } from "./types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) {
    super(message);
  }
}

let baseUrl: string = (import.meta as any).env?.VITE_API_URL ?? "/api/v1";
let onUnauthorized: (() => void) | null = null;

export function configureApi(opts: { baseUrl?: string; onUnauthorized?: (() => void) | null }) {
  if (opts.baseUrl !== undefined) baseUrl = opts.baseUrl;
  if (opts.onUnauthorized !== undefined) onUnauthorized = opts.onUnauthorized;
}

export interface RequestOptions { token?: string | null; body?: unknown; query?: Record<string, string | number | undefined | null> }

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<Envelope<T>> {
  const parts = opts.query
    ? Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    : [];
  const qs = parts.length ? "?" + parts.join("&") : "";
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}${qs}`, {
      method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "Backend unreachable");
  }
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !json || json.error) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? `http_${res.status}`, typeof err?.message === "string" ? err.message : "Request failed", err?.details);
  }
  return json as Envelope<T>;
}
