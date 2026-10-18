/** Runs the REAL frontend code against the REAL FastAPI backend + database (no mocked fetch).
 *  Enabled with RAWA_E2E=1 and RAWA_API=http://127.0.0.1:8765/api/v1 (backend started with SIM_INTERVAL_SECONDS=1). */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import App from "../App";
import { api } from "../api/endpoints";
import { configureApi } from "../api/client";
import { makeFormatters } from "../i18n";
import { renderApp } from "./utils";

const E2E = process.env.RAWA_E2E === "1";
const d = E2E ? describe : describe.skip;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const T = 40_000;

d("live backend integration (real API, real database)", () => {
  let doc = "", pt: Record<string, string> = {};
  const docSession = () => ({ role: "doctor", token: doc });
  const ptSession = (id: string) => ({ role: "patient", token: pt[id], patientId: id });
  const hsCrpCount = async () => (await api.biomarkerHistory(doc, "P-1001", "hs_crp")).data.length;

  beforeAll(async () => {
    configureApi({ baseUrl: process.env.RAWA_API ?? "http://127.0.0.1:8000/api/v1" });
    const tk = (await api.devTokens()).data; doc = tk.doctor; pt = tk.patients;
    await api.sim.action(doc, "reset");
  }, T);

  it("doctor list shows the 8 seeded synthetic patients with the designed classifications", async () => {
    renderApp(<App />, { route: "/doctor/patients", session: docSession() });
    expect(await screen.findByText("8 patients", {}, { timeout: 10000 })).toBeInTheDocument();
    const risk = (name: string) => within(screen.getByText(name).closest("tr")!);
    expect(risk("Yousef Al-Amri").getByText("Critical thrombosis risk")).toBeInTheDocument();
    expect(risk("Sara Kim").getByText("Pre-thrombotic state")).toBeInTheDocument();
    expect(risk("Layla Hassan").getByText("Low risk")).toBeInTheDocument();
    expect(risk("Karim Adel").getByText("Insufficient data")).toBeInTheDocument();
    expect(risk("Karim Adel").getByText("0/2 devices")).toBeInTheDocument();
  }, T);

  it("doctor and patient apps display the same hs-CRP record", async () => {
    const p = (await api.patient(doc, "P-1004")).data;
    const expected = makeFormatters("en").number(p.latest_biomarkers.hs_crp.value);
    const a = renderApp(<App />, { route: "/doctor/patients/P-1004", session: docSession() });
    const dCard = (await screen.findByText("High-Sensitivity C-Reactive Protein", {}, { timeout: 10000 })).closest("section")!;
    expect(within(dCard).getByText(expected)).toBeInTheDocument();
    expect(within(dCard).getByText("mg/L")).toBeInTheDocument();
    a.unmount(); sessionStorage.clear();
    renderApp(<App />, { route: "/patient/biomarkers", session: ptSession("P-1004") });
    const pCard = (await screen.findByText("High-Sensitivity C-Reactive Protein", {}, { timeout: 10000 })).closest("section")!;
    expect(within(pCard).getByText(expected)).toBeInTheDocument();
  }, T);

  it("a reading generated from the doctor's simulation tools appears in the patient app and history", async () => {
    const before = await hsCrpCount();
    const a = renderApp(<App />, { route: "/doctor/simulation", session: docSession() });
    await screen.findByRole("option", { name: /Layla Hassan/ }, { timeout: 10000 }); // wait for the patient list to load
    await userEvent.selectOptions(screen.getByLabelText("Patient"), "P-1001");
    await userEvent.click(await screen.findByRole("button", { name: "Generate reading" }));
    await waitFor(async () => expect(await hsCrpCount()).toBe(before + 1), { timeout: 10000 });
    a.unmount(); sessionStorage.clear();
    const latest = (await api.patient(pt["P-1001"], "P-1001")).data.latest_biomarkers.hs_crp;
    expect(latest.source).toBe("simulator");
    renderApp(<App />, { route: "/patient/biomarkers", session: ptSession("P-1001") });
    const card = (await screen.findByText("High-Sensitivity C-Reactive Protein", {}, { timeout: 10000 })).closest("section")!;
    expect(await within(card).findByText(makeFormatters("en").number(latest.value))).toBeInTheDocument();
    expect(within(card).getByText("Simulator")).toBeInTheDocument();
  }, T);

  it("pause really stops new readings and resume continues (through the UI, real background loop)", async () => {
    renderApp(<App />, { route: "/doctor/simulation", session: docSession() });
    await userEvent.click(await screen.findByRole("button", { name: "Start" }, { timeout: 10000 }));
    const n0 = await hsCrpCount();
    await waitFor(async () => expect(await hsCrpCount()).toBeGreaterThan(n0), { timeout: 8000 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(), { timeout: 8000 });
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled(), { timeout: 8000 });
    const paused = await hsCrpCount();
    await sleep(3200);
    expect(await hsCrpCount()).toBe(paused);
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(async () => expect(await hsCrpCount()).toBeGreaterThan(paused), { timeout: 8000 });
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.getByText("Stopped")).toBeInTheDocument(), { timeout: 8000 });
    expect(await hsCrpCount()).toBe(24);
  }, 60_000);

  it("a patient token is refused for another patient's record and for the patient list", async () => {
    await expect(api.patient(pt["P-1001"], "P-1002")).rejects.toMatchObject({ status: 403 });
    await expect(api.patients(pt["P-1001"])).rejects.toMatchObject({ status: 403 });
    await expect(api.patient("bogus", "P-1001")).rejects.toMatchObject({ status: 401 });
  }, T);

  it("patient app for a disconnected patient shows insufficient data and disconnected devices from the real records", async () => {
    renderApp(<App />, { route: "/patient", session: ptSession("P-1006") });
    expect(await screen.findByText("Hello, Karim Adel", {}, { timeout: 10000 })).toBeInTheDocument();
    expect((await screen.findAllByText("Insufficient data")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Disconnected").length).toBe(2);
    expect(screen.getByText("The newest reading is too old.", { exact: false })).toBeInTheDocument();
  }, T);

  it("real sign-in page lists the seeded patients by name", async () => {
    renderApp(<App />, { route: "/patient/login" });
    expect(await screen.findByRole("option", { name: "Sara Kim (P-1003)" }, { timeout: 10000 })).toBeInTheDocument();
  }, T);
});
