// Types mirror backend/app/schemas.py and the response shapes in backend/app/api/*.
export type Lang = "ar" | "en" | "ko";
export type LocalizedNames = Record<Lang, string>;

export interface Envelope<T> { data: T; error: null; meta: Record<string, any> | null }

export type RiskKey = "low_risk" | "rising_activity" | "pre_thrombotic_state" | "critical_thrombosis_risk";
export type MonitoringStatus = "active" | "paused" | "discharged";
export type ReviewStatus = "none" | "pending_review" | "reviewed" | "follow_up";
export type Quality = "ok" | "poor" | "missing";

export interface BiomarkerConfig {
  id: string; names: LocalizedNames; abbreviation: string; category: string; unit: string;
  sensor_kind: string; validation: { min: number; max: number; kind: string };
  reference_range: null | [number, number]; color: string; used_in_demo_rule: boolean;
}
export interface VitalConfig { id: string; names: LocalizedNames; unit: string; sensor: string }
export interface AppConfig {
  biomarkers: BiomarkerConfig[]; vitals: VitalConfig[];
  sensors: Record<string, { names: LocalizedNames; conceptual: boolean; biomarker?: string }>;
  risk_categories: RiskKey[];
  /** `params` is the backend demonstration rule's own parameter set (GET /config) — the UI never invents thresholds. */
  risk_source: { kind: string; warning: string; params?: Record<string, number> };
  notice: string;
}

export interface Contribution { biomarker_id: string; relative_change: number | null; used_in_rule: boolean }
export interface Assessment {
  id: number; category: number | null; category_key: RiskKey | null; status: "ok" | "insufficient_data";
  source: "demonstration_rule" | "synthetic_model" | "trained_model"; model_version: string; computed_at: string;
  details: {
    reason?: "no_data" | "stale_data" | "not_enough_data" | null; contributions: Contribution[];
    data_quality: { overall: "ok" | "degraded" | "insufficient"; markers: Record<string, { valid_points: number; window_points: number }> };
    explanation_key: string; explanation_params: Record<string, any>;
  };
}
export interface Device {
  id: number; kind: "wearable_patch" | "electrochemical_aptasensor"; name: string;
  status: "connected" | "disconnected"; conceptual: boolean; last_reading_at: string | null;
}
export interface Reading { biomarker_id: string; value: number | null; unit: string; measured_at: string; source: string; quality: Quality }
export interface Vital { kind: string; value: number | null; unit: string; measured_at: string; source: string; quality: Quality }
export interface Alert {
  id: number; patient_id: string; kind: string; severity: "info" | "warning" | "critical";
  message_key: string; params: Record<string, any>; status: "open" | "acknowledged"; created_at: string;
  acknowledged_by: string | null; acknowledged_at: string | null; auto_generated: boolean;
}
export interface Note { id: number; patient_id: string; author_id: string; body: string; review_status: string | null; created_at: string; doctor_entered: boolean }
export interface Proposal { id: number; patient_id: string; status: "pending" | "confirmed" | "cancelled"; created_at: string; resolved_at: string | null; resolved_by: string | null; is_simulated: boolean }
export interface SimEvent { id: number; ts: string; patient_id: string | null; kind: string; detail: string }
export interface SimState { status: "stopped" | "running" | "paused"; tick_count: number; last_tick_at: string | null; interval_seconds: number; label: string }

/** POST /patients/{id}/readings — manual telemetry pulse (doctor demo ingestion). */
export interface ReadingCreate { biomarker_id: string; value?: number | null; unit?: string | null; quality?: Quality; measured_at?: string | null }
/** POST /simulation/{patient_id}/connection — attach / detach a simulated device. */
export interface ConnectionToggle { connected: boolean; kind?: "wearable_patch" | "electrochemical_aptasensor" | null }
export interface ConnectionResult { patient_id: string; connected: boolean; kind: string | null; changed: boolean; devices: { id: number; kind: string; status: "connected" | "disconnected" }[] }
/** POST /simulation/{patient_id}/intervention — physician's audit note for a simulated intervention decision. */
export interface InterventionCreate { body: string; review_status?: ReviewStatus | null }

export interface PatientSummary {
  id: string; display_name: string; age: number | null; clinical_context: string;
  monitoring_status: MonitoringStatus; review_status: ReviewStatus; scenario: string; is_synthetic: boolean;
  monitoring_start: string; risk: Assessment | null; devices_connected: number; devices_total: number; last_update: string | null;
}
export interface PatientDetail extends PatientSummary {
  devices: Device[]; latest_biomarkers: Record<string, Reading>; latest_vitals: Record<string, Vital>;
  recent_alerts: Alert[]; data_notice: string;
}
export interface DashboardSummary {
  total_patients: number; by_risk: Record<string, number>; needs_review: number;
  devices: { connected: number; total: number }; open_alerts: number; recent_alerts: Alert[];
  recent_updates: { patient_id: string; display_name: string; last_update: string }[];
  biomarker_trends: Record<string, { patients_with_data: number; patients_rising: number }>; notice: string;
}
export interface DeviceHistoryItem { device_id: number; kind: string; status: "connected" | "disconnected"; ts: string }
export interface Preferences { language: Lang; notify_alerts: boolean; notify_device: boolean }
export interface DevTokens { doctor: string; patients: Record<string, string>; warning: string }
