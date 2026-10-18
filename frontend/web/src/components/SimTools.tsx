import { useState } from "react";
import { api } from "../api/endpoints";
import { useSession } from "../auth/session";
import { useAction } from "../hooks/useAction";
import { useI18n } from "../i18n";
import { ErrorState } from "./ui";

/** Per-patient simulation actions. All of them call real backend endpoints and write to the shared database. */
export function SimPatientTools({ patientId, onDone }: { patientId: string; onDone?: () => void }) {
  const { t } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const { busy, error, run } = useAction();
  const [kind, setKind] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const k = kind || undefined;
  const act = async (fn: () => Promise<unknown>, note?: string) => {
    setMsg(null);
    const r = await run(fn);
    if (r !== undefined) { setMsg(note ?? t("sim.done")); onDone?.(); }
  };
  return (
    <div className="stack">
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor={`sim-target-${patientId}`}>{t("sim.target")}</label>
        <select id={`sim-target-${patientId}`} className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t("sim.allDevices")}</option>
          <option value="wearable_patch">{t("device.kind.wearable_patch")}</option>
          <option value="electrochemical_aptasensor">{t("device.kind.electrochemical_aptasensor")}</option>
        </select>
      </div>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => act(() => api.sim.generate(tok, patientId))}>{t("sim.generate")}</button>
        <button className="btn" disabled={busy} onClick={() => act(() => api.sim.disconnect(tok, patientId, k))}>{t("sim.disconnect")}</button>
        <button className="btn" disabled={busy} onClick={() => act(() => api.sim.restore(tok, patientId, k))}>{t("sim.restore")}</button>
        <button className="btn" disabled={busy} onClick={() => act(() => api.sim.missing(tok, patientId), t("sim.missingArmed"))}>{t("sim.missing")}</button>
      </div>
      <div aria-live="polite" className="small muted">{msg}</div>
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}
