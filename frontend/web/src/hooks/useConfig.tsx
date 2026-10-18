import { createContext, useContext, type ReactNode } from "react";
import { api } from "../api/endpoints";
import type { AppConfig, BiomarkerConfig, VitalConfig } from "../api/types";
import { useApi } from "./useApi";

interface Ctx { config: AppConfig | null; loading: boolean; error: boolean; biomarker: (id: string) => BiomarkerConfig | undefined; vital: (id: string) => VitalConfig | undefined }
const ConfigCtx = createContext<Ctx>({ config: null, loading: true, error: false, biomarker: () => undefined, vital: () => undefined });

/** Biomarker/vital/sensor metadata comes from the backend so names and units are never duplicated in the UI. */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const { data, loading, error } = useApi(() => api.config(), []);
  const value: Ctx = {
    config: data, loading, error: !!error,
    biomarker: (id) => data?.biomarkers.find((b) => b.id === id),
    vital: (id) => data?.vitals.find((v) => v.id === id),
  };
  return <ConfigCtx.Provider value={value}>{children}</ConfigCtx.Provider>;
}
export const useConfig = () => useContext(ConfigCtx);
