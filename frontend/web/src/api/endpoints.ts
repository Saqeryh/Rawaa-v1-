import { request } from "./client";
import type * as T from "./types";

type Tok = string | null;
export const api = {
  health: () => request<{ status: string; notice: string }>("GET", "/health"),
  config: () => request<T.AppConfig>("GET", "/config"),
  devTokens: () => request<T.DevTokens>("GET", "/dev/tokens"),

  dashboard: (t: Tok) => request<T.DashboardSummary>("GET", "/dashboard/summary", { token: t }),
  patients: (t: Tok, q: { search?: string; risk?: string; monitoring_status?: string; sort?: string; order?: string } = {}) =>
    request<T.PatientSummary[]>("GET", "/patients", { token: t, query: q }),
  patient: (t: Tok, id: string) => request<T.PatientDetail>("GET", `/patients/${id}`, { token: t }),
  createPatient: (t: Tok, body: { display_name: string; age?: number | null; clinical_context?: string; scenario?: string }) =>
    request<T.PatientSummary>("POST", "/patients", { token: t, body }),
  updatePatient: (t: Tok, id: string, body: Record<string, unknown>) => request<T.PatientSummary>("PATCH", `/patients/${id}`, { token: t, body }),

  biomarkerHistory: (t: Tok, id: string, bid: string, since_hours?: number) =>
    request<T.Reading[]>("GET", `/patients/${id}/biomarkers/${bid}/history`, { token: t, query: { limit: 500, since_hours } }),
  addReading: (t: Tok, id: string, body: T.ReadingCreate) =>
    request<T.Reading>("POST", `/patients/${id}/readings`, { token: t, body }),
  vitals: (t: Tok, id: string, kind?: string) => request<T.Vital[]>("GET", `/patients/${id}/vitals`, { token: t, query: { kind, limit: 500 } }),
  riskHistory: (t: Tok, id: string) => request<T.Assessment[]>("GET", `/patients/${id}/risk-history`, { token: t }),
  deviceHistory: (t: Tok, id: string) => request<T.DeviceHistoryItem[]>("GET", `/patients/${id}/device-history`, { token: t }),

  alerts: (t: Tok, q: { patient_id?: string; status?: string } = {}) => request<T.Alert[]>("GET", "/alerts", { token: t, query: q }),
  acknowledge: (t: Tok, id: number) => request<T.Alert>("POST", `/alerts/${id}/acknowledge`, { token: t }),
  notes: (t: Tok, id: string) => request<T.Note[]>("GET", `/patients/${id}/notes`, { token: t }),
  addNote: (t: Tok, id: string, body: { body: string; review_status?: string | null }) => request<T.Note>("POST", `/patients/${id}/notes`, { token: t, body }),
  proposals: (t: Tok, id: string) => request<T.Proposal[]>("GET", `/patients/${id}/intervention-proposals`, { token: t }),
  confirmProposal: (t: Tok, id: number) => request<T.Proposal>("POST", `/intervention-proposals/${id}/confirm`, { token: t }),
  cancelProposal: (t: Tok, id: number) => request<T.Proposal>("POST", `/intervention-proposals/${id}/cancel`, { token: t }),

  preferences: (t: Tok, id: string) => request<T.Preferences>("GET", `/patients/${id}/preferences`, { token: t }),
  updatePreferences: (t: Tok, id: string, body: Partial<T.Preferences>) => request<T.Preferences>("PUT", `/patients/${id}/preferences`, { token: t, body }),

  sim: {
    state: (t: Tok) => request<T.SimState>("GET", "/simulation/state", { token: t }),
    action: (t: Tok, a: "start" | "pause" | "resume" | "reset" | "tick") => request<T.SimState>("POST", `/simulation/${a}`, { token: t }),
    events: (t: Tok) => request<T.SimEvent[]>("GET", "/simulation/events", { token: t, query: { limit: 30 } }),
    generate: (t: Tok, id: string) => request<any>("POST", `/simulation/patients/${id}/generate`, { token: t }),
    disconnect: (t: Tok, id: string, kind?: string) => request<any>("POST", `/simulation/patients/${id}/disconnect`, { token: t, query: { kind } }),
    restore: (t: Tok, id: string, kind?: string) => request<any>("POST", `/simulation/patients/${id}/restore`, { token: t, query: { kind } }),
    missing: (t: Tok, id: string) => request<any>("POST", `/simulation/patients/${id}/missing-data`, { token: t }),
    /** Toggle patch/sensor attachment status for one patient (POST /simulation/{patient_id}/connection). */
    connection: (t: Tok, id: string, body: T.ConnectionToggle) => request<T.ConnectionResult>("POST", `/simulation/${id}/connection`, { token: t, body }),
    /** Human-in-the-loop audit: register the physician's review note (POST /simulation/{patient_id}/intervention). */
    intervention: (t: Tok, id: string, body: T.InterventionCreate) => request<T.Note>("POST", `/simulation/${id}/intervention`, { token: t, body }),
  },
};
