import { useI18n } from "../../i18n";
import { useConfig } from "../../hooks/useConfig";
import { VitalCard } from "../../components/Measurements";
import { usePatient } from "./context";

export default function VitalsPage() {
  const { t } = useI18n();
  const { patient: p } = usePatient();
  const { config } = useConfig();
  return (
    <>
      <h1>{t("nav.vitals")}</h1>
      <div className="notice xs">{t("notice.simulated")}</div>
      {(config?.vitals ?? []).map((v) => <VitalCard key={v.id} cfg={v} reading={p.latest_vitals[v.id]} patientId={p.id} />)}
    </>
  );
}
