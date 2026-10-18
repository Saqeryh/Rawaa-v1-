import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";
import { alert, assessment, CONFIG, DOC_SESSION, detailHandlers, devices, insufficient, patient, pSession, proposal } from "./fixtures";
import { fail, mockBackend, ok, renderApp } from "./utils";

const PID = "P-1004";
const handlers = (p = patient(), extra: Record<string, any> = {}) => detailHandlers(p, {
  "GET /alerts": ok(p.recent_alerts),
  [`GET /patients/${PID}/preferences`]: ok({ language: "en", notify_alerts: true, notify_device: true }),
  ...extra,
});
const go = (route = "/patient", lang: "en" | "ar" | "ko" = "en") => renderApp(<App />, { route, lang, session: pSession(PID) });

describe("patient app", () => {
  it("shows the signed-in patient's own data with demo/limit notices", async () => {
    mockBackend(handlers()); go();
    expect(await screen.findByRole("heading", { level: 1, name: "Hello, Yousef Al-Amri" })).toBeInTheDocument();
    expect(screen.getAllByText(/DEMO DATA/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Simulated updates — not real sensor measurements/)).toBeInTheDocument();
    expect(screen.getAllByText("Critical thrombosis risk").length).toBeGreaterThan(0);
    expect(screen.getByText("Demonstration rule (not a trained model)")).toBeInTheDocument();
    expect(screen.getByText("You only see your own data.", { exact: false })).toBeInTheDocument();
  });

  it("only ever calls the API for its own patient (never the patient list or other ids)", async () => {
    const m = mockBackend(handlers()); go();
    await screen.findByText("Hello, Yousef Al-Amri");
    await waitFor(() => expect(m.calls.length).toBeGreaterThan(3));
    const bad = m.calls.filter((c) => (c.path === "/patients") || (/\/patients\/P-\d+/.test(c.path) && !c.path.includes(PID)));
    expect(bad).toEqual([]);
    expect(m.fetch.mock.calls.every(([, init]) => (init as RequestInit).headers && ((init as any).headers.Authorization ?? "") === "" || (init as any).headers.Authorization === `Bearer pt-${PID}`)).toBe(true);
  });

  it("shows a translated forbidden state if the backend refuses access", async () => {
    mockBackend({ "GET /config": ok(CONFIG), [`GET /patients/${PID}`]: fail(403, "http_403"), "GET /alerts": ok([]) }); go();
    expect(await screen.findByRole("alert")).toHaveTextContent("You are not allowed to see this.");
  });

  it("shows hs-CRP and never renders a missing value as zero", async () => {
    const p = patient(); p.latest_biomarkers.d_dimer = { biomarker_id: "d_dimer", value: null, unit: "µg/mL", measured_at: "2026-01-10T10:00:00Z", source: "simulator", quality: "missing" };
    mockBackend(handlers(p)); go();
    const crp = (await screen.findByText("hs-CRP")).closest("div.stack-sm")!;
    expect(within(crp as HTMLElement).getByText("1.9")).toBeInTheDocument();
    const dd = screen.getAllByText("D-dimer")[0].closest("div.stack-sm")!;
    expect(within(dd as HTMLElement).getByText("No reading")).toBeInTheDocument();
    expect(within(dd as HTMLElement).queryByText(/^0$/)).toBeNull();
  });

  it("shows disconnected-device and insufficient-data states", async () => {
    const p = patient({ risk: insufficient(), devices: devices("disconnected"), devices_connected: 1 });
    mockBackend(handlers(p)); go();
    expect((await screen.findAllByText("Insufficient data")).length).toBeGreaterThan(0);
    expect(screen.getByText("A monitoring device disconnected")).toBeInTheDocument();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("lists notifications from the patient's alerts and shows an empty state otherwise", async () => {
    mockBackend(handlers(patient(), { "GET /alerts": ok([alert()]) })); const a = go();
    expect(await screen.findByText("Critical thrombosis risk detected (demo rule)")).toBeInTheDocument();
    a.unmount();
    mockBackend(handlers(patient(), { "GET /alerts": ok([]) })); go();
    expect(await screen.findByText("No notifications.")).toBeInTheDocument();
  });

  it("simulated proposal needs a confirmation dialog and states nothing is administered", async () => {
    const m = mockBackend(handlers(patient(), { [`GET /patients/${PID}/intervention-proposals`]: ok([proposal()], {}), "POST /intervention-proposals/5/confirm": ok(proposal({ status: "confirmed", resolved_by: PID })) }));
    go();
    await userEvent.click(await screen.findByRole("button", { name: "Acknowledge (simulated)" }));
    const dlg = screen.getByRole("dialog");
    expect(within(dlg).getByText(/No treatment is administered/)).toBeInTheDocument();
    expect(m.calls.some((c) => c.path.includes("confirm"))).toBe(false);
    await userEvent.click(within(dlg).getByRole("button", { name: "Acknowledge (simulated)" }));
    await waitFor(() => expect(m.calls.some((c) => c.path === "/intervention-proposals/5/confirm")).toBe(true));
    expect(screen.getByText(/Emergency escalation/)).toBeInTheDocument();
  });

  it("opens the readings pages with the correct sensors from Home", async () => {
    mockBackend(handlers()); go();
    await userEvent.click(await screen.findByRole("link", { name: "Open biomarkers" }));
    expect(await screen.findByText("Electrochemical Aptasensor (conceptual, simulated)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Home" }));          // back through the dock
    await userEvent.click(await screen.findByRole("link", { name: "Open vitals" }));
    expect(await screen.findByText("MPU-6050 (IMU)")).toBeInTheDocument();
    expect(screen.getByText("LM35")).toBeInTheDocument();
  });

  it("renders right-to-left in Arabic and left-to-right in Korean", async () => {
    mockBackend(handlers()); const a = go("/patient", "ar");
    expect(await screen.findByText("مرحبًا، Yousef Al-Amri")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getByRole("navigation", { name: "تطبيق المريض" })).toBeInTheDocument();
    a.unmount();
    mockBackend(handlers()); go("/patient", "ko");
    expect(await screen.findByText("안녕하세요, Yousef Al-Amri님")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("ltr");
  });
});

describe("patient header", () => {
  it("shows the signed-in name, an unread count from the API and the search field", async () => {
    mockBackend(handlers(patient(), { "GET /alerts": ok([alert({ id: 1 }), alert({ id: 2 }), alert({ id: 3, status: "acknowledged" })]) }));
    go();
    const header = await screen.findByRole("banner");
    expect(within(header).getByRole("heading", { level: 1 })).toHaveTextContent("Hello, Yousef Al-Amri");
    expect(within(header).getByTestId("patient-header-notif-badge")).toHaveTextContent("2"); // open alerts only
    expect(within(header).getByRole("search")).toBeInTheDocument();
    expect(within(header).queryByRole("navigation")).toBeNull();  // the dock is the only navigation
  });

  it("shows the generic greeting until the record arrives, without crashing the shell", async () => {
    mockBackend({ "GET /config": ok(CONFIG), [`GET /patients/${PID}`]: fail(500, "internal_error"), "GET /alerts": ok([]) });
    go();
    const header = await screen.findByRole("banner");
    expect(within(header).getByRole("heading", { level: 1 })).toHaveTextContent("Hello, Welcome");
    expect(await screen.findByRole("alert")).toHaveTextContent("The request could not be completed.");
  });
});

describe("patient bottom dock", () => {
  const dock = async (route = "/patient", lang: "en" | "ar" | "ko" = "en") => {
    mockBackend(handlers()); go(route, lang);
    return screen.findByRole("navigation", { name: lang === "ar" ? "تطبيق المريض" : lang === "ko" ? "환자 앱" : "Patient app" });
  };

  it("offers exactly three destinations, in home / TAPs / settings order", async () => {
    const nav = await dock();
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName("Home");
    expect(links[1]).toHaveAccessibleName("TAPs assistant");   // the bead is the assistant entry point
    expect(links[2]).toHaveAccessibleName("Settings");
    expect(links[0]).toHaveAttribute("aria-current", "page");   // Home starts active
  });

  it("labels every destination with an icon and a word, never colour alone", async () => {
    const nav = await dock("/patient/assistant");
    for (const link of within(nav).getAllByRole("link")) {
      expect(link.querySelector("svg")).toBeTruthy();          // icon
      expect(link.textContent?.trim()).toMatch(/\S/);          // visible label
    }
    expect(within(nav).getByText("TAPs")).toBeInTheDocument();
    expect(within(nav).getByText("Assistant")).toBeInTheDocument();
  });

  it("carries the RAWA mark from the project's own logo inside the bead", async () => {
    const nav = await dock();
    const image = nav.querySelector("image");
    expect(image?.getAttribute("href")).toContain("logo.png");
    expect(image).toHaveAttribute("width", "280");            // the original artwork, cropped by viewBox only
  });

  it("moves the active state to the bead and to settings", async () => {
    mockBackend(handlers()); go();
    const nav = await screen.findByRole("navigation", { name: "Patient app" });
    await userEvent.click(within(nav).getByRole("link", { name: "TAPs assistant" }));
    expect(await screen.findByRole("heading", { level: 1, name: "RAWA assistant" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "TAPs assistant" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    await userEvent.click(within(nav).getByRole("link", { name: "Settings" }));
    expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(nav).getByRole("link", { name: "Home" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Hello, Yousef Al-Amri" })).toBeInTheDocument();
  });

  it("keeps the three promises in Arabic right-to-left", async () => {
    const nav = await dock("/patient/settings", "ar");
    const links = within(nav).getAllByRole("link");
    expect(links[0]).toHaveAccessibleName("الرئيسية");
    expect(links[1]).toHaveAccessibleName("مساعد TAPs");
    expect(links[2]).toHaveAccessibleName("الإعدادات");
    expect(links[2]).toHaveAttribute("aria-current", "page");  // RTL: settings is the last DOM child, shown on the left
  });
});

describe("patient assistant", () => {
  const open = async (lang: "en" | "ar" | "ko" = "en", p = patient()) => { mockBackend(handlers(p)); go("/patient/assistant", lang); await screen.findByRole("heading", { level: 1 }); };
  it("states clearly it is a fixed-answer, non-diagnostic helper", async () => {
    await open();
    expect(screen.getByText(/I am not a medical AI and I cannot diagnose/)).toBeInTheDocument();
    expect(screen.getByText(/I do not give medication or dose advice/)).toBeInTheDocument();
  });
  it("explains the four categories", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "What do the four risk categories mean?" }));
    const log = screen.getByRole("log");
    expect(within(log).getByText(/Low risk, Rising activity, Pre-thrombotic state and Critical thrombosis risk/)).toBeInTheDocument();
    expect(within(log).getByText(/not a diagnosis/)).toBeInTheDocument();
  });
  it("explains the latest readings from the same stored records the app displays", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Explain my latest readings" }));
    expect(within(screen.getByRole("log")).getByText(/D-dimer 0\.82 µg\/mL, TAT 3\.5 µg\/L, sP-selectin 70 ng\/mL, hs-CRP 1\.9 mg\/L/)).toBeInTheDocument();
  });
  it("omits missing values from the readings summary instead of saying 0", async () => {
    const p = patient(); p.latest_biomarkers.tat = { biomarker_id: "tat", value: null, unit: "µg/L", measured_at: "2026-01-10T10:00:00Z", source: "simulator", quality: "missing" };
    await open("en", p);
    await userEvent.click(screen.getByRole("button", { name: "Explain my latest readings" }));
    const text = within(screen.getByRole("log")).getByText(/Your most recent stored readings/).textContent!;
    expect(text).not.toMatch(/TAT/); expect(text).not.toMatch(/\b0 µg/);
  });
  it("reports the last update time and the current classification with its origin", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "When was my data last updated?" }));
    expect(within(screen.getByRole("log")).getByText(/Your data was last updated/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "What is my current classification?" }));
    expect(within(screen.getByRole("log")).getByText(/“Critical thrombosis risk” \(Demonstration rule \(not a trained model\)\)\. It is generated by a demonstration rule/)).toBeInTheDocument();
  });
  it("says so when there is no reliable classification", async () => {
    await open("en", patient({ risk: insufficient() }));
    await userEvent.click(screen.getByRole("button", { name: "What is my current classification?" }));
    expect(within(screen.getByRole("log")).getByText(/No classification is available yet/)).toBeInTheDocument();
  });
  it("refuses medication / dose questions and never gives numbers", async () => {
    await open();
    await userEvent.type(screen.getByLabelText("Ask about the app or your readings…"), "What dose of anticoagulant should I take?{enter}");
    const log = within(screen.getByRole("log"));
    expect(log.getByText(/can’t give medication or dose advice/)).toBeInTheDocument();
    expect(screen.getByRole("log").textContent).not.toMatch(/\d\s?(mg|ml|units)\b/i);
  });
  it("points to emergency services for emergencies and declines to diagnose", async () => {
    await open();
    const box = screen.getByLabelText("Ask about the app or your readings…");
    await userEvent.type(box, "I have severe chest pain{enter}");
    expect(within(screen.getByRole("log")).getByText(/contact local emergency services/)).toBeInTheDocument();
    await userEvent.type(box, "Do I have a clot? Please diagnose me{enter}");
    expect(within(screen.getByRole("log")).getByText(/I am not a doctor and cannot diagnose/)).toBeInTheDocument();
  });
  it("falls back honestly to a helpful message when it has no answer", async () => {
    await open();
    await userEvent.type(screen.getByLabelText("Ask about the app or your readings…"), "What is the capital of France?{enter}");
    expect(within(screen.getByRole("log")).getByText(/I don’t have an answer for that/)).toBeInTheDocument();
  });
  it("answers in Arabic and Korean, including keyword questions typed in those languages", async () => {
    await open("ar");
    await userEvent.type(screen.getByRole("textbox"), "ما جرعة الدواء المناسبة؟{enter}");
    expect(within(screen.getByRole("log")).getByText(/لا أستطيع تقديم نصائح دوائية أو جرعات/)).toBeInTheDocument();
  });
  it("answers Korean questions in Korean", async () => {
    await open("ko");
    await userEvent.type(screen.getByRole("textbox"), "응급 상황이에요{enter}");
    expect(within(screen.getByRole("log")).getByText(/현지 응급 서비스/)).toBeInTheDocument();
  });
});

