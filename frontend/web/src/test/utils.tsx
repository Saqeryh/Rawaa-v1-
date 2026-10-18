import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { I18nProvider } from "../i18n";
import { SessionProvider } from "../auth/session";
import { ConfigProvider } from "../hooks/useConfig";
import type { Lang } from "../api/types";
import { configureApi } from "../api/client";

export function renderApp(ui: ReactElement, opts: { route?: string; lang?: Lang; session?: object } = {}) {
  if (opts.session) sessionStorage.setItem("rawa.session", JSON.stringify(opts.session));
  return render(
    <MemoryRouter initialEntries={[opts.route ?? "/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <I18nProvider initial={opts.lang ?? "en"}>
        <SessionProvider>
          <ConfigProvider>{ui}</ConfigProvider>
        </SessionProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

type Handler = (url: URL, init: RequestInit) => { status?: number; body: unknown } | undefined;
/** Mock fetch with route handlers returning the backend envelope. Unmatched calls fail loudly. */
export function mockBackend(handlers: Record<string, Handler | { status?: number; body: unknown }>) {
  configureApi({ baseUrl: "http://test/api/v1" });
  const calls: { method: string; path: string; body?: any }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1", "");
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const h = handlers[`${method} ${path}`];
    if (!h) throw new Error(`Unmocked request: ${method} ${path}`);
    const r = typeof h === "function" ? h(url, init) : h;
    const status = r?.status ?? 200;
    return new Response(JSON.stringify(r?.body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fetch: fn };
}
export const ok = (data: unknown, meta: unknown = null) => ({ body: { data, error: null, meta } });
export const fail = (status: number, code: string, message = "err") => ({ status, body: { data: null, meta: null, error: { code, message } } });
