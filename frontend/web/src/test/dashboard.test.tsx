import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";
import { Splash } from "../components/Splash";
import { CONFIG, DOC_SESSION, assessment, dashboard, detailHandlers, insufficient, patient, summaryOf } from "./fixtures";
import { mockBackend, ok, renderApp } from "./utils";

const go = (route: string, lang: "en" | "ar" | "ko" = "en") => renderApp(<App />, { route, lang, session: DOC_SESSION });
const listOf = (...ps: any[]) => ps.map(summaryOf);

describe("dashboard KPIs and charts", () => {
  it("shows computed KPIs and explicit placeholders for indicators with no backend source", async () => {
    const sara = summaryOf(patient({
      id: "P-1007", display_name: "Sara Kim", age: 27, monitoring_status: "paused",
      risk: assessment({ category: 0, category_key: "low_risk" }), devices_connected: 1, devices_total: 2,
    }));
    mockBackend({
      "GET /config": ok(CONFIG),
      "GET /dashboard/summary": ok(dashboard({ total_patients: 8 })),
      "GET /patients": ok(listOf(patient(), sara)),
    });
    go("/doctor");
    const kpis = await screen.findByRole("region", { name: "Key performance indicators" });
    expect(within(kpis).getByText("Monitored patients").previousSibling).toHaveTextContent("8");
    expect(within(kpis).getByText("Critical cases").previousSibling).toHaveTextContent("1");
    expect(within(kpis).getByText("Connected sensors").previousSibling).toHaveTextContent("14");
    expect(within(kpis).getByText("Disconnected sensors").previousSibling).toHaveTextContent("2");
    // patients under monitoring is computed from GET /patients (1 of the 2 fixtures is active)
    await within(kpis).findByText(/1 of 8 patients with active monitoring/);
    expect(within(kpis).getByText("Patients under monitoring").previousSibling).toHaveTextContent("1");
    // occupancy / waiting / emergency response have no source in this backend: "—", never an invented number
    for (const label of ["Occupancy rate", "Average waiting time", "Emergency response time"]) {
      expect(within(kpis).getByText(label).previousSibling).toHaveTextContent("—");
    }
    expect(within(kpis).getAllByText(/placeholder only/)).toHaveLength(3);

    // demographics: age buckets computed from the patient list; missing fields disclosed
    expect(await screen.findByText("18–30")).toBeInTheDocument();
    expect(screen.getByText("18–30").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("60+").nextSibling).toHaveTextContent("1");
    expect(screen.getByText(/Gender, department and geographic fields/)).toBeInTheDocument();

    // risk distribution uses only the backend categories
    const riskCard = screen.getByRole("heading", { level: 2, name: "Patient risk distribution" }).closest("section")!;
    expect(within(riskCard).getByText("Insufficient data")).toBeInTheDocument();
    expect(within(riskCard).getByText(/not a trained model/)).toBeInTheDocument();
  });

  it("lists critical cases with the latest reading, sensor monitoring, and links to the patient", async () => {
    const p = patient();
    mockBackend({
      "GET /config": ok(CONFIG),
      "GET /dashboard/summary": ok(dashboard()),
      "GET /patients": ok(listOf(p)),
      ...detailHandlers(p),
    });
    go("/doctor");
    const critical = (await screen.findByRole("heading", { level: 2, name: "Critical cases" })).closest("section")!;
    const row = (await within(critical).findByText("Yousef Al-Amri")).closest("tr")!;
    expect(within(row).getByText("Critical thrombosis risk")).toBeInTheDocument();
    expect(await within(row).findByText("0.82")).toBeInTheDocument(); // latest stored reading from the detail API
    expect(within(row).getByRole("link", { name: "View patient" })).toBeInTheDocument();

    const sensor = (await screen.findByRole("heading", { level: 2, name: "Sensor monitoring" })).closest("section")!;
    expect(within(sensor).getByText("Connected: 14")).toBeInTheDocument();
    await within(sensor).findByText("Simulation mode: 2"); // both fixture devices are conceptual
    expect(within(sensor).getAllByText("Simulated sensor (demo)")).toHaveLength(2);
    expect(within(sensor).getByText("Wearable patch")).toBeInTheDocument();
    expect(within(sensor).getByText("Electrochemical Aptasensor")).toBeInTheDocument();

    await userEvent.click(within(row).getByRole("link", { name: "View patient" }));
    expect(await screen.findByRole("heading", { level: 1, name: /Yousef Al-Amri/ })).toBeInTheDocument();
  });
});

describe("medical records & appointments", () => {
  it("shows stored clinical notes and discloses that appointments have no backend source", async () => {
    const note = { id: 1, patient_id: "P-1004", author_id: "D-001", body: "Reviewed trend, will re-check.", review_status: "reviewed", created_at: "2026-01-10T11:00:00Z", doctor_entered: true };
    mockBackend({
      "GET /config": ok(CONFIG),
      "GET /patients": ok(listOf(patient())),
      "GET /patients/P-1004/notes": ok([note]),
    });
    go("/doctor/records");
    const card = (await screen.findByRole("heading", { level: 2, name: "Medical records" })).closest("section")!;
    await within(card).findByText("Reviewed trend, will re-check.");
    const row = screen.getByText("Yousef Al-Amri").closest("tr")!;
    expect(within(row).getByText("Doctor note")).toBeInTheDocument();
    expect(within(row).getByText("Reviewed")).toBeInTheDocument();
    expect(within(row).getByText("D-001")).toBeInTheDocument();
    // appointments: explicit disclosure instead of invented rows
    expect(screen.getByText(/no appointments table or API/)).toBeInTheDocument();
    const appts = screen.getByRole("heading", { level: 2, name: "Upcoming appointments" }).closest("section")!;
    expect(within(appts).queryByText(/^P-/)).toBeNull();
  });
});

