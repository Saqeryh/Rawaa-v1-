import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";
import { alert, assessment, CONFIG, DOC_SESSION, dashboard, detailHandlers, devices, insufficient, patient, proposal, summaryOf } from "./fixtures";
import { fail, mockBackend, ok, renderApp } from "./utils";

const go = (route: string, lang: "en" | "ar" | "ko" = "en") => renderApp(<App />, { route, lang, session: DOC_SESSION });

describe("doctor overview", () => {
  it("shows statistics computed from the API response, not hardcoded values", async () => {
    mockBackend({ "GET /config": ok(CONFIG), "GET /patients": ok([]), "GET /dashboard/summary": ok(dashboard({ total_patients: 11, needs_review: 5, open_alerts: 7 })) });
    go("/doctor");
    expect(await screen.findByText("11")).toBeInTheDocument();
    expect(screen.getByText("Monitored patients").previousSibling).toHaveTextContent("11");
    expect(screen.getByText("Need clinical review").previousSibling).toHaveTextContent("5");
    expect(screen.getByText("Open alerts").previousSibling).toHaveTextContent("7");
    expect(screen.getByText("Devices connected").previousSibling).toHaveTextContent("14 / 16");
    expect(screen.getByText("Insufficient data")).toBeInTheDocument();
    expect(screen.getAllByText(/DEMO DATA/).length).toBeGreaterThan(0);
  });
  it("acknowledges an alert through the API", async () => {
    const m = mockBackend({ "GET /config": ok(CONFIG), "GET /patients": ok([]), "GET /dashboard/summary": ok(dashboard()), "POST /alerts/1/acknowledge": ok(alert({ status: "acknowledged" })) });
    go("/doctor");
    await userEvent.click(await screen.findByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST" && c.path === "/alerts/1/acknowledge")).toBe(true));
  });
  it("shows an error state with retry when the dashboard fails", async () => {
    mockBackend({ "GET /config": ok(CONFIG), "GET /dashboard/summary": fail(0 + 500, "internal_error") });
    go("/doctor");
    expect(await screen.findByRole("alert")).toHaveTextContent("The request could not be completed.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

const listOf = (...ps: any[]) => ps.map(summaryOf);
describe("patient list", () => {
  const base = () => ({ "GET /config": ok(CONFIG) });
  it("renders rows with risk, review and device state from the API", async () => {
    mockBackend({ ...base(), "GET /patients": ok(listOf(patient(), patient({ id: "P-1006", display_name: "Karim Adel", risk: insufficient(), review_status: "none", devices_connected: 0 }))) });
    go("/doctor/patients");
    const row = (await screen.findByText("Yousef Al-Amri")).closest("tr")!;
    expect(within(row).getByText("Critical thrombosis risk")).toBeInTheDocument();
    expect(within(row).getByText("Pending clinical review")).toBeInTheDocument();
    const row2 = screen.getByText("Karim Adel").closest("tr")!;
    expect(within(row2).getByText("Insufficient data")).toBeInTheDocument();
    expect(within(row2).getByText("0/2 devices")).toBeInTheDocument();
  });
  it("sends search, risk filter and sort parameters to the backend", async () => {
    const seen: URLSearchParams[] = [];
    mockBackend({ ...base(), "GET /patients": (url) => { seen.push(url.searchParams); return ok(listOf(patient())); } });
    go("/doctor/patients");
    await screen.findByText("Yousef Al-Amri");
    await userEvent.type(screen.getByLabelText("Search"), "yous");
    await userEvent.selectOptions(screen.getByLabelText("Risk"), "critical_thrombosis_risk");
    await userEvent.selectOptions(screen.getByLabelText("Monitoring"), "paused");
    await waitFor(() => { const q = seen[seen.length - 1]; expect(q.get("search")).toBe("yous"); expect(q.get("risk")).toBe("critical_thrombosis_risk"); expect(q.get("monitoring_status")).toBe("paused"); });
    await userEvent.selectOptions(screen.getAllByLabelText("Sort by")[0], "risk");
    await waitFor(() => expect(seen[seen.length - 1].get("sort")).toBe("risk"));
  });
  it("shows an empty state when nothing matches", async () => {
    mockBackend({ ...base(), "GET /patients": ok([]) });
    go("/doctor/patients");
    expect(await screen.findByText("No patients match your filters.")).toBeInTheDocument();
  });
  it("shows an error state when the backend is unreachable", async () => {
    mockBackend({ ...base(), "GET /patients": fail(500, "x") });
    go("/doctor/patients");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
  it("validates the registration form and posts a valid synthetic patient", async () => {
    const m = mockBackend({ ...base(), "GET /patients": ok([]), "POST /patients": ok(summaryOf(patient({ id: "P-1009", display_name: "New Person" }))), ...detailHandlers(patient({ id: "P-1009", display_name: "New Person" })) });
    go("/doctor/patients");
    await userEvent.click(await screen.findByRole("button", { name: "Register synthetic patient" }));
    const dlg = screen.getByRole("dialog");
    await userEvent.click(within(dlg).getByRole("button", { name: "Save" }));
    expect(await within(dlg).findByText("Enter a display name.")).toBeInTheDocument();
    await userEvent.type(within(dlg).getByLabelText("Display name (fictional)"), "New Person");
    await userEvent.type(within(dlg).getByLabelText("Age"), "500");
    await userEvent.click(within(dlg).getByRole("button", { name: "Save" }));
    expect(await within(dlg).findByText("Age must be between 0 and 120.")).toBeInTheDocument();
    expect(m.calls.some((c) => c.method === "POST")).toBe(false);
    await userEvent.clear(within(dlg).getByLabelText("Age")); await userEvent.type(within(dlg).getByLabelText("Age"), "50");
    await userEvent.selectOptions(within(dlg).getByLabelText("Simulation scenario"), "rising");
    await userEvent.click(within(dlg).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.calls.find((c) => c.method === "POST" && c.path === "/patients")?.body).toEqual({ display_name: "New Person", age: 50, clinical_context: "", scenario: "rising" }));
    expect(await screen.findByRole("heading", { level: 1, name: /New Person/ })).toBeInTheDocument();
  });
});

describe("patient details", () => {
  it("shows hs-CRP with its full name, abbreviation, unit, sensor and the demo/limit notices", async () => {
    mockBackend(detailHandlers());
    go("/doctor/patients/P-1004");
    expect(await screen.findByRole("heading", { level: 1, name: /Yousef Al-Amri/ })).toBeInTheDocument();
    const card = (await screen.findByText("High-Sensitivity C-Reactive Protein")).closest("section")!;
    expect(within(card).getByText("(hs-CRP)")).toBeInTheDocument();
    expect(within(card).getByText("mg/L")).toBeInTheDocument();
    expect(within(card).getByText("1.9")).toBeInTheDocument();
    expect(within(card).getByText(/Electrochemical Aptasensor \(conceptual, simulated\)/)).toBeInTheDocument();
    expect(within(card).getByText(/not used by the demonstration rule/)).toBeInTheDocument();
    expect(screen.getAllByText(/DEMO DATA/).length).toBeGreaterThan(0);
    expect(screen.getByText(/does not predict real thrombosis/)).toBeInTheDocument();
  });
  it("labels the classification origin and never shows confidence/accuracy", async () => {
    mockBackend(detailHandlers());
    go("/doctor/patients/P-1004");
    await screen.findByText("Demonstration rule (not a trained model)");
    expect(screen.getByText(/No confidence or accuracy value exists/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/accuracy:?\s?\d|confidence:?\s?\d|\bspecificity\b|(?<!High-)\bsensitivity\b|\d+(\.\d+)?\s?% (accurate|confidence)/i);
    expect(screen.getAllByText("Used in rule", { exact: false })).toHaveLength(3); // d-dimer, TAT, sP-selectin
    expect(screen.getAllByText("Shown for context only", { exact: false })).toHaveLength(1); // hs-CRP only
  });
  it("does NOT render a missing measurement as zero", async () => {
    const p = patient();
    p.latest_biomarkers.tat = { biomarker_id: "tat", value: null, unit: "µg/L", measured_at: "2026-01-10T10:00:00Z", source: "simulator", quality: "missing" };
    mockBackend(detailHandlers(p));
    go("/doctor/patients/P-1004");
    const card = (await screen.findByText("Thrombin-Antithrombin complex")).closest("section")!;
    expect(within(card).getByText("No reading")).toBeInTheDocument();
    expect(within(card).getByText("Reading missing")).toBeInTheDocument();
    expect(within(card).queryByText(/^0(\.0+)?$/)).toBeNull();
  });
  it("handles insufficient data and a disconnected device explicitly", async () => {
    const p = patient({ risk: insufficient(), devices: devices("disconnected"), devices_connected: 1, recent_alerts: [alert({ id: 2, kind: "device_disconnected", severity: "warning", message_key: "alert.device_disconnected" })] });
    mockBackend(detailHandlers(p, { "GET /alerts": ok(p.recent_alerts) }));
    go("/doctor/patients/P-1004");
    expect((await screen.findAllByText("Insufficient data")).length).toBeGreaterThan(0);
    expect(screen.getByText(/The newest reading is too old\./)).toBeInTheDocument();
    expect(screen.getAllByText("Disconnected").length).toBeGreaterThan(0);
    expect((await screen.findAllByText("A monitoring device disconnected")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Conceptual \/ simulated/).length).toBeGreaterThan(0);
  });
  it("shows a not-found state for an unknown patient", async () => {
    mockBackend({ "GET /config": ok(CONFIG), "GET /patients/P-9999": fail(404, "http_404"), "GET /patients/P-9999/risk-history": fail(404, "x"), "GET /patients/P-9999/device-history": fail(404, "x"), "GET /alerts": ok([]), "GET /patients/P-9999/notes": fail(404, "x"), "GET /patients/P-9999/intervention-proposals": fail(404, "x") });
    go("/doctor/patients/P-9999");
    expect(await screen.findByText("This patient was not found.")).toBeInTheDocument();
  });
  it("saves a doctor note and clearly separates it from generated entries", async () => {
    let notes: any[] = [];
    const m = mockBackend(detailHandlers(patient({ recent_alerts: [alert()] }), {
      "GET /alerts": ok([alert()]),
      "GET /patients/P-1004/notes": () => ok(notes),
      "POST /patients/P-1004/notes": (_u: URL, init: RequestInit) => { const b = JSON.parse(String(init.body)); notes = [{ id: 1, patient_id: "P-1004", author_id: "D-001", body: b.body, review_status: b.review_status, created_at: "2026-01-10T11:00:00Z", doctor_entered: true }]; return ok(notes[0]); },
    }));
    go("/doctor/patients/P-1004");
    await userEvent.type(await screen.findByLabelText("Doctor note"), "Reviewed trend, will re-check.");
    await userEvent.selectOptions(screen.getByLabelText("Review status"), "reviewed");
    await userEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(m.calls.find((c) => c.method === "POST" && c.path.endsWith("/notes"))?.body).toEqual({ body: "Reviewed trend, will re-check.", review_status: "reviewed" }));
    expect((await screen.findAllByText(/Reviewed trend, will re-check\./)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Entered by doctor").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Automatically generated \(demo\)/).length).toBeGreaterThan(0);
  });
  it("requires an explicit confirmation dialog for the simulated proposal, then calls the API", async () => {
    const m = mockBackend(detailHandlers(patient(), {
      "GET /patients/P-1004/intervention-proposals": ok([proposal()], { notice: "SIMULATED" }),
      "POST /intervention-proposals/5/confirm": ok(proposal({ status: "confirmed", resolved_by: "D-001" })),
    }));
    go("/doctor/patients/P-1004");
    await userEvent.click(await screen.findByRole("button", { name: "Acknowledge (simulated)" }));
    expect(m.calls.some((c) => c.path.includes("/confirm"))).toBe(false); // nothing happens before confirming
    const dlg = screen.getByRole("dialog");
    expect(within(dlg).getByText("This only records a simulated acknowledgement. No treatment is administered.")).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole("button", { name: "Acknowledge (simulated)" }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST" && c.path === "/intervention-proposals/5/confirm")).toBe(true));
    expect(document.body.textContent).not.toMatch(/\bdose\b.*\d+\s?(mg|ml|units)/i);
  });
  it("can cancel the confirmation dialog without calling the API", async () => {
    const m = mockBackend(detailHandlers(patient(), { "GET /patients/P-1004/intervention-proposals": ok([proposal()], {}) }));
    go("/doctor/patients/P-1004");
    await userEvent.click(await screen.findByRole("button", { name: "Cancel proposal" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.calls.some((c) => c.method === "POST")).toBe(false);
  });
  it("edits the monitoring status through PATCH", async () => {
    const m = mockBackend(detailHandlers(patient(), { "PATCH /patients/P-1004": ok(summaryOf(patient({ monitoring_status: "paused" }))) }));
    go("/doctor/patients/P-1004");
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.selectOptions(screen.getByLabelText("Monitoring status"), "paused");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ monitoring_status: "paused", display_name: "Yousef Al-Amri" }));
  });
  it("renders in Arabic (RTL) and Korean with translated names", async () => {
    mockBackend(detailHandlers());
    const { unmount } = go("/doctor/patients/P-1004", "ar");
    expect(await screen.findByText("بروتين سي التفاعلي عالي الحساسية")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getAllByText("خطر تجلّط حرج").length).toBeGreaterThan(0);
    unmount();
    mockBackend(detailHandlers());
    go("/doctor/patients/P-1004", "ko");
    expect(await screen.findByText("고감도 C-반응성 단백질")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("ltr");
    expect(screen.getAllByText("위중한 혈전 위험").length).toBeGreaterThan(0);
  });
});

describe("simulation page", () => {
  const sim = (status: string) => ({ status, tick_count: 3, last_tick_at: "2026-01-10T10:00:00Z", interval_seconds: 5, label: "Simulated updates — not real sensor measurements" });
  const base = (status = "stopped") => ({ "GET /config": ok(CONFIG), "GET /simulation/state": ok(sim(status)), "GET /simulation/events": ok([{ id: 1, ts: "2026-01-10T10:00:00Z", patient_id: "P-1001", kind: "reading_generated", detail: "step=3" }]), "GET /patients": ok(listOf(patient())) });
  it("enables only the actions that are valid for the current state", async () => {
    mockBackend(base("stopped")); const a = go("/doctor/simulation");
    await screen.findByText("Stopped");
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resume" })).toBeDisabled();
    a.unmount();
    mockBackend(base("running")); const b = go("/doctor/simulation");
    await screen.findByText("Running");
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
    b.unmount();
    mockBackend(base("paused")); go("/doctor/simulation");
    await screen.findByText("Paused");
    expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled(); expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
  });
  it("start/tick call the backend; reset asks for confirmation first", async () => {
    const m = mockBackend({ ...base("stopped"), "POST /simulation/start": ok(sim("running")), "POST /simulation/tick": ok(sim("stopped")), "POST /simulation/reset": ok(sim("stopped")) });
    go("/doctor/simulation");
    await userEvent.click(await screen.findByRole("button", { name: "Start" }));
    await waitFor(() => expect(m.calls.some((c) => c.path === "/simulation/start")).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Step once" }));
    await waitFor(() => expect(m.calls.some((c) => c.path === "/simulation/tick")).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(m.calls.some((c) => c.path === "/simulation/reset")).toBe(false);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(m.calls.some((c) => c.path === "/simulation/reset")).toBe(true));
  });
  it("per-patient tools call generate / disconnect / restore / missing-data for the chosen device", async () => {
    const m = mockBackend({ ...base(), "POST /simulation/patients/P-1004/generate": ok({}), "POST /simulation/patients/P-1004/disconnect": ok({ changed: true }), "POST /simulation/patients/P-1004/restore": ok({ changed: true }), "POST /simulation/patients/P-1004/missing-data": ok({ armed: true }) });
    go("/doctor/simulation");
    await userEvent.selectOptions(await screen.findByLabelText("Patient"), "P-1004");
    await userEvent.click(screen.getByRole("button", { name: "Generate reading" }));
    await userEvent.selectOptions(screen.getByLabelText("Device"), "electrochemical_aptasensor");
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await userEvent.click(screen.getByRole("button", { name: "Restore connection" }));
    await userEvent.click(screen.getByRole("button", { name: "Simulate missing data" }));
    await waitFor(() => expect(m.calls.filter((c) => c.path.startsWith("/simulation/patients/P-1004")).length).toBe(4));
    expect(await screen.findByText("The next reading will contain missing biomarker values.")).toBeInTheDocument();
  });
  it("lists recent simulation events, translated", async () => {
    mockBackend(base()); go("/doctor/simulation");
    expect(await screen.findByText("Reading generated")).toBeInTheDocument();
  });
});

describe("doctor sign-out", () => {
  it("returns to the landing page and clears the session", async () => {
    mockBackend({ "GET /config": ok(CONFIG), "GET /patients": ok([]), "GET /dashboard/summary": ok(dashboard()) });
    go("/doctor");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(sessionStorage.getItem("rawa.session")).toBeNull();
    expect(await screen.findByRole("heading", { level: 1, name: /Early thrombosis monitoring/ })).toBeInTheDocument();
  });
});
