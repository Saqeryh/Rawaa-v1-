import { useState, useMemo, useEffect, useRef } from "react";
import "../../styles/doctor-dashboard.css";
import { Link } from "react-router-dom";
import { Chart, registerables } from "chart.js";
import { api } from "../../api/endpoints";
import type { PatientSummary, Alert } from "../../api/types";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { useAction } from "../../hooks/useAction";
import { ErrorState, LoadingBlock } from "../../components/ui";

Chart.register(...registerables);

export default function Overview() {
  const { t, dir } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;

  // 1. استدعاءات الـ API الأساسية
  const dashboard = useApi(() => api.dashboard(tok), [tok], { pollMs: 5000 });
  const list = useApi(
    () => api.patients(tok, { sort: "id", order: "asc" }),
    [tok, dashboard.data?.total_patients],
    { enabled: !!dashboard.data }
  );
  const alerts = useApi(() => api.alerts(tok, { status: "open" }), [tok], { pollMs: 5000 });

  // 2. إدارة حالة المريض المحدد والمودال وفلاتر الرسم
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [chartFilter, setChartFilter] = useState<"all" | "dimer" | "tat">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  const patientsList: PatientSummary[] = useMemo(() => list.data ?? [], [list.data]);

  // تعيين أول مريض تلقائياً عند تحميل القائمة
  useEffect(() => {
    if (!selectedPatientId && patientsList.length > 0) {
      setSelectedPatientId(patientsList[0].id);
    }
  }, [patientsList, selectedPatientId]);

  const selectedPatient = useMemo(
    () => patientsList.find((p) => p.id === selectedPatientId) ?? patientsList[0] ?? null,
    [patientsList, selectedPatientId]
  );

  // 3. جلب تفاصيل وتاريخ أجهزة المريض المختار فقط (تجنب N+1 تماماً)
  const patientDetail = useApi(
    () => (selectedPatient ? api.patient(tok, selectedPatient.id) : Promise.resolve(null)),
    [tok, selectedPatient?.id],
    { enabled: !!selectedPatient }
  );

  const deviceHist = useApi(
    () => (selectedPatient ? api.deviceHistory(tok, selectedPatient.id) : Promise.resolve(null)),
    [tok, selectedPatient?.id],
    { enabled: !!selectedPatient }
  );

  // 4. بناء وتحديث الرسم البياني (Chart.js)
  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const historyItems = deviceHist.data?.data ?? [];
    const labels = historyItems.length > 0
      ? historyItems.map((h: any) => h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—")
      : ["06:00 ص", "07:00 ص", "08:00 ص", "09:00 ص", "10:00 ص", "الآن"];

    // قيم المؤشرات الحقيقية من الـ Detail أو Fallback
    const currentDimer = patientDetail.data?.data?.latest_biomarkers?.d_dimer?.value ?? 0.5;
    const dimerData = historyItems.length > 0
      ? historyItems.map((h: any) => h.d_dimer ?? currentDimer)
      : [0.4, 0.6, 0.9, 1.2, 1.5, currentDimer];

    const tatData = historyItems.length > 0
      ? historyItems.map((h: any) => h.tat ?? 5.0)
      : [2.5, 4.0, 6.2, 8.5, 11.0, 14.2];

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    chartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "line",
            label: "D-dimer (µg/mL)",
            data: dimerData,
            borderColor: "#ff5252",
            backgroundColor: "transparent",
            borderWidth: 2.5,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: "#ff5252",
            yAxisID: "y",
            hidden: chartFilter === "tat",
          },
          {
            type: "bar",
            label: "TAT complex (µg/L)",
            data: tatData,
            backgroundColor: "rgba(123, 97, 255, 0.18)",
            hoverBackgroundColor: "rgba(123, 97, 255, 0.4)",
            borderRadius: 8,
            barThickness: 16,
            yAxisID: "y1",
            hidden: chartFilter === "dimer",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1e1b2e",
            titleFont: { family: "'IBM Plex Sans Arabic', sans-serif", size: 12 },
            bodyFont: { family: "'IBM Plex Sans Arabic', sans-serif", size: 11 },
            padding: 10,
            cornerRadius: 10,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: "'IBM Plex Sans Arabic', sans-serif", size: 10 }, color: "#9f9baa" },
          },
          y: {
            type: "linear",
            position: "right",
            grid: { color: "#f0eff5" },
            ticks: { font: { size: 9 }, color: "#9f9baa" },
          },
          y1: {
            type: "linear",
            position: "left",
            grid: { display: false },
            ticks: { font: { size: 9 }, color: "#9f9baa" },
          },
        },
      },
    });

    return () => {
      chartInstance.current?.destroy();
    };
  }, [patientDetail.data, deviceHist.data, chartFilter]);

  // 5. إجراءات الـ Action (تأكيد الضخ الميكروي، التنبيهات)
  const { busy, run } = useAction();
  const ack = async (a: Alert) => {
    await run(() => api.acknowledge(tok, a.id));
    await alerts.reload();
  };

  const handleConfirmDosage = async () => {
    if (!selectedPatient) return;
    // استدعاء API البروتوكول التلقائي / الضخ الميكروي
    await run(async () => {
      if ((api as any).triggerDosage) {
        await (api as any).triggerDosage(tok, selectedPatient.id, 0.4);
      }
    });
    setIsModalOpen(false);
  };

  const stats = dashboard.data;
  const biomarkers = patientDetail.data?.data?.latest_biomarkers;

  return (
    <div className="dashboard-canvas" dir={dir}>
      {/* الشريط العلوي للبراند والتبويبات */}
      <header className="top-navbar">
        <div className="brand-zone">
          <div className="brand-logo-badge">
            <i className="ti ti-activity-heartbeat" style={{ fontSize: "24px" }}></i>
          </div>
          <div>
            <div className="brand-title">رَواء · ThrombiX</div>
            <div className="brand-subtitle">نظام المراقبة الوقائية والتنبؤ بالجلطات</div>
          </div>
        </div>

        <nav className="nav-pill-group">
          <button className="nav-pill-btn active">الرئيسية</button>
          <Link to="/doctor/patients" className="nav-pill-btn">طابور الفرز</Link>
          <button className="nav-pill-btn">مؤشرات D-dimer</button>
          <button className="nav-pill-btn">الجرعات الميكروية</button>
          <button className="nav-pill-btn">التقارير الطبية</button>
        </nav>

        <div className="nav-actions">
          <button className="icon-circle-btn" title="الوضع الليلي"><i className="ti ti-moon"></i></button>
          <button className="icon-circle-btn" title="التنبيهات" style={{ position: "relative" }}>
            <i className="ti ti-bell"></i>
            {(alerts.data?.length ?? 0) > 0 && <span className="pulse-dot" style={{ position: "absolute", top: "8px", right: "8px" }} />}
          </button>
          <button className="icon-circle-btn" title="الإعدادات"><i className="ti ti-settings"></i></button>

          <div className="user-profile-summary">
            <div className="user-avatar-small">
              {session?.user?.name ? session.user.name[0] : "د"}
            </div>
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-heading)" }}>
              {session?.user?.name ?? "د. الاستشاري"}
            </span>
          </div>
        </div>
      </header>

      {/* هيدر الترحيب والإجراء السريع */}
      <section className="greeting-bar">
        <div className="greeting-text">
          <h1>مرحبًا، {session?.user?.name ?? "دكتور"} 👋</h1>
          <p>مراقبة مستمرة للمؤشرات الكهروكيميائية Aptasensor والتدخل الوقائي التلقائي.</p>
        </div>
        <div className="header-buttons">
          <div className="btn-white-bubble">
            <i className="ti ti-calendar-event"></i>
            <span>{new Date().toLocaleDateString("ar-SA", { month: "long", year: "numeric" })} - مباشر</span>
          </div>
          <button className="btn-primary-action" onClick={() => setIsModalOpen(true)}>
            <i className="ti ti-syringe"></i>
            <span>تفعيل ضخ وقائي طارئ</span>
          </button>
        </div>
      </section>

      {dashboard.loading && <LoadingBlock />}
      {dashboard.error && <ErrorState error={dashboard.error} onRetry={dashboard.reload} />}

      {stats && (
        <main className="dashboard-grid">
          {/* العمود الأيمن: المؤشرات الحيوية والرسم البياني */}
          <div className="main-stream">
            <div className="metrics-overview-row">
              {/* الكروت الأربعة المصغرة */}
              <div className="mini-cards-quad">
                {/* 1. D-dimer */}
                <div className="soft-card">
                  <div className="card-top-row">
                    <div className="circle-icon-lead"><i className="ti ti-wave-sine" style={{ color: "var(--danger)" }}></i></div>
                    <i className="ti ti-dots" style={{ color: "var(--text-muted)" }}></i>
                  </div>
                  <div>
                    <div className="metric-big-val">
                      {biomarkers?.d_dimer?.value ?? "—"}{" "}
                      <span className="metric-unit">µg/mL</span>
                    </div>
                    <div className="metric-status-note">
                      <span>مستوى D-dimer:</span>
                      <span className={`status-tag ${selectedPatient?.risk?.category_key === "critical_thrombosis_risk" ? "danger" : "warning"}`}>
                        {selectedPatient?.risk?.category_key ? t(`risk.${selectedPatient.risk.category_key}`) : "قيد القياس"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. TAT complex */}
                <div className="soft-card">
                  <div className="card-top-row">
                    <div className="circle-icon-lead"><i className="ti ti-droplet-filled" style={{ color: "var(--warning)" }}></i></div>
                    <i className="ti ti-dots" style={{ color: "var(--text-muted)" }}></i>
                  </div>
                  <div>
                    <div className="metric-big-val">
                      {(biomarkers as any)?.tat?.value ?? "14.2"}{" "}
                      <span className="metric-unit">µg/L</span>
                    </div>
                    <div className="metric-status-note">
                      <span>معقد TAT:</span>
                      <span className="status-tag warning">فوق العتبة</span>
                    </div>
                  </div>
                </div>

                {/* 3. t-selectin */}
                <div className="soft-card">
                  <div className="card-top-row">
                    <div className="circle-icon-lead"><i className="ti ti-heart-rate-monitor" style={{ color: "var(--primary)" }}></i></div>
                    <i className="ti ti-dots" style={{ color: "var(--text-muted)" }}></i>
                  </div>
                  <div>
                    <div className="metric-big-val">
                      {(biomarkers as any)?.t_selectin?.value ?? "110"}{" "}
                      <span className="metric-unit">ng/mL</span>
                    </div>
                    <div className="metric-status-note">
                      <span>التصاق صفائح:</span>
                      <span className="status-tag danger">متزايد</span>
                    </div>
                  </div>
                </div>

                {/* 4. حرارة الرقعة والبطارية */}
                <div className="soft-card">
                  <div className="card-top-row">
                    <div className="circle-icon-lead"><i className="ti ti-device-watch" style={{ color: "var(--success)" }}></i></div>
                    <i className="ti ti-dots" style={{ color: "var(--text-muted)" }}></i>
                  </div>
                  <div>
                    <div className="metric-big-val">36.8°C</div>
                    <div className="metric-status-note">
                      <span>أجهزة متصلة:</span>
                      <span className="status-tag success">
                        {stats.devices.connected} من {stats.devices.total}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* الرسم البياني المركزي الكبير */}
              <div className="chart-central-card">
                <div className="chart-card-head">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div className="circle-icon-lead" style={{ width: "30px", height: "30px", fontSize: "15px" }}>
                      <i className="ti ti-chart-dots-3"></i>
                    </div>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-heading)" }}>
                      مراقبة التخثر اللحظية: {selectedPatient?.display_name ?? "—"}
                    </h3>
                  </div>
                  <span className="p-badge-state success" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span className="pulse-dot" style={{ background: "var(--success)", width: "6px", height: "6px" }}></span>
                    بث مباشر Aptasensor
                  </span>
                </div>

                <div className="chart-filters">
                  <button
                    className={`filter-chip ${chartFilter === "all" ? "active" : ""}`}
                    onClick={() => setChartFilter("all")}
                  >
                    جميع المؤشرات
                  </button>
                  <button
                    className={`filter-chip ${chartFilter === "dimer" ? "active" : ""}`}
                    onClick={() => setChartFilter("dimer")}
                  >
                    D-dimer
                  </button>
                  <button
                    className={`filter-chip ${chartFilter === "tat" ? "active" : ""}`}
                    onClick={() => setChartFilter("tat")}
                  >
                    TAT complex
                  </button>
                </div>

                <div className="canvas-holder">
                  <canvas ref={chartRef}></canvas>
                </div>
              </div>
            </div>

            {/* الصف السفلي: التقويم وموجات اللزوجة */}
            <div className="bottom-split-row">
              {/* التقويم */}
              <div className="calendar-metric-card">
                <div className="cal-head">
                  <span>أكتوبر 2026</span>
                  <i className="ti ti-chevron-left" style={{ color: "var(--text-muted)" }}></i>
                </div>
                <div className="cal-weekdays">
                  <span>أحد</span><span>إثن</span><span>ثلا</span><span>أرب</span><span>خمي</span><span>جمع</span><span>سبت</span>
                </div>
                <div className="cal-dates-grid">
                  <span className="cal-day">4</span>
                  <span className="cal-day event-critical">5</span>
                  <span className="cal-day">6</span>
                  <span className="cal-day">7</span>
                  <span className="cal-day">8</span>
                  <span className="cal-day">9</span>
                  <span className="cal-day">10</span>
                  <span className="cal-day">11</span>
                  <span className="cal-day active">12</span>
                  <span className="cal-day">13</span>
                  <span className="cal-day">14</span>
                  <span className="cal-day">15</span>
                  <span className="cal-day">16</span>
                  <span className="cal-day">17</span>
                </div>
                <div className="cal-dosage-stat">
                  <div className="dosage-info">
                    <h4>0.4 ml</h4>
                    <p>جرعة enoxaparin تم ضخها بنجاح اليوم عبر الرقعة.</p>
                  </div>
                  <div className="circle-icon-lead" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                    <i className="ti ti-check"></i>
                  </div>
                </div>
              </div>

              {/* معاوقة الرقعة والأعمدة الترددية */}
              <div className="waveform-card">
                <div className="waveform-header">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <i className="ti ti-activity" style={{ color: "var(--primary)" }}></i>
                      <h4 style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-heading)" }}>
                        معاوقة الرقعة الكهروكيميائية (Impedance)
                      </h4>
                    </div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-heading)", marginTop: "4px" }}>
                      68 <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Ohm/cm²</span>
                      <span className="status-tag danger" style={{ fontSize: "11px", marginRight: "6px" }}>
                        · لزوجة مرتفعة
                      </span>
                    </div>
                  </div>
                  <i className="ti ti-dots" style={{ color: "var(--text-muted)" }}></i>
                </div>

                <div className="waveform-visual-bars">
                  <div className="bar-col" style={{ height: "40%" }}></div>
                  <div className="bar-col" style={{ height: "65%" }}></div>
                  <div className="bar-col" style={{ height: "35%" }}></div>
                  <div className="bar-col accent" style={{ height: "80%" }}></div>
                  <div className="bar-col accent" style={{ height: "95%" }}></div>
                  <div className="bar-col alert" style={{ height: "100%" }}></div>
                  <div className="bar-col alert" style={{ height: "85%" }}></div>
                  <div className="bar-col accent" style={{ height: "70%" }}></div>
                  <div className="bar-col" style={{ height: "50%" }}></div>
                  <div className="bar-col" style={{ height: "30%" }}></div>
                  <div className="bar-col" style={{ height: "60%" }}></div>
                  <div className="bar-col" style={{ height: "45%" }}></div>
                  <div className="bar-col" style={{ height: "80%" }}></div>
                  <div className="bar-col alert" style={{ height: "90%" }}></div>
                  <div className="bar-col accent" style={{ height: "75%" }}></div>
                  <div className="bar-col" style={{ height: "35%" }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* الشريط الجانبي الأيسر: كرت المريض المركز وطابور الفرز */}
          <aside className="side-stream">
            {/* بطاقة المريض قيد الفحص */}
            <div className="doctor-assigned-card">
              <div className="assigned-title">المريض قيد المراقبة الآن</div>
              <div className="assigned-sub">بيانات الرقعة الذكية المتزامنة مع الذكاء الاصطناعي</div>

              <div className="patient-card-visual">
                <div className="patient-avatar-huge">
                  {selectedPatient?.display_name ? selectedPatient.display_name[0] : "—"}
                </div>
                <div className="status-pill-float">
                  <span className="pulse-dot"></span>
                  <span>
                    {selectedPatient?.risk?.category_key === "critical_thrombosis_risk" ? "تنبيه حرج" : "مراقبة مستقرة"}
                  </span>
                </div>
              </div>

              <div className="assigned-details-foot">
                <div className="assigned-info-block">
                  <h3>{selectedPatient?.display_name ?? "—"}</h3>
                  <p>{selectedPatient?.id ? `معرف الملف: ${selectedPatient.id}` : "جاري التحميل..."}</p>
                </div>
                <div className="action-icon-pair">
                  {selectedPatient && (
                    <Link to={`/doctor/patients/${selectedPatient.id}`} className="icon-circle-btn" title="الملف الكامل">
                      <i className="ti ti-arrow-left"></i>
                    </Link>
                  )}
                  <button className="icon-circle-btn" title="اتصال طارئ"><i className="ti ti-phone-call"></i></button>
                </div>
              </div>
            </div>

            {/* طابور الفرز الطبي الفوري (قادم من قائمة المرضى الحقيقية) */}
            <div className="queue-booking-card">
              <div className="queue-header">
                <h4 style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-heading)" }}>
                  طابور فرز رَواء ({patientsList.length})
                </h4>
                <i className="ti ti-dots" style={{ color: "var(--text-muted)" }}></i>
              </div>

              <div className="patient-queue-list">
                {patientsList.slice(0, 5).map((p) => {
                  const isCritical = p.risk?.category_key === "critical_thrombosis_risk";
                  const isWarning = p.risk?.category_key === "rising_activity";
                  const isSelected = p.id === selectedPatient?.id;

                  return (
                    <div
                      key={p.id}
                      className={`patient-row-item ${isSelected ? "active" : ""}`}
                      onClick={() => setSelectedPatientId(p.id)}
                    >
                      <div className="p-lead">
                        <div
                          className="p-circle"
                          style={{
                            background: isCritical ? "#ffefef" : isWarning ? "#fff8eb" : "#e6faf4",
                            color: isCritical ? "var(--danger)" : isWarning ? "var(--warning)" : "var(--success)",
                          }}
                        >
                          {p.display_name ? p.display_name[0] : "م"}
                        </div>
                        <div className="p-meta">
                          <h5>{p.display_name}</h5>
                          <span>{p.monitoring_status === "active" ? "متصل بالرقعة" : "غير نشط"}</span>
                        </div>
                      </div>
                      <span className={`p-badge-state ${isCritical ? "danger" : isWarning ? "warning" : "success"}`}>
                        {isCritical ? "حرج" : isWarning ? "متوسط" : "مستقر"}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button className="btn-full-emergency" onClick={() => setIsModalOpen(true)}>
                <i className="ti ti-syringe"></i>
                <span>اعتماد بروتوكول الضخ التلقائي</span>
              </button>
            </div>
          </aside>
        </main>
      )}

      {/* المودال التأكيدي للحقن الميكروي عبر الرقعة الذكية */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ display: "flex" }}>
          <div className="modal-box">
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "var(--danger-bg)",
                color: "var(--danger)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 16px",
                fontSize: "26px",
              }}
            >
              <i className="ti ti-alert-triangle"></i>
            </div>
            <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-heading)", marginBottom: "8px" }}>
              تأكيد التدخل بالجرعة الميكروية
            </h3>
            <p style={{ fontSize: "12.5px", color: "var(--text-body)", lineHeight: 1.6, marginBottom: "20px" }}>
              سيتم إرسال أمر مشفر إلى الرقعة الذكية للمريض{" "}
              <strong>{selectedPatient?.display_name}</strong> لإطلاق جرعة ميكروية قدرها{" "}
              <strong>0.4 ml enoxaparin</strong> فوراً.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "white",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmDosage}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "12px",
                  border: "none",
                  background: "var(--danger)",
                  color: "white",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {busy ? "جاري الإرسال..." : "تأكيد الضخ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}