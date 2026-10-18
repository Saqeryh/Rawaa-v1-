import { useState } from "react";
import { useI18n } from "../../i18n";
import { useConfig } from "../../hooks/useConfig";
import { BiomarkerCard, RangeSelect } from "../../components/Measurements";
import { usePatient } from "./context";

export default function BiomarkersPage() {
  const { t } = useI18n();
  const { patient: p } = usePatient();
  const { config } = useConfig();
  const [range, setRange] = useState<number | undefined>(undefined);
  return (
    <>
      <h1>{t("nav.biomarkers")}</h1>
      <RangeSelect value={range} onChange={setRange} />
      <p className="xs muted">{t("bio.unitConfigurable")}</p>
      {(config?.biomarkers ?? []).map((b) => <BiomarkerCard key={b.id} cfg={b} reading={p.latest_biomarkers[b.id]} devices={p.devices} patientId={p.id} range={range} />)}
    </>
  );
}
