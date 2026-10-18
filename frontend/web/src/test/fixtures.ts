import { ok } from "./utils";

export const DOC_SESSION = { role: "doctor", token: "doc-tok" };
export const pSession = (id: string) => ({ role: "patient", token: `pt-${id}`, patientId: id });

const N = (en: string, ar: string, ko: string) => ({ en, ar, ko });
export const CONFIG = {
  biomarkers: [
    { id: "d_dimer", names: N("D-dimer", "دي-دايمر", "D-다이머"), abbreviation: "D-dimer", category: "coagulation", unit: "µg/mL", sensor_kind: "wearable_patch", validation: { min: 0, max: 100, kind: "plausibility_only" }, reference_range: null, color: "#ff6b6b", used_in_demo_rule: true },
    { id: "tat", names: N("Thrombin-Antithrombin complex", "معقد الثرومبين-مضاد الثرومبين", "트롬빈-항트롬빈 복합체"), abbreviation: "TAT", category: "coagulation", unit: "µg/L", sensor_kind: "wearable_patch", validation: { min: 0, max: 1000, kind: "plausibility_only" }, reference_range: null, color: "#f9a825", used_in_demo_rule: true },
    { id: "p_selectin", names: N("Soluble P-selectin", "P-سيلكتين الذائب", "가용성 P-셀렉틴"), abbreviation: "sP-selectin", category: "platelet_activation", unit: "ng/mL", sensor_kind: "wearable_patch", validation: { min: 0, max: 1000, kind: "plausibility_only" }, reference_range: null, color: "#8a74f9", used_in_demo_rule: true },
    { id: "hs_crp", names: N("High-Sensitivity C-Reactive Protein", "بروتين سي التفاعلي عالي الحساسية", "고감도 C-반응성 단백질"), abbreviation: "hs-CRP", category: "inflammatory", unit: "mg/L", sensor_kind: "electrochemical_aptasensor", validation: { min: 0, max: 500, kind: "plausibility_only" }, reference_range: null, color: "#10b981", used_in_demo_rule: false },
  ],
  vitals: [
    { id: "heart_rate", names: N("Heart rate", "معدل ضربات القلب", "심박수"), unit: "bpm", sensor: "MAX30102 (PPG)" },
    { id: "spo2", names: N("Oxygen saturation (SpO₂)", "تشبع الأكسجين (SpO₂)", "산소포화도 (SpO₂)"), unit: "%", sensor: "MAX30102 (PPG)" },
    { id: "movement", names: N("Movement / activity", "الحركة والنشاط", "움직임 및 활동"), unit: "a.u.", sensor: "MPU-6050 (IMU)" },
    { id: "temperature", names: N("Body temperature", "حرارة الجسم", "체온"), unit: "°C", sensor: "LM35" },
  ],
  sensors: { electrochemical_aptasensor: { names: N("Electrochemical Aptasensor", "x", "y"), conceptual: true, biomarker: "hs_crp" } },
  risk_categories: ["low_risk", "rising_activity", "pre_thrombotic_state", "critical_thrombosis_risk"],
  risk_source: { kind: "demonstration_rule", warning: "" }, notice: "",
};

const contribs = (rc: (number | null)[]) => ["d_dimer", "tat", "p_selectin", "hs_crp"].map((b, i) => ({ biomarker_id: b, relative_change: rc[i], used_in_rule: b !== "hs_crp" }));
export const assessment = (over: Record<string, any> = {}) => ({
  id: 10, category: 3, category_key: "critical_thrombosis_risk", status: "ok", source: "demonstration_rule", model_version: "demo-rule-v0", computed_at: "2026-01-10T10:00:00Z",
  details: { reason: null, contributions: contribs([1.4, 1.5, 1.3, 1.1]), data_quality: { overall: "ok", markers: { d_dimer: { valid_points: 12, window_points: 12 }, tat: { valid_points: 12, window_points: 12 }, p_selectin: { valid_points: 12, window_points: 12 }, hs_crp: { valid_points: 12, window_points: 12 } } }, explanation_key: "risk.explain.critical_thrombosis_risk", explanation_params: {} },
  ...over,
});
export const insufficient = () => assessment({ category: null, category_key: null, status: "insufficient_data", details: { reason: "stale_data", contributions: contribs([null, null, null, null]), data_quality: { overall: "insufficient", markers: {} }, explanation_key: "risk.explain.insufficient", explanation_params: {} } });