describe("patient detail tabs & daily analysis", () => {
  it("offers the six tabs with an overview panel that keeps everything together", async () => {
    mockBackend(detailHandlers());
    go("/doctor/patients/P-1004");
    await screen.findByRole("heading", { level: 1, name: /Yousef Al-Amri/ });
    const tablist = screen.getByRole("tablist", { name: "Details" });
    for (const n of ["Overview", "Biomarkers", "Vitals", "Activity", "Risk analysis", "Sensor"]) {
      expect(within(tablist).getByRole("tab", { name: n })).toBeInTheDocument();
    }
    expect(within(tablist).getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    // gender/department exist in the patient information card but are honestly marked as absent in this database
    expect(screen.getAllByText("Not recorded in this demo database")).toHaveLength(2);

    await userEvent.click(within(tablist).getByRole("tab", { name: "Biomarkers" }));
    expect(within(tablist).getByRole("tab", { name: "Biomarkers" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Biomarker analysis" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Daily Analysis" })).toBeNull();

    await userEvent.click(within(tablist).getByRole("tab", { name: "Sensor" }));
    expect(screen.getAllByText("Simulated sensor (demo)").length).toBeGreaterThan(0);
    expect(screen.queryByText("High-Sensitivity C-Reactive Protein")).toBeNull(); // biomarker cards live in their own tab
  });

  it("computes the Daily Analysis from the API records of the last 24 hours", async () => {
    mockBackend(detailHandlers());
    go("/doctor/patients/P-1004");
    const card = (await screen.findByRole("heading", { name: "Daily Analysis" })).closest("section")!;
    expect(await within(card).findByText("12")).toBeInTheDocument(); // 4 biomarkers x 3 stored readings
    expect(within(card).getByText("4")).toBeInTheDocument();         // one missing reading per biomarker
    expect(within(card).getByText("67%")).toBeInTheDocument();       // 8 valid of 12 stored
    expect(within(card).getByText("0 min")).toBeInTheDocument();     // no disconnection in the stored status log
    expect(within(card).getByText("2 / 2")).toBeInTheDocument();     // both sensors connected
    expect(within(card).getByText("Not enough data")).toBeInTheDocument(); // only one stored risk assessment
    expect(within(card).getByText(/Computed in the browser/)).toBeInTheDocument();
  });
});

describe("patient list columns & filters", () => {
  it("shows latest hs-CRP / D-dimer, a view action and the sensor-status filter", async () => {
    const karim = summaryOf(patient({ id: "P-1006", display_name: "Karim Adel", risk: insufficient(), devices_connected: 0, devices_total: 2, review_status: "none" }));
    mockBackend({
      "GET /config": ok(CONFIG),
      "GET /patients": ok(listOf(patient(), karim)),
      "GET /patients/P-1004": ok(patient()),
    });
    go("/doctor/patients");
    const row = (await screen.findByText("Yousef Al-Amri")).closest("tr")!;
    expect(screen.getByText("hs-CRP")).toBeInTheDocument();   // column headers come from GET /config
    expect(screen.getByText("D-dimer")).toBeInTheDocument();
    expect(await within(row).findByText("1.9")).toBeInTheDocument();   // latest hs-CRP from the detail API
    expect(within(row).getByText("0.82")).toBeInTheDocument();          // latest D-dimer
    expect(within(row).getByRole("link", { name: "View patient" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Sensor status"), "disconnected");
    expect(screen.queryByText("Yousef Al-Amri")).toBeNull();
    expect(await screen.findByText("Karim Adel")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Sensor status"), "connected");
    expect(screen.queryByText("Karim Adel")).toBeNull();
    expect(screen.getByText("Yousef Al-Amri")).toBeInTheDocument();
  });
});

describe("splash screen", () => {
  it("renders the existing logo, the project name and the translated tagline", () => {
    renderApp(<Splash autoHide={false} />);
    const splash = screen.getByTestId("splash");
    expect(splash.querySelector("img")).toHaveAttribute("src", "/logo.png");
    expect(within(splash).getByText("RAWA | ThrombiX")).toBeInTheDocument();
    expect(within(splash).getByText("AI-Powered Thrombotic Risk Monitoring")).toBeInTheDocument();
    expect(within(splash).getByText("Loading…")).toBeInTheDocument();
    expect(within(splash).getByText(/not a medical device/)).toBeInTheDocument();
  });

  it("stays out of the way under the test environment so timing never affects other tests", async () => {
    mockBackend({
      "GET /config": ok({ biomarkers: [], vitals: [], sensors: {}, risk_categories: [], risk_source: { kind: "demonstration_rule", warning: "" }, notice: "" }),
    });
    renderApp(<App />, { route: "/" });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
    expect(screen.queryByTestId("splash")).toBeNull();
  });
});
