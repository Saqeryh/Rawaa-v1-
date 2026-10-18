import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import en from "../i18n/en.json";
import ar from "../i18n/ar.json";
import ko from "../i18n/ko.json";
import { LANG_META, makeFormatters, translate, useI18n } from "../i18n";
import { LanguageSwitcher } from "../components/shared";
import { renderApp } from "./utils";

const flat = (d: any, p = ""): Record<string, string> =>
  Object.entries(d).reduce((o, [k, v]) => (typeof v === "object" ? { ...o, ...flat(v, p + k + ".") } : { ...o, [p + k]: v as string }), {});
const EN = flat(en), AR = flat(ar), KO = flat(ko);
const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f: string) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "test" ? [] : sourceFiles(p);
    return /\.(tsx?|)$/.test(f) && /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("translation files", () => {
  it("have identical key sets in ar / en / ko", () => {
    expect(Object.keys(AR).sort()).toEqual(Object.keys(EN).sort());
    expect(Object.keys(KO).sort()).toEqual(Object.keys(EN).sort());
  });
  it("keep the same {placeholders} in every language", () => {
    for (const k of Object.keys(EN)) { expect(ph(AR[k]), k).toBe(ph(EN[k])); expect(ph(KO[k]), k).toBe(ph(EN[k])); }
  });
  it("have no empty strings", () => {
    for (const d of [EN, AR, KO]) for (const [k, v] of Object.entries(d)) expect(v.trim().length, k).toBeGreaterThan(0);
  });
  it("Arabic and Korean are really translated (not English copies) for user-facing strings", () => {
    const same = Object.keys(EN).filter((k) => AR[k] === EN[k] && /[a-z]{4}/i.test(EN[k]) && !["app.name", "risk.source.trained_model"].includes(k));
    expect(same.length).toBeLessThan(6); // allow a few brand/ID-like strings
  });
  it("every literal t('…') key used in the source exists", () => {
    // Only complete keys: `t("sim.eventKind." + kind)` is a dynamic family, covered by the next test,
    // so the pattern must not swallow the dangling trailing dot.
    const re = /\bt\(\s*["'`]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)["'`]/g;
    const missing: string[] = [];
    for (const f of sourceFiles(join(__dirname, ".."))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(re)) if (!(m[1] in EN)) missing.push(`${f.split(/[\\/]src[\\/]/)[1]}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
  it("cover every dynamic key family the UI or backend can produce", () => {
    const need: string[] = [];
    const fam = (prefix: string, vals: string[]) => vals.forEach((v) => need.push(`${prefix}.${v}`));
    fam("risk", ["low_risk", "rising_activity", "pre_thrombotic_state", "critical_thrombosis_risk"]);
    fam("risk.explain", ["low_risk", "rising_activity", "pre_thrombotic_state", "critical_thrombosis_risk", "insufficient"]);
    fam("risk.reason", ["no_data", "stale_data", "not_enough_data"]);
    fam("risk.quality", ["ok", "degraded", "insufficient"]);
    fam("risk.source", ["demonstration_rule", "synthetic_model", "trained_model"]);
    fam("alert.risk", ["rising_activity", "pre_thrombotic_state", "critical_thrombosis_risk"]);
    need.push("alert.device_disconnected", "alert.missing_data");
    fam("alert.severity", ["info", "warning", "critical"]); fam("alert.state", ["open", "acknowledged"]);
    fam("status.monitoring", ["active", "paused", "discharged"]); fam("status.review", ["none", "pending_review", "reviewed", "follow_up"]);
    fam("status.device", ["connected", "disconnected"]); fam("status.connection", ["live", "reconnecting", "failed", "idle"]);
    fam("bio.source", ["synthetic_seed", "simulator", "manual_demo"]); fam("bio.quality", ["ok", "poor", "missing"]);
    fam("bio.sensorKind", ["wearable_patch", "electrochemical_aptasensor"]); fam("bio.category", ["coagulation", "platelet_activation", "inflammatory"]);
    fam("device.kind", ["wearable_patch", "electrochemical_aptasensor"]);
    fam("sim.state", ["stopped", "running", "paused"]);
    fam("sim.eventKind", ["seed_completed", "simulation_started", "simulation_paused", "simulation_resumed", "reading_generated", "reading_skipped_disconnected", "device_connected", "device_disconnected", "missing_data_armed", "alert_acknowledged", "simulated_proposal_confirmed", "simulated_proposal_cancelled"]);
    fam("patients.scenarios", ["stable", "rising", "pre_thrombotic", "critical", "missing_data", "disconnected", "pending_review"]);
    fam("proposal.status", ["pending", "confirmed", "cancelled"]);
    fam("patients.sort", ["id", "name", "risk", "last_update"]);
    expect(need.filter((k) => !(k in EN))).toEqual([]);
  });
});

describe("formatting & direction", () => {
  it("never renders a missing measurement as zero", () => {
    for (const l of ["ar", "en", "ko"] as const) {
      const f = makeFormatters(l);
      expect(f.number(null)).toBe("—"); expect(f.number(undefined)).toBe("—"); expect(f.number(NaN)).toBe("—");
      expect(f.number(0)).not.toBe("—"); // a real zero is still a number
    }
  });
  it("uses Latin digits and the Gregorian calendar for Arabic", () => {
    const f = makeFormatters("ar");
    expect(f.number(12.5)).toMatch(/^12[.,٫]5$/);
    expect(f.dateTime("2026-01-15T10:00:00Z")).toMatch(/2026/);
  });
  it("interpolates params and falls back to English then key", () => {
    expect(translate("ko", "patients.count", { n: 3 })).toContain("3");
    expect(translate("en", "does.not.exist")).toBe("does.not.exist");
  });
  it("only Arabic is RTL", () => {
    expect(LANG_META.ar.dir).toBe("rtl"); expect(LANG_META.en.dir).toBe("ltr"); expect(LANG_META.ko.dir).toBe("ltr");
  });
});

function Probe() { const { t, dir } = useI18n(); return <><LanguageSwitcher /><p data-testid="probe">{t("nav.patients")}|{dir}</p></>; }

describe("language switcher", () => {
  it("switches text, <html lang> and <html dir> and persists the choice", () => {
    renderApp(<Probe />, { lang: "en" });
    expect(screen.getByTestId("probe")).toHaveTextContent("Patients|ltr");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    fireEvent.click(screen.getByRole("button", { name: "العربية" }));
    expect(screen.getByTestId("probe")).toHaveTextContent("المرضى|rtl");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(localStorage.getItem("rawa.lang")).toBe("ar");
    fireEvent.click(screen.getByRole("button", { name: "한국어" }));
    expect(screen.getByTestId("probe")).toHaveTextContent("환자|ltr");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
  });
});
