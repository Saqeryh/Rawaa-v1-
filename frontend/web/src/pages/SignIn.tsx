import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/endpoints";
import type { DevTokens } from "../api/types";
import { useSession } from "../auth/session";
import { useI18n } from "../i18n";
import { useApi } from "../hooks/useApi";
import { Brand, DemoBanner, LanguageSwitcher } from "../components/shared";
import { Card, ErrorState, Field, LoadingBlock } from "../components/ui";

export default function SignIn({ role }: { role: "doctor" | "patient" }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { signIn } = useSession();
  const { data: tokens, error, loading, reload } = useApi<DevTokens>(() => api.devTokens(), []);
  const [names, setNames] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState("");
  const [failed, setFailed] = useState(false);

  // Dev-only convenience: fetch each demo patient's display name with that patient's own token.
  // استخراج الكائن الداخلي بأمان سواء كان tokens مغلفاً بـ data أو مفكوكاً
  const tokenData = (tokens as any)?.data || tokens;

  // Dev-only convenience: fetch each demo patient's display name with that patient's own token.
  useEffect(() => {
    if (role !== "patient" || !tokenData?.patients) return;
    let cancelled = false;
    Promise.all(Object.entries(tokenData.patients).map(async ([id, tok]) => {
      try { return [id, (await api.patient(tok as string, id)).data.display_name] as const; } catch { return [id, ""] as const; }
    })).then((pairs) => { if (!cancelled) setNames(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [role, tokenData]);

  const go = () => {
    if (!tokenData) return;
    const doctorToken = tokenData.doctor;
    if (role === "doctor") { 
      if (doctorToken) {
        signIn({ role: "doctor", token: doctorToken }); 
        nav("/doctor"); 
      }
      return; 
    }
    const tok = tokenData.patients?.[choice];
    if (!tok) { setFailed(true); return; }
    signIn({ role: "patient", token: tok, patientId: choice }); 
    nav("/patient");
  };

 
  return (
    <>
      <DemoBanner />
      <div className="container" style={{ maxWidth: 560 }}>
        <header className="landing-header"><Brand /><LanguageSwitcher /></header>
        <main>
          <Card title={role === "doctor" ? t("signin.doctorTitle") : t("signin.patientTitle")}>
            <div className="stack">
              <div className="notice">{t("signin.devNotice")}</div>
              {loading && <LoadingBlock />}
              {error && <ErrorState error={error} onRetry={reload} />}
              {tokens && role === "patient" && (
                <Field label={t("signin.selectPatient")} htmlFor="patient-select">
                  <select id="patient-select" className="select" value={choice} onChange={(e) => { setChoice(e.target.value); setFailed(false); }}>
                    <option value="">—</option>
                    {Object.keys(tokens.patients).map((id) => <option key={id} value={id}>{names[id] ? `${names[id]} (${id})` : id}</option>)}
                  </select>
                </Field>
              )}
              {failed && <div className="field-error" role="alert">{t("signin.failed")}</div>}
              {tokens && (
                <button className="btn primary" onClick={go} disabled={role === "patient" && !choice}>
                  {role === "doctor" ? t("signin.signInDoctor") : t("signin.signInPatient")}
                </button>
              )}
            </div>
          </Card>
        </main>
      </div>
    </>
  );
}
