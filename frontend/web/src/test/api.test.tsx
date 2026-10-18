import { describe, expect, it, vi } from "vitest";
import { ApiError, configureApi, request } from "../api/client";
import { fail, mockBackend, ok } from "./utils";

describe("api client", () => {
  it("unwraps the {data, error, meta} envelope and sends the bearer token + query", async () => {
    const m = mockBackend({ "GET /patients": (url) => ({ body: { data: [{ id: "P-1" }], error: null, meta: { q: url.searchParams.get("search") } } }) });
    const r = await request<any[]>("GET", "/patients", { token: "abc", query: { search: "sa", risk: undefined } });
    expect(r.data[0].id).toBe("P-1"); expect(r.meta?.q).toBe("sa");
    const init = m.fetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as any).Authorization).toBe("Bearer abc");
  });
  it("throws ApiError with backend error code on 4xx", async () => {
    mockBackend({ "GET /x": fail(422, "validation_error", "bad") });
    await expect(request("GET", "/x")).rejects.toMatchObject({ status: 422, code: "validation_error" });
  });
  it("maps network failure to status 0", async () => {
    configureApi({ baseUrl: "http://test/api/v1" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("down"); }));
    await expect(request("GET", "/x")).rejects.toBeInstanceOf(ApiError);
    await expect(request("GET", "/x")).rejects.toMatchObject({ status: 0, code: "network_error" });
  });
  it("calls the unauthorized handler on 401", async () => {
    mockBackend({ "GET /x": fail(401, "http_401") });
    const h = vi.fn(); configureApi({ onUnauthorized: h });
    await expect(request("GET", "/x")).rejects.toBeInstanceOf(ApiError);
    expect(h).toHaveBeenCalled(); configureApi({ onUnauthorized: null });
  });
  it("posts JSON bodies", async () => {
    const m = mockBackend({ "POST /patients": ok({ id: "P-2" }) });
    await request("POST", "/patients", { body: { display_name: "A" } });
    expect(m.calls[0].body).toEqual({ display_name: "A" });
  });
});
