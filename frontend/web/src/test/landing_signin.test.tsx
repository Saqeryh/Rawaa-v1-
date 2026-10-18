import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../App";
import { fail, mockBackend, ok, renderApp } from "./utils";

const CONFIG = ok({ biomarkers: [], vitals: [], sensors: {}, risk_categories: [], risk_source: { kind: "demonstration_rule", warning: "" }, notice: "" });
const TOKENS = ok({ doctor: "doc-tok", patients: { "P-1001": "pt-1", "P-1002": "pt-2" }, warning: "dev" });
// Mirrors the real GET /patients/{id} shape: Home.tsx renders devices/monitoring fields directly,
// so the fixture must include them (a bare {id, display_name} crashed Home with an unhandled TypeError).
const patientDetail = (id: string, name: string) => ok({
  id, display_name: name, age: null, clinical_context: "", monitoring_status: "active", review_status: "none",
  scenario: "stable", is_synthetic: true, monitoring_start: "2026-01-01T00:00:00Z", risk: null,
  devices_connected: 0, devices_total: 0, last_update: null, devices: [],
  latest_biomarkers: {}, latest_vitals: {}, recent_alerts: [],
  data_notice: "DEMO DATA — SYNTHETIC PATIENTS — NOT FOR CLINICAL USE",
});

describe("landing page", () => {
  it("shows demo + prototype notices and both entry points, in every language", () => {
    mockBackend({ "GET /config": CONFIG });
    for (const [lang, title] of [["en", "Early thrombosis monitoring, connected end to end"], ["ar", "مراقبة مبكرة للجلطات، مترابطة من الطرف إلى الطرف"], ["ko", "혈전 조기 모니터링, 처음부터 끝까지 연결"]] as const) {
      const { unmount } = renderApp(<App />, { lang });
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
      expect(screen.getAllByText(/SYNTHETIC|افتراضيون|가상 환자/).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link").filter((a) => /doctor\/login|patient\/login/.test(a.getAttribute("href") ?? ""))).toHaveLength(2);
      unmount();
    }
  });
  it("language switch on the landing page flips the layout direction", () => {
    mockBackend({ "GET /config": CONFIG });
    renderApp(<App />, { lang: "en" });
    fireEvent.click(screen.getByRole("button", { name: "العربية" }));
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("مراقبة مبكرة");
  });
});

describe("sign-in and route guards", () => {
  it("doctor: signs in with the dev token and reaches the doctor area", async () => {
    mockBackend({ "GET /config": CONFIG, "GET /dev/tokens": TOKENS });
    renderApp(<App />, { route: "/doctor/login" });
    await userEvent.click(await screen.findByRole("button", { name: /Sign in as demo clinician/ }));
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem("rawa.session")!)).toMatchObject({ role: "doctor", token: "doc-tok" }));
  });
  it("patient: must choose a patient, then session is scoped to that patient", async () => {
    mockBackend({ "GET /config": CONFIG, "GET /dev/tokens": TOKENS,
      "GET /patients/P-1001": patientDetail("P-1001", "Layla Hassan"), "GET /patients/P-1002": patientDetail("P-1002", "Omar Nasser") });
    renderApp(<App />, { route: "/patient/login" });
    const open = await screen.findByRole("button", { name: "Open app" });
    expect(open).toBeDisabled();
    await screen.findByRole("option", { name: "Layla Hassan (P-1001)" });
    await userEvent.selectOptions(screen.getByLabelText("Choose a synthetic patient"), "P-1002");
    await userEvent.click(open);
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem("rawa.session")!)).toMatchObject({ role: "patient", patientId: "P-1002", token: "pt-2" }));
  });
  it("shows a translated error state with retry when the backend is down", async () => {
    mockBackend({ "GET /config": fail(500, "x"), "GET /dev/tokens": fail(500, "x") });
    renderApp(<App />, { route: "/doctor/login", lang: "ko" });
    expect(await screen.findByRole("alert")).toHaveTextContent("요청을 완료할 수 없습니다");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });
  it("redirects unauthenticated users away from protected areas, and blocks cross-role access", async () => {
    mockBackend({ "GET /config": CONFIG, "GET /dev/tokens": TOKENS });
    renderApp(<App />, { route: "/doctor" });
    expect(await screen.findByText("Doctor sign-in")).toBeInTheDocument();
  });
  it("a patient session cannot open the doctor area", async () => {
    mockBackend({ "GET /config": CONFIG, "GET /dev/tokens": TOKENS });
    renderApp(<App />, { route: "/doctor", session: { role: "patient", token: "pt-1", patientId: "P-1001" } });
    expect(await screen.findByText("Doctor sign-in")).toBeInTheDocument();
  });
});

describe("expired session", () => {
  it("a 401 from the API sends the user to the sign-in page (not the landing page)", async () => {
    mockBackend({ "GET /config": CONFIG, "GET /dashboard/summary": fail(401, "http_401"), "GET /dev/tokens": TOKENS });
    renderApp(<App />, { route: "/doctor", session: { role: "doctor", token: "stale" } });
    expect(await screen.findByText("Doctor sign-in")).toBeInTheDocument();
    expect(sessionStorage.getItem("rawa.session")).toBeNull();
  });
});
