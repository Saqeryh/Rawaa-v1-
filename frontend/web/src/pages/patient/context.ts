import { createContext, useContext } from "react";
import type { Alert, PatientDetail } from "../../api/types";
import type { ConnectionState } from "../../hooks/useApi";

export interface PatientCtx { patient: PatientDetail; alerts: Alert[]; connection: ConnectionState; lastSuccess: number | null; refresh: () => void }
export const PatientContext = createContext<PatientCtx | null>(null);
export function usePatient(): PatientCtx {
  const v = useContext(PatientContext);
  if (!v) throw new Error("usePatient outside PatientContext");
  return v;
}
