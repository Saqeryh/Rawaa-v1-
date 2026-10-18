import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { Brand, DemoBanner, LanguageSwitcher } from "../components/shared";
import { Card } from "../components/ui";

export default function Landing() {
  const { t } = useI18n();
  const caps = [1, 2, 3, 4] as const;
  const flow = ["flow1", "flow2", "flow3", "flow4", "flow5"] as const;
  return (
    <>
      <a className="skip-link" href="#main">{t("nav.skip")}</a>
      <DemoBanner />
      <div className="container">
        <header className="landing-header">
          <Brand />
          <LanguageSwitcher />
        </header>
        <main id="main">
          <section className="hero">
            <div className="stack">
              <span className="badge primary" style={{ width: "fit-content" }}>{t("notice.prototype")}</span>
              <h1>{t("landing.heroTitle")}</h1>
              <p className="lead">{t("landing.heroText")}</p>
            </div>
            <div className="grid-2">
              <Card className="entry-card">
                <h2>{t("nav.doctorArea")}</h2>
                <p className="muted">{t("landing.doctorText")}</p>
                <Link className="btn primary" to="/doctor/login">{t("landing.doctorCta")}</Link>
              </Card>
              <Card className="entry-card">
                <h2>{t("nav.patientArea")}</h2>
                <p className="muted">{t("landing.patientText")}</p>
                <Link className="btn primary" to="/patient/login">{t("landing.patientCta")}</Link>
              </Card>
            </div>
          </section>

          <section className="stack" aria-labelledby="cap-h">
            <h2 id="cap-h">{t("landing.capTitle")}</h2>
            <div className="grid">
              {caps.map((n) => (
                <Card key={n} tight><h3>{t(`landing.cap${n}t`)}</h3><p className="muted small">{t(`landing.cap${n}d`)}</p></Card>
              ))}
            </div>
          </section>

          <section className="stack" style={{ marginTop: 32 }} aria-labelledby="flow-h">
            <h2 id="flow-h">{t("landing.flowTitle")}</h2>
            <div className="flow" role="list">
              {flow.map((k, i) => (
                <span key={k} className="row" style={{ gap: 8 }} role="listitem">
                  <span className="step">{t(`landing.${k}`)}</span>
                  {i < flow.length - 1 && <span className="arrow" aria-hidden="true">→</span>}
                </span>
              ))}
            </div>
          </section>

          <section style={{ marginTop: 32 }} aria-labelledby="lim-h">
            <Card>
              <h2 id="lim-h" style={{ marginBottom: 12 }}>{t("landing.limitsTitle")}</h2>
              <ul className="list-check">
                {[1, 2, 3, 4].map((n) => <li key={n}>{t(`landing.limit${n}`)}</li>)}
              </ul>
            </Card>
          </section>
        </main>
        <footer className="site">
          <Brand />
          <p style={{ marginTop: 8 }}>{t("notice.demo")} · {t("notice.notADoctor")}</p>
        </footer>
      </div>
    </>
  );
}
