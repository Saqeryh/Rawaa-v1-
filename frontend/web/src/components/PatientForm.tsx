import { useState } from "react";
import type { PatientSummary } from "../api/types";
import { useI18n } from "../i18n";
import { Dialog, ErrorState, Field } from "./ui";

const SCENARIOS = ["stable", "rising", "pre_thrombotic", "critical", "missing_data", "disconnected", "pending_review"];
export interface PatientFormValues { display_name: string; age: number | null; clinical_context: string; scenario?: string; monitoring_status?: string }

export function PatientFormDialog({ patient, onSubmit, onClose, busy, error }: { patient?: PatientSummary; onSubmit: (v: PatientFormValues) => void; onClose: () => void; busy?: boolean; error?: unknown }) {
  const { t } = useI18n();
  const [name, setName] = useState(patient?.display_name ?? "");
  const [age, setAge] = useState(patient?.age != null ? String(patient.age) : "");
  const [ctx, setCtx] = useState(patient?.clinical_context ?? "");
  const [scenario, setScenario] = useState("stable");
  const [status, setStatus] = useState<string>(patient?.monitoring_status ?? "active");
  const [errs, setErrs] = useState<{ name?: string; age?: string }>({});

  const submit = () => {
    const e: { name?: string; age?: string } = {};
    if (!name.trim()) e.name = t("patients.nameRequired");
    let ageNum: number | null = null;
    if (age.trim() !== "") {
      ageNum = Number(age);
      if (!Number.isInteger(ageNum) || ageNum < 0 || ageNum > 120) e.age = t("patients.ageRange");
    }
    setErrs(e);
    if (e.name || e.age) return;
    onSubmit({ display_name: name.trim(), age: ageNum, clinical_context: ctx.trim(), ...(patient ? { monitoring_status: status } : { scenario }) });
  };

  return (
    <Dialog title={patient ? t("patients.editTitle") : t("patients.createTitle")} onClose={onClose}
      actions={<><button className="btn" onClick={onClose}>{t("common.cancel")}</button><button className="btn primary" onClick={submit} disabled={busy}>{t("common.save")}</button></>}>
      <div className="stack">
        <div className="notice xs">{t("notice.demo")}</div>
        <Field label={t("patients.displayName")} htmlFor="pf-name" error={errs.name}>
          <input id="pf-name" className="input" value={name} maxLength={80} aria-invalid={!!errs.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="form-grid">
          <Field label={t("patients.age")} htmlFor="pf-age" error={errs.age}>
            <input id="pf-age" className="input" inputMode="numeric" value={age} aria-invalid={!!errs.age} onChange={(e) => setAge(e.target.value)} />
          </Field>
          {patient ? (
            <Field label={t("patients.monitoringStatus")} htmlFor="pf-status">
              <select id="pf-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {["active", "paused", "discharged"].map((s) => <option key={s} value={s}>{t(`status.monitoring.${s}`)}</option>)}
              </select>
            </Field>
          ) : (
            <Field label={t("patients.scenario")} htmlFor="pf-scenario">
              <select id="pf-scenario" className="select" value={scenario} onChange={(e) => setScenario(e.target.value)}>
                {SCENARIOS.map((s) => <option key={s} value={s}>{t(`patients.scenarios.${s}`)}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label={t("patients.context")} htmlFor="pf-ctx">
          <textarea id="pf-ctx" className="textarea" value={ctx} maxLength={300} onChange={(e) => setCtx(e.target.value)} />
        </Field>
        {error ? <ErrorState error={error} /> : null}
      </div>
    </Dialog>
  );
}