export const devices = (apta = "connected") => [
  { id: 1, kind: "wearable_patch", name: "RAWA wearable patch", status: "connected", conceptual: true, last_reading_at: "2026-01-10T10:00:00Z" },
  { id: 2, kind: "electrochemical_aptasensor", name: "Electrochemical Aptasensor", status: apta, conceptual: true, last_reading_at: "2026-01-10T09:00:00Z" },
];
const reading = (b: string, v: number | null, unit: string, q = v === null ? "missing" : "ok") => ({ biomarker_id: b, value: v, unit, measured_at: "2026-01-10T10:00:00Z", source: "simulator", quality: q });
const vital = (k: string, v: number, unit: string) => ({ kind: k, value: v, unit, measured_at: "2026-01-10T10:00:00Z", source: "simulator", quality: "ok" });

export const patient = (over: Record<string, any> = {}) => ({
  id: "P-1004", display_name: "Yousef Al-Amri", age: 66, clinical_context: "ICU step-down transition (synthetic)", monitoring_status: "active", review_status: "pending_review",
  scenario: "critical", is_synthetic: true, monitoring_start: "2026-01-09T10:00:00Z", risk: assessment(), devices_connected: 2, devices_total: 2, last_update: "2026-01-10T10:00:00Z",
  devices: devices(),
  latest_biomarkers: { d_dimer: reading("d_dimer", 0.82, "µg/mL"), tat: reading("tat", 3.5, "µg/L"), p_selectin: reading("p_selectin", 70, "ng/mL"), hs_crp: reading("hs_crp", 1.9, "mg/L") },
  latest_vitals: { heart_rate: vital("heart_rate", 88, "bpm"), spo2: vital("spo2", 95, "%"), movement: vital("movement", 30, "a.u."), temperature: vital("temperature", 36.9, "°C") },
  recent_alerts: [], data_notice: "DEMO DATA — SYNTHETIC PATIENTS — NOT FOR CLINICAL USE", ...over,
});
export const alert = (over: Record<string, any> = {}) => ({ id: 1, patient_id: "P-1004", kind: "risk", severity: "critical", message_key: "alert.risk.critical_thrombosis_risk", params: {}, status: "open", created_at: "2026-01-10T09:30:00Z", acknowledged_by: null, acknowledged_at: null, auto_generated: true, ...over });
export const proposal = (over: Record<string, any> = {}) => ({ id: 5, patient_id: "P-1004", status: "pending", created_at: "2026-01-10T09:31:00Z", resolved_at: null, resolved_by: null, is_simulated: true, ...over });
export const summaryOf = (p: any) => { const { devices: _d, latest_biomarkers: _b, latest_vitals: _v, recent_alerts: _a, data_notice: _n, ...s } = p; return s; };

export const dashboard = (over: Record<string, any> = {}) => ({
  total_patients: 8, by_risk: { low_risk: 3, rising_activity: 2, pre_thrombotic_state: 1, critical_thrombosis_risk: 1, insufficient_data: 1 }, needs_review: 3,
  devices: { connected: 14, total: 16 }, open_alerts: 4, recent_alerts: [alert()], recent_updates: [{ patient_id: "P-1004", display_name: "Yousef Al-Amri", last_update: "2026-01-10T10:00:00Z" }],
  biomarker_trends: { d_dimer: { patients_with_data: 7, patients_rising: 4 }, tat: { patients_with_data: 7, patients_rising: 4 }, p_selectin: { patients_with_data: 7, patients_rising: 3 }, hs_crp: { patients_with_data: 7, patients_rising: 3 } },
  notice: "", ...over,
});

const hist = (b: string, vals: (number | null)[], unit: string) => vals.map((v, i) => ({ ...reading(b, v, unit), measured_at: `2026-01-10T0${i}:00:00Z` }));
export function detailHandlers(p = patient(), extra: Record<string, any> = {}) {
  const id = p.id;
  const h: Record<string, any> = {
    "GET /config": ok(CONFIG),
    [`GET /patients/${id}`]: ok(p),
    [`GET /patients/${id}/risk-history`]: ok([p.risk ?? assessment()]),
    [`GET /patients/${id}/device-history`]: ok([{ device_id: 1, kind: "wearable_patch", status: "connected", ts: "2026-01-09T10:00:00Z" }, { device_id: 2, kind: "electrochemical_aptasensor", status: "connected", ts: "2026-01-09T10:00:00Z" }]),
    "GET /alerts": ok(p.recent_alerts),
    [`GET /patients/${id}/notes`]: ok([]),
    [`GET /patients/${id}/intervention-proposals`]: ok([], { notice: "SIMULATED" }),
    [`GET /patients/${id}/vitals`]: ok([vital("heart_rate", 88, "bpm")]),
    ...Object.fromEntries(["d_dimer", "tat", "p_selectin", "hs_crp"].map((b) => [`GET /patients/${id}/biomarkers/${b}/history`, ok(hist(b, [1, null, 2], "u"), { unit: "u" })])),
    ...extra,
  };
  return h;
}