describe("patient settings", () => {
  const open = async () => { const m = mockBackend(handlers(patient(), { [`PUT /patients/${PID}/preferences`]: ok({ language: "en", notify_alerts: false, notify_device: true }) })); go("/patient/settings"); await screen.findByText("Profile"); return m; };
  it("shows read-only profile and wearable status", async () => {
    await open();
    expect(screen.getByText("Yousef Al-Amri")).toBeInTheDocument();
    expect(screen.getByText("Profile changes are made by your care team.")).toBeInTheDocument();
    expect(screen.getByText(/simulated from the doctor dashboard/)).toBeInTheDocument();
  });
  it("persists a notification preference through the API", async () => {
    const m = await open();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Risk and data alerts" }));
    await waitFor(() => expect(m.calls.find((c) => c.method === "PUT")?.body).toEqual({ notify_alerts: false }));
    expect(await screen.findByText("Preferences saved.")).toBeInTheDocument();
  });
  it("persists a language change for the patient and updates direction", async () => {
    const m = await open();
    await userEvent.click(screen.getAllByRole("button", { name: "한국어" })[0]);
    await waitFor(() => expect(m.calls.find((c) => c.method === "PUT")?.body).toEqual({ language: "ko" }));
    expect(document.documentElement.lang).toBe("ko");
  });
  it("opening settings alone writes nothing", async () => {
    const m = await open();
    await screen.findByRole("checkbox", { name: "Risk and data alerts" });
    expect(m.calls.some((c) => c.method === "PUT")).toBe(false);
  });
  it("logs out: clears the session and returns to the landing page", async () => {
    mockBackend({ ...handlers(), "GET /dev/tokens": ok({ doctor: "d", patients: {}, warning: "" }) });
    go("/patient/settings");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(sessionStorage.getItem("rawa.session")).toBeNull();
    expect(await screen.findByRole("heading", { level: 1, name: /Early thrombosis monitoring/ })).toBeInTheDocument();
  });
});

describe("doctor and patient views show the same record", () => {
  it("displays identical values, timestamps and classification for the same patient", async () => {
    const p = patient();
    mockBackend(handlers(p)); const patientView = go("/patient/biomarkers");
    const pCard = (await screen.findByText("High-Sensitivity C-Reactive Protein")).closest("section")!;
    const pVals = { value: within(pCard).getByText("1.9").textContent, when: within(pCard).getAllByText(/2026|Jan/)[0].textContent };
    patientView.unmount(); sessionStorage.clear();
    mockBackend(handlers(p)); renderApp(<App />, { route: `/doctor/patients/${PID}`, session: DOC_SESSION });
    const dCard = (await screen.findByText("High-Sensitivity C-Reactive Protein")).closest("section")!;
    expect(within(dCard).getByText("1.9").textContent).toBe(pVals.value);
    expect(within(dCard).getAllByText(/2026|Jan/)[0].textContent).toBe(pVals.when);
    expect(screen.getAllByText("Critical thrombosis risk").length).toBeGreaterThan(0);
  });
});
