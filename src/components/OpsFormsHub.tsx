import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  CloudSun,
  Compass,
  Copy,
  Download,
  FileSpreadsheet,
  Gauge,
  Navigation,
  Plane,
  Plus,
  Printer,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Wind,
} from "lucide-react";
import {
  ATC_LIGHT_SIGNALS,
  buildIcaoFplString,
  C172_CREW_DESIGNATION_LEGEND,
  C172_QUICK_REF,
  computeC172RWb,
  computeLegMetrics,
  createDefaultCommsReference,
  createDefaultFlightRelease,
  createDefaultIcaoFlightPlan,
  formatDeg3,
  FPL_ROUTE_PRESETS,
  SQUAWK_CODES,
} from "../data/opsReferenceData";
import {
  computeEmptyMoment,
  EAA_FLEET_WB_RECORDS,
  getWeighingDueStatus,
  lookupFleetWeightRecord,
} from "../data/fleetWeightBalance";
import { C172RCgEnvelopeSvg, C172RLoadingGraphSvg } from "./C172RWbChartsSvg";
import {
  Aircraft,
  AirportCommsEntry,
  CommsReferenceData,
  DaySchedule,
  FlightReleaseData,
  IcaoFlightPlanData,
  Instructor,
  OpsDocumentsState,
  StationWeatherSummary,
  Student,
} from "../types";
import {
  exportCommsSheetPdf,
  exportFlightPlanPdf,
  exportFlightReleasePdf,
} from "../utils/exportOpsDocsPdf";

type OpsSubTab = "release" | "fpl" | "comms";

interface OpsFormsHubProps {
  opsDocs: OpsDocumentsState;
  schedule: DaySchedule;
  instructors: Instructor[];
  students: Student[];
  aircraft: Aircraft[];
  isAdmin: boolean;
  activePrintTarget: "schedule" | "release" | "fpl" | "comms";
  onChangeOpsDocsLocal: (next: OpsDocumentsState) => void;
  onSaveOpsDocsCloud: (next: OpsDocumentsState) => void;
  onPrintDoc: (target: "release" | "fpl" | "comms") => void;
  onRequestAdminLogin: () => void;
}

function isoToSlashDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function isoToYyMmDd(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || "").trim());
  return m ? `${m[1].slice(2)}${m[2]}${m[3]}` : "261123";
}

function slotLabelToUtc4(slotLabel: string): string {
  const m = /^(\d{1,2})\s*(AM|PM)$/i.exec((slotLabel || "").trim());
  if (!m) return "0400";
  let h = Number(m[1]);
  const ap = m[2].toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  // Assiut local EET is UTC+2
  const utcH = (h - 2 + 24) % 24;
  return `${String(utcH).padStart(2, "0")}00`;
}

const PrintComb: React.FC<{ cells: number; value?: string; midTallIndex?: number; className?: string }> = ({
  cells,
  value = "",
  midTallIndex,
  className = "",
}) => {
  const chars = value.toUpperCase().slice(0, cells).split("");
  return (
    <div
      className={`inline-grid border border-slate-900 bg-white font-mono text-[8.5pt] font-extrabold text-[#1B365D] ${className}`}
      style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))`, height: "5.2mm" }}
    >
      {Array.from({ length: cells }).map((_, i) => (
        <div
          key={i}
          className="relative flex items-end justify-center pb-[0.3mm] leading-none"
        >
          {i > 0 && (
            <span
              className="absolute bottom-0 left-0 w-[0.25mm] bg-slate-900"
              style={{ height: midTallIndex === i ? "75%" : "45%" }}
            />
          )}
          <span>{chars[i] || ""}</span>
        </div>
      ))}
    </div>
  );
};

const PrintCrossBox: React.FC<{ letter: string; active: boolean }> = ({ letter, active }) => (
  <span
    className={`relative inline-flex h-[5.2mm] w-[5.2mm] items-center justify-center border border-slate-900 font-sans text-[8pt] font-extrabold ${
      active ? "text-[#1B365D]" : "text-slate-400"
    }`}
  >
    <span>{letter}</span>
    {!active && (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to top left, transparent 46%, #C00000 47%, #C00000 53%, transparent 54%)",
        }}
      />
    )}
  </span>
);

export const OpsFormsHub: React.FC<OpsFormsHubProps> = ({
  opsDocs,
  schedule,
  instructors,
  students,
  aircraft,
  isAdmin,
  activePrintTarget,
  onChangeOpsDocsLocal,
  onSaveOpsDocsCloud,
  onPrintDoc,
  onRequestAdminLogin,
}) => {
  const [subTab, setSubTab] = useState<OpsSubTab>("release");
  const [wbChartView, setWbChartView] = useState<"cg" | "loading">("cg");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [cloudSavedMsg, setCloudSavedMsg] = useState(false);
  const [fplCopied, setFplCopied] = useState(false);

  // Live 5-airport METAR/TAF state
  const [wxStations, setWxStations] = useState<StationWeatherSummary[]>([]);
  const [fetching5Wx, setFetching5Wx] = useState(false);
  const [wxFetchedAt, setWxFetchedAt] = useState<string | null>(null);
  const [wx5Error, setWx5Error] = useState<string | null>(null);

  // Quick interactive cockpit tools state
  const [navGsKt, setNavGsKt] = useState<number>(100);
  const [xwindRwyDeg, setXwindRwyDeg] = useState<number>(310);
  const [xwindDir, setXwindDir] = useState<number>(330);
  const [xwindSpd, setXwindSpd] = useState<number>(12);
  const [daElevFt, setDaElevFt] = useState<number>(772);
  const [daOatC, setDaOatC] = useState<number>(28);
  const [daQnhHpa, setDaQnhHpa] = useState<number>(1013);

  const fr = opsDocs.flightRelease;
  const fpl = opsDocs.flightPlan;
  const comms = opsDocs.commsRef;

  const updateFr = (patch: Partial<FlightReleaseData>) =>
    onChangeOpsDocsLocal({ ...opsDocs, flightRelease: { ...fr, ...patch } });

  const buildAircraftWbPatch = (reg: string): Partial<FlightReleaseData> => {
    const rec = lookupFleetWeightRecord(reg, aircraft);
    if (!rec) return { aircraftReg: reg };
    return {
      aircraftReg: reg,
      aircraftModel: rec.aircraftClass === "MULTI" ? "MULTI" : "C172R",
      bewLb: String(rec.basicEmptyWeightLb),
      bewArmIn: String(rec.emptyArmIn),
      bewMoment: computeEmptyMoment(rec.basicEmptyWeightLb, rec.emptyArmIn).toFixed(2),
      weighingDate: rec.weighingDate,
      weighingDueDate: rec.weighingDueDate,
    };
  };

  const updateFpl = (patch: Partial<IcaoFlightPlanData>) =>
    onChangeOpsDocsLocal({ ...opsDocs, flightPlan: { ...fpl, ...patch } });

  const updateComms = (patch: Partial<CommsReferenceData>) =>
    onChangeOpsDocsLocal({ ...opsDocs, commsRef: { ...comms, ...patch } });

  // Scheduled sortie options for Auto-Fill
  const sortieOptions = useMemo(() => {
    const instMap = new Map(instructors.map((i) => [i.id, i]));
    const stuMap = new Map(students.map((s) => [s.id, s]));
    const opts: Array<{
      key: string;
      label: string;
      acId: string;
      acReg: string;
      slotIndex: number;
      slotLabel: string;
      instructor?: Instructor;
      student?: Student;
      type: "DUAL" | "SOLO";
      durationMin: number;
    }> = [];
    aircraft.forEach((ac) => {
      schedule.timeSlots.forEach((slotLabel, sIdx) => {
        const sortie = schedule.grid[ac.id]?.[sIdx];
        if (!sortie) return;
        const inst = sortie.instructorId ? instMap.get(sortie.instructorId) : undefined;
        const stu = sortie.studentId ? stuMap.get(sortie.studentId) : undefined;
        opts.push({
          key: `${ac.id}|${sIdx}`,
          label: `${ac.registration} · ${slotLabel} · ${
            sortie.type === "SOLO"
              ? `${stu?.name || "Student"} (SOLO)`
              : `${inst?.shortName || inst?.name || "Instructor"} / ${stu?.name || "Student"}`
          }`,
          acId: ac.id,
          acReg: ac.registration,
          slotIndex: sIdx,
          slotLabel,
          instructor: inst,
          student: stu,
          type: sortie.type,
          durationMin: sortie.durationMin,
        });
      });
    });
    return opts;
  }, [aircraft, instructors, schedule, students]);

  const handleAutoFillSortie = (key: string) => {
    const picked = sortieOptions.find((o) => o.key === key);
    if (!picked) return;

    const eobtUtc = slotLabelToUtc4(picked.slotLabel);
    const utcFmt = `${eobtUtc.slice(0, 2)}:${eobtUtc.slice(2, 4)}`;
    const dateSlash = isoToSlashDate(schedule.date);
    const dateCompact = isoToYyMmDd(schedule.date);
    const wx9 = schedule.weather[0];
    const visNum = wx9?.visibilityKm ?? schedule.weatherMeta?.todayVisibility?.minVisibilityKm;
    const visText = visNum !== undefined ? `${visNum.toFixed(1)} KM` : "10.0 KM (CAVOK)";
    const durH = String(Math.floor(picked.durationMin / 60)).padStart(2, "0");
    const durM = String(picked.durationMin % 60).padStart(2, "0");
    const callSign = picked.acReg.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const picName =
      picked.type === "SOLO"
        ? picked.student?.name || ""
        : picked.instructor?.name || schedule.missionCommander || "";

    const nextCrew =
      picked.type === "SOLO"
        ? [
            { name: picked.student?.name || "", designation: "02, 41", licenceNo: "", expDate: "" },
            { name: "", designation: "", licenceNo: "", expDate: "" },
            { name: "", designation: "", licenceNo: "", expDate: "" },
            { name: "", designation: "", licenceNo: "", expDate: "" },
          ]
        : [
            {
              name: picked.instructor?.name || "",
              designation: "01, 02",
              licenceNo: "",
              expDate: "",
            },
            { name: picked.student?.name || "", designation: "41", licenceNo: "", expDate: "" },
            { name: "", designation: "", licenceNo: "", expDate: "" },
            { name: "", designation: "", licenceNo: "", expDate: "" },
          ];

    onChangeOpsDocsLocal({
      flightRelease: {
        ...fr,
        ...buildAircraftWbPatch(picked.acReg),
        date: dateSlash,
        utcTime: utcFmt,
        isDual: picked.type === "DUAL",
        isSolo: picked.type === "SOLO",
        frontPaxLb: picked.type === "SOLO" ? "180" : "340",
        crew: nextCrew,
        depAd: "HEAT",
        arrAd: fr.fltCategory === "LCL" ? "HEAT" : fr.arrAd,
        wxWind: wx9?.wind ? wx9.wind.replace("\n", " ") : fr.wxWind,
        wxTemp: wx9?.temp ? `${wx9.temp}°C` : fr.wxTemp,
        wxVis: visText,
        metar: schedule.weatherMeta?.metarRaw || fr.metar,
        taf: schedule.weatherMeta?.tafRaw || fr.taf,
        opsSupervisor: schedule.operationsOfficer || fr.opsSupervisor,
        cfiName: picked.instructor?.name || schedule.missionCommander || fr.cfiName,
        picName,
      },
      flightPlan: {
        ...fpl,
        item7AircraftId: callSign || fpl.item7AircraftId,
        item13EobtUtc: eobtUtc,
        item16TotalEet: `${durH}${durM}`,
        item18Other: `DOF/${dateCompact} EET/HECC0005 OPR/MISR FLYING COLLEGE RMK/${
          picked.type === "SOLO" ? "SOLO" : "DUAL"
        } TRAINING FLT`,
        item19Persons: picked.type === "SOLO" ? "01" : "02",
        item19Pic: picName,
        filedBy: `MFC Ops (${schedule.operationsOfficer || "Capt. Amin"})`,
      },
      commsRef: {
        ...comms,
        aircraftReg: picked.acReg,
        pilotInCommand: picName,
        departureAd: "HEAT",
        metWind: wx9?.wind ? wx9.wind.replace("\n", " ") : comms.metWind,
        metVis: visText,
        metTemp: wx9?.temp ? `${wx9.temp}°C` : comms.metTemp,
      },
    });
  };

  const wb = useMemo(() => computeC172RWb(fr), [fr]);
  const fplAftnText = useMemo(() => buildIcaoFplString(fpl), [fpl]);

  const handleDownloadActivePdf = async () => {
    setExportingPdf(true);
    try {
      if (subTab === "release") await exportFlightReleasePdf(fr);
      else if (subTab === "fpl") await exportFlightPlanPdf(fpl);
      else await exportCommsSheetPdf(comms);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleResetActiveForm = () => {
    if (subTab === "release") {
      onChangeOpsDocsLocal({ ...opsDocs, flightRelease: createDefaultFlightRelease() });
    } else if (subTab === "fpl") {
      onChangeOpsDocsLocal({ ...opsDocs, flightPlan: createDefaultIcaoFlightPlan() });
    } else {
      onChangeOpsDocsLocal({ ...opsDocs, commsRef: createDefaultCommsReference() });
    }
  };

  const handleSaveToCloud = () => {
    onSaveOpsDocsCloud(opsDocs);
    setCloudSavedMsg(true);
    window.setTimeout(() => setCloudSavedMsg(false), 3000);
  };

  const handleFetch5StationsWeather = async () => {
    setFetching5Wx(true);
    setWx5Error(null);
    try {
      const targetIcaos = ["HEAT", "HELX", "HESG", "HEKG", "HESH"].join(",");
      const res = await fetch(`/api/weather?stations=${encodeURIComponent(targetIcaos)}`);
      if (!res.ok) throw new Error(`Weather API error (${res.status})`);
      const data = (await res.json()) as {
        ok?: boolean;
        fetchedAt?: string;
        stations?: StationWeatherSummary[];
        error?: string;
      };
      if (!data.ok || !Array.isArray(data.stations)) {
        throw new Error(data.error || "Could not load 5-airport METAR/TAF.");
      }
      setWxStations(data.stations);
      setWxFetchedAt(data.fetchedAt || new Date().toISOString());
    } catch (err) {
      setWx5Error(err instanceof Error ? err.message : "Failed to fetch live METAR/TAF");
    } finally {
      setFetching5Wx(false);
    }
  };

  const heatStation = wxStations.find((s) => s.icao === "HEAT");

  const applyHeatStationWxToForms = () => {
    if (!heatStation) return;
    const visStr =
      heatStation.visKm !== null ? `${heatStation.visKm.toFixed(1)} KM` : fr.wxVis;
    const qnhStr = heatStation.altimHpa ? String(heatStation.altimHpa) : fr.wxQnh;
    const tempStr = heatStation.tempC !== undefined ? `${heatStation.tempC}°C` : fr.wxTemp;
    const windStr = heatStation.wind ? heatStation.wind.replace("\n", " ") : fr.wxWind;
    onChangeOpsDocsLocal({
      ...opsDocs,
      flightRelease: {
        ...fr,
        wxWind: windStr,
        wxVis: visStr,
        wxTemp: tempStr,
        wxQnh: qnhStr,
        metar: heatStation.metarRaw || fr.metar,
        taf: heatStation.tafRaw || fr.taf,
      },
      commsRef: {
        ...comms,
        metWind: windStr,
        metVis: visStr,
        metTemp: tempStr,
        metQnh: qnhStr,
      },
    });
  };

  // Nav legs computed dynamically from current airport table coordinates
  const navLegs = useMemo(() => {
    const byIcao = new Map(comms.airports.map((a) => [a.icao.trim().toUpperCase(), a]));
    const pairs: Array<[string, string]> = [
      ["HEAT", "HESG"],
      ["HEAT", "HELX"],
      ["HEAT", "HEKG"],
      ["HEAT", "HESH"],
      ["HESG", "HELX"],
      ["HELX", "HEKG"],
    ];
    return pairs
      .map(([fromCode, toCode]) => {
        const a = byIcao.get(fromCode);
        const b = byIcao.get(toCode);
        if (!a || !b) return null;
        return {
          pair: `${fromCode} ↔ ${toCode}`,
          names: `${a.name.split(" ")[0]} → ${b.name.split(" ")[0]}`,
          ...computeLegMetrics(a, b, navGsKt),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [comms.airports, navGsKt]);

  // Crosswind & Headwind calc
  const xwindComponents = useMemo(() => {
    const diffRad = ((xwindDir - xwindRwyDeg) * Math.PI) / 180;
    const headKt = Math.round(xwindSpd * Math.cos(diffRad));
    const crossKt = Math.round(Math.abs(xwindSpd * Math.sin(diffRad)));
    return { headKt, crossKt };
  }, [xwindDir, xwindRwyDeg, xwindSpd]);

  // Pressure & Density Altitude calc
  const daCalc = useMemo(() => {
    const paFt = Math.round(daElevFt + (1013.25 - daQnhHpa) * 30);
    const isaTempC = 15 - (paFt / 1000) * 1.98;
    const daFt = Math.round(paFt + 120 * (daOatC - isaTempC));
    return { paFt, isaTempC: Math.round(isaTempC * 10) / 10, daFt };
  }, [daElevFt, daOatC, daQnhHpa]);

  return (
    <div className="space-y-4">
      {/* Screen Interactive Workspace */}
      <div className="space-y-4 print:hidden">
        {/* Sub-Tabs & Action Toolbar */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Form Switcher */}
            <div
              role="tablist"
              aria-label="Operational Document Types"
              className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={subTab === "release"}
                onClick={() => setSubTab("release")}
                className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition ${
                  subTab === "release"
                    ? "bg-[#1B365D] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate sm:hidden">Release</span>
                <span className="hidden truncate sm:inline">Flight Release</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={subTab === "fpl"}
                onClick={() => setSubTab("fpl")}
                className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition ${
                  subTab === "fpl"
                    ? "bg-[#1B365D] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Plane className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate sm:hidden">Flight Plan</span>
                <span className="hidden truncate sm:inline">Intl Flight Plan</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={subTab === "comms"}
                onClick={() => setSubTab("comms")}
                className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition ${
                  subTab === "comms"
                    ? "bg-[#1B365D] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Radio className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate sm:hidden">VOR/Comms</span>
                <span className="hidden truncate sm:inline">VOR &amp; Comms</span>
              </button>
            </div>

            {/* Auto-Fill + Export Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Auto-fill form from scheduled sortie"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) handleAutoFillSortie(e.target.value);
                  e.target.value = "";
                }}
                className="min-h-[38px] max-w-full flex-1 rounded-lg border border-blue-300 bg-blue-50/70 px-2.5 py-1.5 text-base font-bold text-[#1B365D] focus:border-[#1B365D] focus:outline-none sm:max-w-[260px] sm:text-xs"
              >
                <option value="">Auto-Fill from Today&apos;s Schedule...</option>
                {sortieOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleDownloadActivePdf}
                disabled={exportingPdf}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#C00000] px-3 py-1.5 text-xs font-extrabold text-white shadow-2xs hover:bg-[#9E0000] disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{exportingPdf ? "Building PDF..." : "Download PDF"}</span>
              </button>

              <button
                type="button"
                onClick={() => onPrintDoc(subTab)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-800 hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print</span>
              </button>

              <button
                type="button"
                onClick={handleResetActiveForm}
                title="Reset current document to official MFC defaults"
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>

              {isAdmin ? (
                <button
                  type="button"
                  onClick={handleSaveToCloud}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-2xs hover:bg-emerald-700"
                >
                  {cloudSavedMsg ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Saved to D1
                    </>
                  ) : (
                    <>
                      <Cloud className="h-3.5 w-3.5" /> Save Defaults
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRequestAdminLogin}
                  title="Sign in as Admin to save default form templates to Cloud D1"
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-[#1B365D] hover:bg-blue-100"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Admin Save</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* SUB-TAB 1: OFFICIAL MFC C172R FLIGHT RELEASE + W&B CHARTS        */}
        {/* ================================================================ */}
        {subTab === "release" && (
          <div className="space-y-4">
            {/* Release Header & Metadata */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div>
                  <h2 className="text-sm font-extrabold text-[#1B365D]">
                    C172R FLIGHT RELEASE — MISR FLYING COLLEGE OPERATIONS DEPT.
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Issue No: {fr.issueNo} · Issue Date: {fr.issueDate} · Rev: {fr.revisionDate}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                      wb.category === "OVERWEIGHT" || wb.category === "OUT_OF_CG"
                        ? "bg-red-100 text-[#C00000]"
                        : wb.category === "UTILITY"
                        ? "bg-blue-100 text-[#1B365D]"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    W&amp;B: {wb.category} ({wb.towLb.toFixed(0)} lb)
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-800">
                    Endurance: {wb.enduranceStr}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                <label className="block">
                  <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                    Aircraft Reg
                  </span>
                  <select
                    value={fr.aircraftReg}
                    onChange={(e) => updateFr(buildAircraftWbPatch(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-base font-extrabold text-[#1B365D] md:text-xs"
                  >
                    <optgroup label="Active Detachment Fleet">
                      {aircraft
                        .filter((a) => a.registration.toUpperCase() !== "EXTRA")
                        .map((a) => {
                          const rec = lookupFleetWeightRecord(a.registration, aircraft);
                          return (
                            <option key={a.id} value={a.registration}>
                              {a.registration}
                              {rec ? ` (${rec.basicEmptyWeightLb} lb · ${rec.emptyArmIn}")` : ""}
                            </option>
                          );
                        })}
                    </optgroup>
                    <optgroup label="All EAA / MFC Weighed Fleet (24 Aircraft)">
                      {EAA_FLEET_WB_RECORDS.filter(
                        (r) =>
                          !aircraft.some(
                            (a) => a.registration.trim().toUpperCase() === r.registration
                          )
                      ).map((r) => (
                        <option key={r.registration} value={r.registration}>
                          {r.registration} ({r.aircraftClass} · {r.basicEmptyWeightLb} lb ·{" "}
                          {r.emptyArmIn}&quot;)
                        </option>
                      ))}
                    </optgroup>
                    {!aircraft.some((a) => a.registration === fr.aircraftReg) &&
                      !EAA_FLEET_WB_RECORDS.some((r) => r.registration === fr.aircraftReg) && (
                        <option value={fr.aircraftReg}>{fr.aircraftReg}</option>
                      )}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                    Date (DD/MM/YYYY)
                  </span>
                  <input
                    type="text"
                    value={fr.date}
                    onChange={(e) => updateFr({ date: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-base font-bold md:text-xs"
                  />
                </label>

                <label className="block">
                  <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                    UTC Time
                  </span>
                  <input
                    type="text"
                    value={fr.utcTime}
                    onChange={(e) => updateFr({ utcTime: e.target.value })}
                    placeholder="04:00"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-base font-bold md:text-xs"
                  />
                </label>

                <label className="block">
                  <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                    Flt. Lesson No
                  </span>
                  <input
                    type="text"
                    value={fr.lessonNo}
                    onChange={(e) => updateFr({ lessonNo: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-base font-bold md:text-xs"
                  />
                </label>

                <label className="block">
                  <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                    FLT Category
                  </span>
                  <select
                    value={fr.fltCategory}
                    onChange={(e) =>
                      updateFr({ fltCategory: e.target.value as FlightReleaseData["fltCategory"] })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base font-bold md:text-xs"
                  >
                    <option value="LCL">LCL (Local)</option>
                    <option value="XC">XC (Cross-Country)</option>
                    <option value="INST">INST</option>
                    <option value="SIM INST">SIM INST</option>
                  </select>
                </label>

                <div className="col-span-2 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-4 lg:col-span-1">
                  {(
                    [
                      ["isDual", "DUAL"],
                      ["isSolo", "SOLO"],
                      ["isNight", "NT"],
                      ["isIfr", "IFR"],
                      ["isVfr", "VFR"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="inline-flex cursor-pointer items-center gap-1 text-xs font-extrabold text-slate-800">
                      <input
                        type="checkbox"
                        checked={fr[field]}
                        onChange={(e) => updateFr({ [field]: e.target.checked })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 4 Flight Crewmember Rows */}
              <div className="mt-4">
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#1B365D]">
                  Name and Designation of Each Flight Crewmember
                </div>
                <div className="space-y-2">
                  {fr.crew.map((row, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 sm:grid-cols-12"
                    >
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => {
                          const next = fr.crew.map((r, i) =>
                            i === idx ? { ...r, name: e.target.value } : r
                          );
                          updateFr({ crew: next });
                        }}
                        placeholder={`Crew ${idx + 1} Name`}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-base font-bold sm:col-span-5 md:text-xs"
                      />
                      <input
                        type="text"
                        value={row.designation}
                        onChange={(e) => {
                          const next = fr.crew.map((r, i) =>
                            i === idx ? { ...r, designation: e.target.value } : r
                          );
                          updateFr({ crew: next });
                        }}
                        placeholder="Desig (e.g. 01, 41)"
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-center font-mono text-base font-bold sm:col-span-2 md:text-xs"
                      />
                      <input
                        type="text"
                        value={row.licenceNo}
                        onChange={(e) => {
                          const next = fr.crew.map((r, i) =>
                            i === idx ? { ...r, licenceNo: e.target.value } : r
                          );
                          updateFr({ crew: next });
                        }}
                        placeholder="Licence No"
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-base sm:col-span-3 md:text-xs"
                      />
                      <input
                        type="text"
                        value={row.expDate}
                        onChange={(e) => {
                          const next = fr.crew.map((r, i) =>
                            i === idx ? { ...r, expDate: e.target.value } : r
                          );
                          updateFr({ crew: next });
                        }}
                        placeholder="Exp DD/MM/YY"
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-base sm:col-span-2 md:text-xs"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] font-semibold text-slate-500">
                  {C172_CREW_DESIGNATION_LEGEND}
                </p>
              </div>

              {/* DEP / ARR / ALT + WX CONDITIONS + DOCUMENTS */}
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 lg:col-span-4">
                  <label className="block">
                    <span className="block text-[10px] font-extrabold text-slate-500">DEP.AD</span>
                    <input
                      type="text"
                      value={fr.depAd}
                      onChange={(e) => updateFr({ depAd: e.target.value.toUpperCase() })}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-base font-extrabold uppercase text-[#1B365D] md:text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold text-slate-500">ARR.AD</span>
                    <input
                      type="text"
                      value={fr.arrAd}
                      onChange={(e) => updateFr({ arrAd: e.target.value.toUpperCase() })}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-base font-extrabold uppercase text-[#1B365D] md:text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold text-slate-500">ALT.AD</span>
                    <input
                      type="text"
                      value={fr.altAd}
                      onChange={(e) => updateFr({ altAd: e.target.value.toUpperCase() })}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-base font-extrabold uppercase text-[#1B365D] md:text-xs"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-3 lg:col-span-8">
                  {(
                    [
                      ["wxWind", "WIND"],
                      ["wxRwy", "RWY"],
                      ["wxTemp", "TEMP"],
                      ["wxDp", "DP"],
                      ["wxQnh", "QNH"],
                      ["wxVis", "VIS"],
                    ] as const
                  ).map(([key, lbl]) => (
                    <label key={key} className="block">
                      <span className="block text-[10px] font-extrabold text-slate-500">{lbl}</span>
                      <input
                        type="text"
                        value={fr[key]}
                        onChange={(e) => updateFr({ [key]: e.target.value })}
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-base font-bold md:text-xs"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                {(
                  [
                    ["notam", "NOTAM"],
                    ["taf", "TAF"],
                    ["metar", "METAR"],
                  ] as const
                ).map(([key, lbl]) => (
                  <label key={key} className="flex flex-col gap-1 sm:flex-row sm:items-center">
                    <span className="w-16 shrink-0 text-[10px] font-extrabold uppercase text-slate-600">
                      {lbl}:
                    </span>
                    <input
                      type="text"
                      value={fr[key]}
                      onChange={(e) => updateFr({ [key]: e.target.value })}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1 font-mono text-base font-semibold md:text-xs"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* 9-Step C172R Weight & Balance Tabulation + Live Fig 6-6 / 6-7 CG Envelope */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs xl:col-span-7">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                      Weight &amp; Balance for C172R (Sample vs Your Airplane)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Edit weights in &quot;Your Airplane&quot; — Ramp, Takeoff Weight &amp; Moment auto-calculate.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateFr({ fuelGal: "35" })}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-extrabold ${
                        Number(fr.fuelGal) === 35
                          ? "border-[#1B365D] bg-[#1B365D] text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      Reduced 35 Gal (210 lb)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateFr({ fuelGal: "53" })}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-extrabold ${
                        Number(fr.fuelGal) === 53
                          ? "border-[#1B365D] bg-[#1B365D] text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      Std 53 Gal (318 lb)
                    </button>
                  </div>
                </div>

                {wb.warnings.length > 0 && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-[#C00000]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>{wb.warnings.join(" ")}</div>
                  </div>
                )}

                {(() => {
                  const dueStatus = getWeighingDueStatus(fr.weighingDueDate);
                  return (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-[11px] font-bold text-slate-800">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                          Aircraft: <strong className="font-mono text-[#1B365D]">{fr.aircraftReg}</strong>
                        </span>
                        <span>
                          BEW: <strong className="font-mono text-[#1B365D]">{wb.bewLb} lb</strong>
                        </span>
                        <span>
                          Arm: <strong className="font-mono text-[#1B365D]">{fr.bewArmIn || wb.bewArmIn}&quot;</strong>
                        </span>
                        <span>
                          Weighed: <strong className="font-mono">{fr.weighingDate || "-"}</strong>
                        </span>
                        <span>
                          Due: <strong className="font-mono">{fr.weighingDueDate || "-"}</strong>
                        </span>
                      </div>
                      {dueStatus !== "unknown" && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                            dueStatus === "ok"
                              ? "bg-emerald-100 text-emerald-800"
                              : dueStatus === "due-soon"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-red-100 text-[#C00000]"
                          }`}
                        >
                          {dueStatus === "ok"
                            ? "Valid"
                            : dueStatus === "due-soon"
                            ? "Due Soon"
                            : "Weighing Due — Verify Current Certificate"}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {wb.bewLb > 2000 && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      Multi-Engine aircraft selected — C172R 2,450 lb envelope &amp; sample column
                      apply to C172R only.
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[560px] border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#1B365D] text-white">
                        <th className="px-2.5 py-2 text-left">Item Description</th>
                        <th className="w-16 px-2 py-2 text-center">Sample lb</th>
                        <th className="w-16 px-2 py-2 text-center">Sample Mom</th>
                        <th className="w-28 px-2 py-2 text-center">Your Wt (lb / Gal)</th>
                        <th className="w-24 px-2 py-2 text-center">Your Mom (/1000)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="px-2.5 py-1.5">
                          <div className="font-semibold">1- Basic Empty Weight</div>
                          <label className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-slate-600">
                            <span>Arm (in):</span>
                            <input
                              type="number"
                              step="0.0001"
                              value={fr.bewArmIn ?? String(wb.bewArmIn)}
                              onChange={(e) => {
                                const armStr = e.target.value;
                                const newArm = Number(armStr);
                                const curBew = Number(fr.bewLb);
                                if (
                                  armStr.trim() !== "" &&
                                  Number.isFinite(newArm) &&
                                  newArm > 0 &&
                                  Number.isFinite(curBew) &&
                                  curBew > 0
                                ) {
                                  updateFr({
                                    bewArmIn: armStr,
                                    bewMoment: computeEmptyMoment(curBew, newArm).toFixed(2),
                                  });
                                } else {
                                  updateFr({ bewArmIn: armStr });
                                }
                              }}
                              className="w-24 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-center font-mono text-base font-bold text-[#1B365D] md:text-[11px]"
                            />
                          </label>
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">1639</td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">64.4</td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            step="0.1"
                            value={fr.bewLb}
                            onChange={(e) => {
                              const bewStr = e.target.value;
                              const newBew = Number(bewStr);
                              const curArm = Number(fr.bewArmIn ?? wb.bewArmIn);
                              if (
                                bewStr.trim() !== "" &&
                                Number.isFinite(newBew) &&
                                newBew >= 0 &&
                                Number.isFinite(curArm) &&
                                curArm > 0
                              ) {
                                updateFr({
                                  bewLb: bewStr,
                                  bewMoment: computeEmptyMoment(newBew, curArm).toFixed(2),
                                });
                              } else {
                                updateFr({ bewLb: bewStr });
                              }
                            }}
                            className="w-full rounded border border-slate-300 px-1.5 py-1 text-center font-mono text-base font-bold md:text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={fr.bewMoment}
                            onChange={(e) => {
                              const momStr = e.target.value;
                              const newMom = Number(momStr);
                              const curBew = Number(fr.bewLb);
                              if (
                                momStr.trim() !== "" &&
                                Number.isFinite(newMom) &&
                                newMom >= 0 &&
                                Number.isFinite(curBew) &&
                                curBew > 0
                              ) {
                                updateFr({
                                  bewMoment: momStr,
                                  bewArmIn: ((newMom * 1000) / curBew).toFixed(4),
                                });
                              } else {
                                updateFr({ bewMoment: momStr });
                              }
                            }}
                            className="w-full rounded border border-slate-300 px-1.5 py-1 text-center font-mono text-base font-bold md:text-xs"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2.5 py-1.5 font-semibold">
                          2- Usable Fuel (Gal × 6 lb/gal, max 53)
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">210 (35g)</td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">10.1</td>
                        <td className="p-1.5">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max="53"
                              value={fr.fuelGal}
                              onChange={(e) => updateFr({ fuelGal: e.target.value })}
                              className="w-16 rounded border border-slate-300 px-1.5 py-1 text-center font-mono text-base font-bold md:text-xs"
                            />
                            <span className="font-mono text-[11px] font-bold text-slate-600">
                              gal ({wb.fuelLb}lb)
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono font-bold text-[#1B365D]">
                          {wb.fuelMom.toFixed(1)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2.5 py-1.5 font-semibold">
                          3- Pilot &amp; Front Pax (FS 34–46)
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">340</td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">12.6</td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            min="0"
                            value={fr.frontPaxLb}
                            onChange={(e) => updateFr({ frontPaxLb: e.target.value })}
                            className="w-full rounded border border-slate-300 px-1.5 py-1 text-center font-mono text-base font-bold md:text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono font-bold text-[#1B365D]">
                          {wb.frontPaxMom.toFixed(1)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2.5 py-1.5 font-semibold">4- Rear Passenger (FS 73)</td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">220</td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">16.0</td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            min="0"
                            value={fr.rearPaxLb}
                            onChange={(e) => updateFr({ rearPaxLb: e.target.value })}
                            className="w-full rounded border border-slate-300 px-1.5 py-1 text-center font-mono text-base font-bold md:text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono font-bold text-[#1B365D]">
                          {wb.rearPaxMom.toFixed(1)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2.5 py-1.5 font-semibold">
                          5- Baggage &quot;A&quot; (FS 82–108, max 120 lb)
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">48</td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">4.6</td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            min="0"
                            max="120"
                            value={fr.baggageALb}
                            onChange={(e) => updateFr({ baggageALb: e.target.value })}
                            className="w-full rounded border border-slate-300 px-1.5 py-1 text-center font-mono text-base font-bold md:text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono font-bold text-[#1B365D]">
                          {wb.bagAMom.toFixed(1)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2.5 py-1.5 font-semibold">
                          6- Baggage &quot;B&quot; (FS 108–142, max 50 lb)
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">-</td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">-</td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            min="0"
                            max="50"
                            value={fr.baggageBLb}
                            onChange={(e) => updateFr({ baggageBLb: e.target.value })}
                            className="w-full rounded border border-slate-300 px-1.5 py-1 text-center font-mono text-base font-bold md:text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono font-bold text-[#1B365D]">
                          {wb.bagBMom.toFixed(1)}
                        </td>
                      </tr>
                      <tr className="bg-slate-100 font-extrabold">
                        <td className="px-2.5 py-2 text-[#1B365D]">
                          7- RAMP WEIGHT AND MOMENT (Max 2,457 lb)
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-slate-500">2457</td>
                        <td className="px-2 py-2 text-center font-mono text-slate-500">107.7</td>
                        <td className="px-2 py-2 text-center font-mono text-slate-900">
                          {wb.rampLb.toFixed(1)}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-slate-900">
                          {wb.rampMom.toFixed(1)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2.5 py-1.5">
                          8- Fuel allowance for start, taxi &amp; run-up
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">-7.0</td>
                        <td className="px-2 py-1.5 text-center font-mono text-slate-500">-0.3</td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            step="0.5"
                            value={fr.taxiFuelLb}
                            onChange={(e) => updateFr({ taxiFuelLb: e.target.value })}
                            className="w-full rounded border border-slate-300 px-1.5 py-1 text-center font-mono text-base font-bold md:text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            step="0.1"
                            value={fr.taxiFuelMoment}
                            onChange={(e) => updateFr({ taxiFuelMoment: e.target.value })}
                            className="w-full rounded border border-slate-300 px-1.5 py-1 text-center font-mono text-base font-bold md:text-xs"
                          />
                        </td>
                      </tr>
                      <tr className="bg-blue-50 font-extrabold">
                        <td className="px-2.5 py-2 text-[#1B365D]">
                          9- TAKEOFF WEIGHT &amp; MOMENT (CG Arm {wb.towCgArmIn}&quot;)
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-slate-500">2450</td>
                        <td className="px-2 py-2 text-center font-mono text-slate-500">107.4</td>
                        <td
                          className={`px-2 py-2 text-center font-mono text-sm ${
                            wb.towLb > 2450 ? "text-[#C00000]" : "text-[#1B365D]"
                          }`}
                        >
                          {wb.towLb.toFixed(1)}
                        </td>
                        <td
                          className={`px-2 py-2 text-center font-mono text-sm ${
                            wb.category === "OUT_OF_CG" ? "text-[#C00000]" : "text-[#1B365D]"
                          }`}
                        >
                          {wb.towMom.toFixed(1)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Burn GPH & 3 Signatures */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      Burn Rate (GPH)
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      value={fr.burnGph}
                      onChange={(e) => updateFr({ burnGph: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-base font-bold md:text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      Flight Ops Supervisor
                    </span>
                    <input
                      type="text"
                      value={fr.opsSupervisor}
                      onChange={(e) => updateFr({ opsSupervisor: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-base font-bold md:text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      Certified Flight Instructor
                    </span>
                    <input
                      type="text"
                      value={fr.cfiName}
                      onChange={(e) => updateFr({ cfiName: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-base font-bold md:text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      Pilot in Command
                    </span>
                    <input
                      type="text"
                      value={fr.picName}
                      onChange={(e) => updateFr({ picName: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-base font-bold md:text-xs"
                    />
                  </label>
                </div>
              </div>

              {/* Live Gridded SVG Fig 6-7 CG Moment Envelope & Fig 6-6 Loading Graph */}
              <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs xl:col-span-5">
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-extrabold">
                      <button
                        type="button"
                        onClick={() => setWbChartView("cg")}
                        className={`rounded-md px-2.5 py-1 transition ${
                          wbChartView === "cg"
                            ? "bg-[#1B365D] text-white shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Fig 6-7 CG Envelope
                      </button>
                      <button
                        type="button"
                        onClick={() => setWbChartView("loading")}
                        className={`rounded-md px-2.5 py-1 transition ${
                          wbChartView === "loading"
                            ? "bg-[#1B365D] text-white shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Fig 6-6 Loading Graph
                      </button>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-600">
                      <input
                        type="checkbox"
                        checked={fr.includeWbCharts}
                        onChange={(e) => updateFr({ includeWbCharts: e.target.checked })}
                      />
                      <span>Include Charts Page 2</span>
                    </label>
                  </div>

                  {wbChartView === "cg" ? (
                    <C172RCgEnvelopeSvg wb={wb} />
                  ) : (
                    <C172RLoadingGraphSvg wb={wb} />
                  )}
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">
                  <div>
                    Fuel Station Arm: <strong>48.0&quot;</strong> · Front: <strong>37.0&quot;</strong> ·
                    Rear: <strong>73.0&quot;</strong> · Bag A: <strong>95.0&quot;</strong> · Bag B:{" "}
                    <strong>123.0&quot;</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 2: ICAO INTERNATIONAL FLIGHT PLAN (DOC 4444)             */}
        {/* ================================================================ */}
        {subTab === "fpl" && (
          <div className="space-y-4">
            {/* Route Presets */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                  Quick Cross-Country &amp; Training Presets
                </span>
                <span className="text-[11px] text-slate-500">
                  1-tap fills Departure, Destination, Alternate, Route, Level &amp; EET
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FPL_ROUTE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      updateFpl({
                        item13DepIcao: p.dep,
                        item16DestIcao: p.dest,
                        item16Altn1: p.altn1,
                        item16Altn2: p.altn2,
                        item16TotalEet: p.eet,
                        item15Level: p.level,
                        item15Route: p.route,
                        item8FlightRules: p.rules,
                        item18Other: p.otherInfo,
                      })
                    }
                    className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-extrabold text-[#1B365D] hover:bg-[#1B365D] hover:text-white"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ICAO Items Form Grid */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs xl:col-span-8">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <h2 className="text-sm font-extrabold text-[#1B365D]">
                    Egypt NANSC / MFC International Flight Plan (ICAO Doc 4444)
                  </h2>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Exact paper form replica + AFTN builder
                  </span>
                </div>

                {/* Top Aerodrome & AFTN Addressing Header */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
                  <label className="col-span-2 block sm:col-span-2">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      Header Aerodrome (مطار)
                    </span>
                    <input
                      type="text"
                      value={fpl.aerodrome || ""}
                      onChange={(e) => updateFpl({ aerodrome: e.target.value.toUpperCase() })}
                      placeholder="ASSIUT (HEAT)"
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-base font-bold uppercase text-[#1B365D] md:text-xs"
                    />
                  </label>
                  <label className="block sm:col-span-1">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      Priority
                    </span>
                    <input
                      type="text"
                      value={fpl.priority}
                      onChange={(e) => updateFpl({ priority: e.target.value.toUpperCase() })}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 font-mono text-base font-bold uppercase md:text-xs"
                    />
                  </label>
                  <label className="block sm:col-span-1">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      Filing Time UTC
                    </span>
                    <input
                      type="text"
                      value={fpl.filingTimeUtc}
                      onChange={(e) => updateFpl({ filingTimeUtc: e.target.value })}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 font-mono text-base font-bold md:text-xs"
                    />
                  </label>
                  <label className="col-span-2 block sm:col-span-2">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      Originator (8 Chars)
                    </span>
                    <input
                      type="text"
                      value={fpl.originator}
                      onChange={(e) => updateFpl({ originator: e.target.value.toUpperCase() })}
                      placeholder="HEATYOYX"
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 font-mono text-base font-bold uppercase md:text-xs"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      Addressee(s)
                    </span>
                    <input
                      type="text"
                      value={fpl.addressees}
                      onChange={(e) => updateFpl({ addressees: e.target.value.toUpperCase() })}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 font-mono text-base font-bold uppercase md:text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      Specific ID of Addressee(s) / Originator
                    </span>
                    <input
                      type="text"
                      value={fpl.specificId || ""}
                      onChange={(e) => updateFpl({ specificId: e.target.value.toUpperCase() })}
                      placeholder="Optional"
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 font-mono text-base font-semibold uppercase md:text-xs"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      7 · Aircraft ID
                    </span>
                    <input
                      type="text"
                      value={fpl.item7AircraftId}
                      onChange={(e) =>
                        updateFpl({ item7AircraftId: e.target.value.toUpperCase() })
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 font-mono text-base font-extrabold uppercase text-[#1B365D] md:text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      8 · Flight Rules
                    </span>
                    <select
                      value={fpl.item8FlightRules}
                      onChange={(e) =>
                        updateFpl({
                          item8FlightRules: e.target.value as IcaoFlightPlanData["item8FlightRules"],
                        })
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-base font-bold md:text-xs"
                    >
                      <option value="V">V (VFR)</option>
                      <option value="I">I (IFR)</option>
                      <option value="Y">Y (IFR then VFR)</option>
                      <option value="Z">Z (VFR then IFR)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      8 · Flight Type
                    </span>
                    <select
                      value={fpl.item8FlightType}
                      onChange={(e) =>
                        updateFpl({
                          item8FlightType: e.target.value as IcaoFlightPlanData["item8FlightType"],
                        })
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-base font-bold md:text-xs"
                    >
                      <option value="G">G (General Aviation)</option>
                      <option value="N">N (Non-Scheduled)</option>
                      <option value="S">S (Scheduled)</option>
                      <option value="X">X (Other / Training)</option>
                      <option value="M">M (Military / State)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      9 · No. / Type / Wake
                    </span>
                    <div className="mt-0.5 flex gap-1">
                      <input
                        type="text"
                        value={fpl.item9Number}
                        onChange={(e) => updateFpl({ item9Number: e.target.value })}
                        title="Number of aircraft"
                        className="w-1/5 rounded border border-slate-300 px-1 py-1 text-center font-mono text-base font-bold md:text-xs"
                      />
                      <input
                        type="text"
                        value={fpl.item9AircraftType}
                        onChange={(e) =>
                          updateFpl({ item9AircraftType: e.target.value.toUpperCase() })
                        }
                        className="w-3/5 rounded border border-slate-300 px-2 py-1 font-mono text-base font-bold uppercase md:text-xs"
                      />
                      <select
                        value={fpl.item9WakeCat}
                        onChange={(e) =>
                          updateFpl({
                            item9WakeCat: e.target.value as IcaoFlightPlanData["item9WakeCat"],
                          })
                        }
                        className="w-1/5 rounded border border-slate-300 bg-white px-1 py-1 font-mono text-base font-bold md:text-xs"
                      >
                        <option value="L">L</option>
                        <option value="M">M</option>
                      </select>
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      10 · Equip / Surv
                    </span>
                    <div className="mt-0.5 flex gap-1">
                      <input
                        type="text"
                        value={fpl.item10Equipment}
                        onChange={(e) =>
                          updateFpl({ item10Equipment: e.target.value.toUpperCase() })
                        }
                        className="w-2/3 rounded border border-slate-300 px-2 py-1 font-mono text-base font-bold uppercase md:text-xs"
                      />
                      <input
                        type="text"
                        value={fpl.item10Surveillance}
                        onChange={(e) =>
                          updateFpl({ item10Surveillance: e.target.value.toUpperCase() })
                        }
                        className="w-1/3 rounded border border-slate-300 px-2 py-1 font-mono text-base font-bold uppercase md:text-xs"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      13 · DEP AD &amp; EOBT UTC
                    </span>
                    <div className="mt-0.5 flex gap-1">
                      <input
                        type="text"
                        value={fpl.item13DepIcao}
                        onChange={(e) =>
                          updateFpl({ item13DepIcao: e.target.value.toUpperCase() })
                        }
                        className="w-1/2 rounded border border-slate-300 px-2 py-1 font-mono text-base font-bold uppercase md:text-xs"
                      />
                      <input
                        type="text"
                        value={fpl.item13EobtUtc}
                        onChange={(e) => updateFpl({ item13EobtUtc: e.target.value })}
                        className="w-1/2 rounded border border-slate-300 px-2 py-1 font-mono text-base font-bold md:text-xs"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      15 · Speed &amp; Level
                    </span>
                    <div className="mt-0.5 flex gap-1">
                      <input
                        type="text"
                        value={fpl.item15Speed}
                        onChange={(e) => updateFpl({ item15Speed: e.target.value.toUpperCase() })}
                        className="w-1/2 rounded border border-slate-300 px-2 py-1 font-mono text-base font-bold uppercase md:text-xs"
                      />
                      <input
                        type="text"
                        value={fpl.item15Level}
                        onChange={(e) => updateFpl({ item15Level: e.target.value.toUpperCase() })}
                        className="w-1/2 rounded border border-slate-300 px-2 py-1 font-mono text-base font-bold uppercase md:text-xs"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      16 · DEST / EET / ALTN
                    </span>
                    <div className="mt-0.5 flex gap-1">
                      <input
                        type="text"
                        value={fpl.item16DestIcao}
                        onChange={(e) =>
                          updateFpl({ item16DestIcao: e.target.value.toUpperCase() })
                        }
                        placeholder="DEST"
                        className="w-1/3 rounded border border-slate-300 px-1.5 py-1 font-mono text-base font-bold uppercase md:text-xs"
                      />
                      <input
                        type="text"
                        value={fpl.item16TotalEet}
                        onChange={(e) => updateFpl({ item16TotalEet: e.target.value })}
                        placeholder="EET"
                        className="w-1/3 rounded border border-slate-300 px-1.5 py-1 font-mono text-base font-bold md:text-xs"
                      />
                      <input
                        type="text"
                        value={fpl.item16Altn1}
                        onChange={(e) => updateFpl({ item16Altn1: e.target.value.toUpperCase() })}
                        placeholder="ALTN"
                        className="w-1/3 rounded border border-slate-300 px-1.5 py-1 font-mono text-base font-bold uppercase md:text-xs"
                      />
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      15 · Route
                    </span>
                    <input
                      type="text"
                      value={fpl.item15Route}
                      onChange={(e) => updateFpl({ item15Route: e.target.value.toUpperCase() })}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2.5 py-1 font-mono text-base font-bold uppercase md:text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      16 · 2nd Alternate AD
                    </span>
                    <input
                      type="text"
                      value={fpl.item16Altn2}
                      onChange={(e) => updateFpl({ item16Altn2: e.target.value.toUpperCase() })}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2.5 py-1 font-mono text-base font-bold uppercase md:text-xs"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                    18 · Other Information
                  </span>
                  <textarea
                    rows={2}
                    value={fpl.item18Other}
                    onChange={(e) => updateFpl({ item18Other: e.target.value.toUpperCase() })}
                    className="mt-0.5 w-full rounded border border-slate-300 px-2.5 py-1 font-mono text-base font-semibold uppercase md:text-xs"
                  />
                </label>

                {/* Item 19 Supplementary Info */}
                <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#1B365D]">
                    19 · Supplementary Information (Not Transmitted in FPL)
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <label className="block">
                      <span className="block text-[10px] font-extrabold text-slate-500">
                        E/ Endurance (HHMM)
                      </span>
                      <input
                        type="text"
                        value={fpl.item19Endurance}
                        onChange={(e) => updateFpl({ item19Endurance: e.target.value })}
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-base font-bold md:text-xs"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-extrabold text-slate-500">
                        P/ Persons
                      </span>
                      <input
                        type="text"
                        value={fpl.item19Persons}
                        onChange={(e) => updateFpl({ item19Persons: e.target.value })}
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-base font-bold md:text-xs"
                      />
                    </label>
                    <label className="col-span-2 block">
                      <span className="block text-[10px] font-extrabold text-slate-500">
                        C/ Pilot-In-Command
                      </span>
                      <input
                        type="text"
                        value={fpl.item19Pic}
                        onChange={(e) => updateFpl({ item19Pic: e.target.value })}
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-base font-bold md:text-xs"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-slate-600">R/ Radio:</span>
                      {(
                        [
                          ["item19RadioU", "U (UHF)"],
                          ["item19RadioV", "V (VHF)"],
                          ["item19RadioE", "E (ELT)"],
                        ] as const
                      ).map(([k, lbl]) => (
                        <label key={k} className="inline-flex items-center gap-1 font-bold">
                          <input
                            type="checkbox"
                            checked={fpl[k]}
                            onChange={(e) => updateFpl({ [k]: e.target.checked })}
                          />
                          <span>{lbl}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-slate-600">S/ Survival:</span>
                      {(
                        [
                          ["item19SurvP", "P (Polar)"],
                          ["item19SurvD", "D (Desert)"],
                          ["item19SurvM", "M (Maritime)"],
                          ["item19SurvJ", "J (Jungle)"],
                        ] as const
                      ).map(([k, lbl]) => (
                        <label key={k} className="inline-flex items-center gap-1 font-bold">
                          <input
                            type="checkbox"
                            checked={fpl[k]}
                            onChange={(e) => updateFpl({ [k]: e.target.checked })}
                          />
                          <span>{lbl}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-slate-600">J/ Jackets:</span>
                      {(
                        [
                          ["item19JacketsL", "L (Light)"],
                          ["item19JacketsF", "F (Fluores)"],
                          ["item19JacketsU", "U (UHF)"],
                          ["item19JacketsV", "V (VHF)"],
                        ] as const
                      ).map(([k, lbl]) => (
                        <label key={k} className="inline-flex items-center gap-1 font-bold">
                          <input
                            type="checkbox"
                            checked={fpl[k]}
                            onChange={(e) => updateFpl({ [k]: e.target.checked })}
                          />
                          <span>{lbl}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* D/ Dinghies */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="block">
                      <span className="block text-[10px] font-extrabold text-slate-500">
                        D/ Dinghy Number
                      </span>
                      <input
                        type="text"
                        value={fpl.item19DinghiesNum}
                        onChange={(e) => updateFpl({ item19DinghiesNum: e.target.value })}
                        placeholder="e.g. 01"
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-base font-bold md:text-xs"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-extrabold text-slate-500">
                        D/ Capacity
                      </span>
                      <input
                        type="text"
                        value={fpl.item19DinghiesCap}
                        onChange={(e) => updateFpl({ item19DinghiesCap: e.target.value })}
                        placeholder="e.g. 004"
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-base font-bold md:text-xs"
                      />
                    </label>
                    <label className="flex items-end pb-1.5 text-xs font-bold text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={fpl.item19DinghiesCover}
                          onChange={(e) => updateFpl({ item19DinghiesCover: e.target.checked })}
                        />
                        <span>D/ Cover (C)</span>
                      </span>
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-extrabold text-slate-500">
                        D/ Color
                      </span>
                      <input
                        type="text"
                        value={fpl.item19DinghiesColor}
                        onChange={(e) =>
                          updateFpl({ item19DinghiesColor: e.target.value.toUpperCase() })
                        }
                        placeholder="e.g. ORANGE"
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-base font-bold uppercase md:text-xs"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Live AFTN Teletype String Output & Signature/Acceptance Fields */}
              <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs xl:col-span-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                      Live AFTN Message
                    </h3>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(fplAftnText);
                        setFplCopied(true);
                        window.setTimeout(() => setFplCopied(false), 2500);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#1B365D] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#142947]"
                    >
                      {fplCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{fplCopied ? "Copied!" : "Copy FPL"}</span>
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg border border-slate-300 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-emerald-300">
                    {fplAftnText}
                  </pre>

                  <div className="mt-3 space-y-2 text-xs">
                    <label className="block">
                      <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                        A/ Aircraft Color &amp; Markings
                      </span>
                      <input
                        type="text"
                        value={fpl.item19ColorMarkings}
                        onChange={(e) => updateFpl({ item19ColorMarkings: e.target.value })}
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-base font-bold md:text-xs"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                        N/ Remarks
                      </span>
                      <input
                        type="text"
                        value={fpl.item19Remarks}
                        onChange={(e) => updateFpl({ item19Remarks: e.target.value })}
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-base font-bold md:text-xs"
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="block">
                        <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                          Filed By
                        </span>
                        <input
                          type="text"
                          value={fpl.filedBy}
                          onChange={(e) => updateFpl({ filedBy: e.target.value })}
                          className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-base font-bold md:text-xs"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                          Accepted By
                        </span>
                        <input
                          type="text"
                          value={fpl.acceptedBy || ""}
                          onChange={(e) => updateFpl({ acceptedBy: e.target.value })}
                          placeholder="Briefing Officer"
                          className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-base font-bold md:text-xs"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                        Additional Information
                      </span>
                      <input
                        type="text"
                        value={fpl.additionalReq}
                        onChange={(e) => updateFpl({ additionalReq: e.target.value })}
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-base font-bold md:text-xs"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 3: VOR, COMMS, 5-AIRPORT AIP MATRIX & EXTRA PILOT TOOLS  */}
        {/* ================================================================ */}
        {subTab === "comms" && (
          <div className="space-y-4">
            {/* Safety Notice + Toggle for 2-Page PDF */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                <span>{comms.airacNote}</span>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 font-extrabold text-[#1B365D]">
                <input
                  type="checkbox"
                  checked={comms.includeDetailedPage2}
                  onChange={(e) => updateComms({ includeDetailedPage2: e.target.checked })}
                />
                <span>Include 5-Airport Detailed Matrix &amp; Nav Kneeboard (Page 2)</span>
              </label>
            </div>

            {/* Live 5-Airport METAR / TAF Monitor */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CloudSun className="h-4 w-4 text-blue-600" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                    Live 5-Airport METAR / TAF Status (HEAT · HELX · HESG · HEKG · HESH)
                  </h3>
                  {wxFetchedAt && (
                    <span className="text-[10px] font-semibold text-slate-400">
                      {new Date(wxFetchedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {heatStation && (
                    <button
                      type="button"
                      onClick={applyHeatStationWxToForms}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold text-emerald-800 hover:bg-emerald-100"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Apply HEAT METAR to Forms
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleFetch5StationsWeather}
                    disabled={fetching5Wx}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B365D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#142947] disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${fetching5Wx ? "animate-spin" : ""}`} />
                    <span>{fetching5Wx ? "Fetching 5 Airports..." : "Fetch Live METAR/TAF"}</span>
                  </button>
                </div>
              </div>

              {wx5Error && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-[#C00000]">
                  {wx5Error}
                </div>
              )}

              {wxStations.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {wxStations.map((st) => (
                    <div
                      key={st.icao}
                      className={`rounded-lg border p-2.5 text-xs ${
                        !st.vfrOkForPpl
                          ? "border-red-300 bg-red-50/70"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-extrabold text-[#1B365D]">
                          {st.icao}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                            !st.vfrOkForPpl
                              ? "bg-red-100 text-[#C00000]"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {st.visKm !== null ? `${st.visKm.toFixed(1)} km` : "NO METAR"}
                        </span>
                      </div>
                      <div className="mt-1 space-y-0.5 text-[11px] text-slate-700">
                        <div>Wind: {st.wind ? st.wind.replace("\n", " ") : "-"}</div>
                        <div>
                          Temp: {st.tempC !== undefined ? `${st.tempC}°C` : "-"} · QNH:{" "}
                          {st.altimHpa ?? "-"}
                        </div>
                      </div>
                      {st.metarRaw && (
                        <div className="mt-1.5 truncate font-mono text-[9px] text-slate-500" title={st.metarRaw}>
                          {st.metarRaw}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Official MFC Clearance & Frequency Sheet (Editable Image 1 Layout) */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <h2 className="mb-3 border-b border-slate-200 pb-2 text-sm font-extrabold text-[#1B365D]">
                MFC Clearance, Met Report &amp; Master Frequency Sheet (Printable Page 1)
              </h2>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {(
                  [
                    ["aircraftReg", "Aircraft Registration"],
                    ["pilotInCommand", "Pilot In Command"],
                    ["departureAd", "Departure A/D"],
                    ["arrivalAd", "Arrival A/D"],
                    ["clearanceDest", "Clearance Destination"],
                    ["clearanceVia", "Clearance Via"],
                    ["clearanceClimb", "Climb Initially"],
                    ["clearanceSquawk", "Squawk"],
                  ] as const
                ).map(([k, lbl]) => (
                  <label key={k} className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      {lbl}
                    </span>
                    <input
                      type="text"
                      value={comms[k]}
                      onChange={(e) => updateComms({ [k]: e.target.value })}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-base font-bold md:text-xs"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-4 lg:grid-cols-8">
                {(
                  [
                    ["directorFreq", "Director Freq"],
                    ["metWind", "Wind"],
                    ["metVis", "Visibility"],
                    ["metClouds", "Clouds"],
                    ["metTemp", "Temp."],
                    ["metDewPoint", "D.Point"],
                    ["metQnh", "QNH"],
                    ["metActiveRwy", "Active RWY"],
                  ] as const
                ).map(([k, lbl]) => (
                  <label key={k} className="block">
                    <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                      {lbl}
                    </span>
                    <input
                      type="text"
                      value={comms[k]}
                      onChange={(e) => updateComms({ [k]: e.target.value })}
                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-base font-bold md:text-xs"
                    />
                  </label>
                ))}
              </div>

              {/* Side-by-Side Editable Comm & Nav Tables */}
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between bg-[#1B365D] px-3 py-2 text-xs font-extrabold text-white">
                    <span>Communication Frequencies</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateComms({
                          commFreqList: [
                            ...comms.commFreqList,
                            {
                              id: `cm-${Date.now()}`,
                              label: "NEW Tower",
                              freq: "118.000",
                              highlight: false,
                            },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 rounded bg-white/15 px-2 py-0.5 text-[10px] hover:bg-white/25"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {comms.commFreqList.map((row, idx) => (
                      <div
                        key={row.id}
                        className={`flex items-center gap-2 px-2.5 py-1.5 ${
                          row.highlight ? "bg-blue-50/70" : "bg-white"
                        }`}
                      >
                        <input
                          type="text"
                          value={row.label}
                          onChange={(e) => {
                            const next = comms.commFreqList.map((r, i) =>
                              i === idx ? { ...r, label: e.target.value } : r
                            );
                            updateComms({ commFreqList: next });
                          }}
                          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-0.5 text-base font-bold text-[#1B365D] md:text-xs"
                        />
                        <input
                          type="text"
                          value={row.freq}
                          onChange={(e) => {
                            const next = comms.commFreqList.map((r, i) =>
                              i === idx ? { ...r, freq: e.target.value } : r
                            );
                            updateComms({ commFreqList: next });
                          }}
                          className="w-24 rounded border border-slate-200 px-2 py-0.5 text-right font-mono text-base font-extrabold md:text-xs"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateComms({
                              commFreqList: comms.commFreqList.filter((_, i) => i !== idx),
                            })
                          }
                          className="text-slate-400 hover:text-[#C00000]"
                          title="Delete frequency row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between bg-[#1B365D] px-3 py-2 text-xs font-extrabold text-white">
                    <span>Navigation Frequencies (NDB / VOR)</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateComms({
                          navFreqList: [
                            ...comms.navFreqList,
                            {
                              id: `nv-${Date.now()}`,
                              label: "NEW VOR",
                              freq: "114.0",
                              highlight: false,
                            },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 rounded bg-white/15 px-2 py-0.5 text-[10px] hover:bg-white/25"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {comms.navFreqList.map((row, idx) => (
                      <div
                        key={row.id}
                        className={`flex items-center gap-2 px-2.5 py-1.5 ${
                          row.highlight ? "bg-blue-50/70" : "bg-white"
                        }`}
                      >
                        <input
                          type="text"
                          value={row.label}
                          onChange={(e) => {
                            const next = comms.navFreqList.map((r, i) =>
                              i === idx ? { ...r, label: e.target.value } : r
                            );
                            updateComms({ navFreqList: next });
                          }}
                          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-0.5 text-base font-bold text-[#1B365D] md:text-xs"
                        />
                        <input
                          type="text"
                          value={row.freq}
                          onChange={(e) => {
                            const next = comms.navFreqList.map((r, i) =>
                              i === idx ? { ...r, freq: e.target.value } : r
                            );
                            updateComms({ navFreqList: next });
                          }}
                          className="w-24 rounded border border-slate-200 px-2 py-0.5 text-right font-mono text-base font-extrabold md:text-xs"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateComms({
                              navFreqList: comms.navFreqList.filter((_, i) => i !== idx),
                            })
                          }
                          className="text-slate-400 hover:text-[#C00000]"
                          title="Delete navaid row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed 5-Airport Editable VOR / ILS / Runways / Elevation Matrix */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                    Detailed 5-Airport AIP Reference (HEAT · HELX · HESG · HEKG · HESH)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    All fields editable — printed on Page 2 when enabled above.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const custom: AirportCommsEntry = {
                      id: `ap-${Date.now()}`,
                      icao: "HE__",
                      iata: "---",
                      name: "Custom Airport",
                      elevationFt: 200,
                      lat: 27.0,
                      lon: 31.0,
                      coordsDms: "27°00.0'N 031°00.0'E",
                      magVarDeg: 4,
                      runways: "01/19",
                      vorIdent: "VOR",
                      vorFreq: "114.00 MHz",
                      vorNote: "",
                      ilsInfo: "",
                      atis: "NIL",
                      ground: "121.900",
                      tower: "118.000",
                      approach: "",
                      notes: "",
                    };
                    updateComms({ airports: [...comms.airports, custom] });
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#1B365D] hover:bg-blue-100"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Airport
                </button>
              </div>

              <div className="space-y-3">
                {comms.airports.map((ap, idx) => (
                  <div
                    key={ap.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={ap.icao}
                          onChange={(e) => {
                            const next = comms.airports.map((a, i) =>
                              i === idx ? { ...a, icao: e.target.value.toUpperCase() } : a
                            );
                            updateComms({ airports: next });
                          }}
                          className="w-20 rounded border border-slate-300 bg-[#1B365D] px-2 py-0.5 text-center font-mono text-sm font-extrabold uppercase text-white"
                        />
                        <input
                          type="text"
                          value={ap.name}
                          onChange={(e) => {
                            const next = comms.airports.map((a, i) =>
                              i === idx ? { ...a, name: e.target.value } : a
                            );
                            updateComms({ airports: next });
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-base font-extrabold text-slate-900 md:text-xs"
                        />
                      </div>
                      {comms.airports.length > 5 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateComms({
                              airports: comms.airports.filter((_, i) => i !== idx),
                            })
                          }
                          className="text-slate-400 hover:text-[#C00000]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                      {(
                        [
                          ["tower", "Tower"],
                          ["approach", "Approach / Radar"],
                          ["ground", "Ground"],
                          ["atis", "ATIS"],
                          ["vorIdent", "VOR Ident"],
                          ["vorFreq", "VOR Freq"],
                          ["ilsInfo", "ILS / LOC / Proc"],
                          ["runways", "Runways"],
                        ] as const
                      ).map(([field, lbl]) => (
                        <label key={field} className="block">
                          <span className="block text-[9px] font-extrabold uppercase text-slate-500">
                            {lbl}
                          </span>
                          <input
                            type="text"
                            value={ap[field]}
                            onChange={(e) => {
                              const next = comms.airports.map((a, i) =>
                                i === idx ? { ...a, [field]: e.target.value } : a
                              );
                              updateComms({ airports: next });
                            }}
                            className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-base font-semibold md:text-[11px]"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Extra Useful Tools & Aviation Reference */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* Direct Navigation Legs from HEAT */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-6">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                    <Navigation className="h-4 w-4" />
                    Direct Navigation Legs (Great Circle)
                  </div>
                  <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
                    <span>GS:</span>
                    <input
                      type="number"
                      min={50}
                      max={200}
                      value={navGsKt}
                      onChange={(e) => setNavGsKt(Number(e.target.value) || 100)}
                      className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-center font-mono font-bold"
                    />
                    <span>kt</span>
                  </label>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="px-2.5 py-1.5 text-left">Route</th>
                        <th className="px-2 py-1.5 text-center">Dist NM</th>
                        <th className="px-2 py-1.5 text-center">Mag Trk</th>
                        <th className="px-2 py-1.5 text-center">Return</th>
                        <th className="px-2 py-1.5 text-center">ETE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {navLegs.map((leg) => (
                        <tr key={leg.pair} className="hover:bg-slate-50">
                          <td className="px-2.5 py-1.5 font-sans font-bold text-[#1B365D]">
                            {leg.pair}
                          </td>
                          <td className="px-2 py-1.5 text-center font-bold">{leg.distanceNm} NM</td>
                          <td className="px-2 py-1.5 text-center">{formatDeg3(leg.magTrackDeg)}°M</td>
                          <td className="px-2 py-1.5 text-center text-slate-500">
                            {formatDeg3(leg.revMagTrackDeg)}°M
                          </td>
                          <td className="px-2 py-1.5 text-center font-bold text-emerald-700">
                            {leg.eteStr}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Interactive Crosswind & Density Altitude Calculators */}
              <div className="space-y-4 lg:col-span-6">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                    <Wind className="h-4 w-4" /> Runway Crosswind / Headwind Calculator
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="block text-[10px] font-bold text-slate-500">Airport RWY</span>
                      <select
                        value={xwindRwyDeg}
                        onChange={(e) => setXwindRwyDeg(Number(e.target.value))}
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-base font-bold md:text-xs"
                      >
                        <option value={130}>HEAT RWY 13 (130°)</option>
                        <option value={310}>HEAT RWY 31 (310°)</option>
                        <option value={20}>HELX RWY 02 (020°)</option>
                        <option value={200}>HELX RWY 20 (200°)</option>
                        <option value={150}>HESG RWY 15 (150°)</option>
                        <option value={330}>HESG RWY 33 (330°)</option>
                        <option value={180}>HEKG RWY 18 (180°)</option>
                        <option value={360}>HEKG RWY 36 (360°)</option>
                        <option value={40}>HESH RWY 04 (040°)</option>
                        <option value={220}>HESH RWY 22 (220°)</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-slate-500">Wind Dir (°M)</span>
                      <input
                        type="number"
                        min={0}
                        max={360}
                        value={xwindDir}
                        onChange={(e) => setXwindDir(Number(e.target.value) || 0)}
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-center font-mono text-base font-bold md:text-xs"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-slate-500">Speed / Gust kt</span>
                      <input
                        type="number"
                        min={0}
                        value={xwindSpd}
                        onChange={(e) => setXwindSpd(Number(e.target.value) || 0)}
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-center font-mono text-base font-bold md:text-xs"
                      />
                    </label>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs font-extrabold">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-800">
                      {xwindComponents.headKt >= 0
                        ? `Headwind: ${xwindComponents.headKt} kt`
                        : `TAILWIND: ${Math.abs(xwindComponents.headKt)} kt`}
                    </span>
                    <span
                      className={`rounded-lg px-2.5 py-1 ${
                        xwindComponents.crossKt > 15
                          ? "bg-red-100 text-[#C00000]"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      Crosswind: {xwindComponents.crossKt} kt (C172 Demo Max: 15 kt)
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                    <Gauge className="h-4 w-4" /> Pressure &amp; Density Altitude Calculator
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="block text-[10px] font-bold text-slate-500">Field Elev (ft)</span>
                      <select
                        value={daElevFt}
                        onChange={(e) => setDaElevFt(Number(e.target.value))}
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-base font-bold md:text-xs"
                      >
                        <option value={772}>HEAT Assiut (772 ft)</option>
                        <option value={294}>HELX Luxor (294 ft)</option>
                        <option value={859}>HESG Sohag (859 ft)</option>
                        <option value={192}>HEKG Kharga (192 ft)</option>
                        <option value={143}>HESH Sharm (143 ft)</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-slate-500">OAT (°C)</span>
                      <input
                        type="number"
                        value={daOatC}
                        onChange={(e) => setDaOatC(Number(e.target.value) || 0)}
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-center font-mono text-base font-bold md:text-xs"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-slate-500">QNH (hPa)</span>
                      <input
                        type="number"
                        value={daQnhHpa}
                        onChange={(e) => setDaQnhHpa(Number(e.target.value) || 1013)}
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-center font-mono text-base font-bold md:text-xs"
                      />
                    </label>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs font-extrabold">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-800">
                      PA: {daCalc.paFt.toLocaleString()} ft
                    </span>
                    <span
                      className={`rounded-lg px-2.5 py-1 ${
                        daCalc.daFt >= 3000
                          ? "bg-amber-100 text-amber-900"
                          : "bg-blue-100 text-[#1B365D]"
                      }`}
                    >
                      Density Altitude: {daCalc.daFt.toLocaleString()} ft (ISA {daCalc.isaTempC}°C)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* C172R Quick V-Speeds + Squawk Codes + ATC Light Gun Signals */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                  <Compass className="h-4 w-4" /> C172R Quick Specs &amp; Egypt SOPs
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {C172_QUICK_REF.map((item) => (
                    <div key={item.label} className="flex justify-between gap-2 py-1">
                      <span className="font-semibold text-slate-600">{item.label}</span>
                      <span className="text-right font-mono font-bold text-slate-900">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                  <Radio className="h-4 w-4" /> Cairo ACC En-Route &amp; Squawks
                </div>
                <div className="space-y-1.5 text-xs">
                  {comms.enroute.map((er) => (
                    <div key={er.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <div className="font-extrabold text-[#1B365D]">
                        {er.unit} · {er.sector}
                      </div>
                      <div className="font-mono text-[11px] font-bold text-slate-800">
                        Pri: {er.primaryFreq} | Sec: {er.secondaryFreq}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  {SQUAWK_CODES.map((sq) => (
                    <div key={sq.label} className="flex items-center gap-2">
                      <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono font-extrabold text-[#C00000]">
                        {sq.label}
                      </span>
                      <span className="font-semibold text-slate-700">{sq.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                  ATC Light Gun Signals (Lost Comms)
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {ATC_LIGHT_SIGNALS.map((ls) => (
                    <div key={ls.color} className="py-1.5">
                      <div className="font-extrabold text-[#1B365D]">{ls.color}</div>
                      <div className="text-[11px] text-slate-700">
                        <strong>Gnd:</strong> {ls.ground} · <strong>Air:</strong> {ls.air}
                      </div>
                    </div>
                  ))}
                </div>
                <label className="mt-3 block">
                  <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                    Editable Extra Field Notes
                  </span>
                  <textarea
                    rows={4}
                    value={comms.extraNotes}
                    onChange={(e) => updateComms({ extraNotes: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-base font-medium md:text-[11px]"
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* BROWSER PRINT VIEWS (rendered cleanly only for activePrintTarget)  */}
      {/* ================================================================== */}
      {activePrintTarget === "release" && (
        <div
          className="hidden print:block bg-white text-slate-900"
          style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}
        >
          <div className="border-2 border-slate-900 p-2.5 text-[7.5pt]">
            <div className="grid grid-cols-3 items-center border-b border-slate-900 pb-2">
              <div className="text-center">
                <img src="/mfc-logo.png" alt="MFC" className="mx-auto h-9 object-contain" />
                <div className="text-[6pt] font-bold text-[#1B365D]">
                  EGYPTIAN AVIATION ACADEMY · Misr Flying College
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10pt] font-extrabold">{fr.aircraftModel}</div>
                <div className="text-[11pt] font-extrabold">FLIGHT RELEASE</div>
                <div className="font-mono text-[10.5pt] font-extrabold text-[#1B365D]">
                  {fr.aircraftReg}
                </div>
              </div>
              <div className="text-center font-extrabold">
                <div className="text-[9.5pt]">MFC</div>
                <div>OPERATIONS DEPT.</div>
                <div>FLIGHT OPERATION</div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-12 border border-slate-900">
              <div className="col-span-5 flex items-center justify-center border-r border-slate-900 p-1.5 text-center font-extrabold">
                NAME AND DESIGNATION OF EACH FLIGHT CREWMEMBER
              </div>
              <div className="col-span-7 divide-y divide-slate-900">
                <div className="grid grid-cols-3 divide-x divide-slate-900 p-1 font-bold">
                  <span>DATE: {fr.date}</span>
                  <span>LESSON: {fr.lessonNo}</span>
                  <span>FLT: {fr.fltCategory}</span>
                </div>
                <div className="grid grid-cols-3 divide-x divide-slate-900 p-1 font-bold">
                  <span>UTC: {fr.utcTime}</span>
                  <span>
                    {fr.isDual ? "[X]" : "[ ]"} DUAL &nbsp; {fr.isSolo ? "[X]" : "[ ]"} SOLO
                  </span>
                  <span>
                    {fr.isNight ? "[X]" : "[ ]"} NT {fr.isIfr ? "[X]" : "[ ]"} IFR{" "}
                    {fr.isVfr ? "[X]" : "[ ]"} VFR
                  </span>
                </div>
              </div>
            </div>

            <table className="mt-1 w-full border-collapse border border-slate-900 text-[7.2pt]">
              <tbody>
                {fr.crew.map((r, i) => (
                  <tr key={i} className="border-b border-slate-900">
                    <td className="w-[42%] border-r border-slate-900 px-1.5 py-1 font-bold">
                      NAME: {r.name}
                    </td>
                    <td className="w-[10%] border-r border-slate-900 px-1 py-1 text-center">
                      ({r.designation || " , "})*
                    </td>
                    <td className="w-[26%] border-r border-slate-900 px-1.5 py-1">
                      LICENCE No: {r.licenceNo}
                    </td>
                    <td className="w-[22%] px-1.5 py-1">EXP. DATE: {r.expDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-1 grid grid-cols-12 border border-slate-900">
              <div className="col-span-4 grid grid-cols-3 divide-x divide-slate-900 border-r border-slate-900 text-center font-extrabold">
                <div className="p-1">
                  <div>DEP.AD</div>
                  <div className="mt-2 font-mono text-[9pt] text-[#1B365D]">{fr.depAd}</div>
                </div>
                <div className="p-1">
                  <div>ARR.AD</div>
                  <div className="mt-2 font-mono text-[9pt] text-[#1B365D]">{fr.arrAd}</div>
                </div>
                <div className="p-1">
                  <div>ALT.AD</div>
                  <div className="mt-2 font-mono text-[9pt] text-[#1B365D]">{fr.altAd}</div>
                </div>
              </div>
              <div className="col-span-8">
                <div className="border-b border-slate-900 bg-slate-100 py-0.5 text-center font-extrabold">
                  WX CONDITIONS
                </div>
                <div className="grid grid-cols-2 divide-x divide-y divide-slate-900 text-[7pt] font-bold">
                  <div className="p-1">WIND: {fr.wxWind}</div>
                  <div className="p-1">RWY: {fr.wxRwy}</div>
                  <div className="p-1">TEMP: {fr.wxTemp}</div>
                  <div className="p-1">DP: {fr.wxDp}</div>
                  <div className="p-1">QNH: {fr.wxQnh}</div>
                  <div className="p-1">VIS: {fr.wxVis}</div>
                </div>
              </div>
            </div>

            <div className="mt-1 border border-slate-900 text-[7pt]">
              <div className="border-b border-slate-900 bg-slate-100 py-0.5 text-center font-extrabold">
                DOCUMENTS
              </div>
              <div className="divide-y divide-slate-900">
                <div className="px-1.5 py-0.5">
                  <strong>NOTAM:</strong> {fr.notam}
                </div>
                <div className="px-1.5 py-0.5">
                  <strong>TAF:</strong> {fr.taf}
                </div>
                <div className="px-1.5 py-0.5">
                  <strong>METAR:</strong> {fr.metar}
                </div>
              </div>
            </div>

            <div className="mt-1 border border-slate-900">
              <div className="border-b border-slate-900 bg-slate-100 py-1 text-center text-[8pt] font-extrabold text-[#1B365D]">
                WEIGHT AND BALANCE FOR C172R
              </div>
              <table className="w-full border-collapse text-[7.2pt]">
                <thead>
                  <tr className="border-b border-slate-900 font-bold">
                    <th className="w-[46%] border-r border-slate-900 p-1 text-left">
                      ITEM DESCRIPTION
                    </th>
                    <th className="w-[13%] border-r border-slate-900 p-1 text-center">Sample lb</th>
                    <th className="w-[14%] border-r border-slate-900 p-1 text-center">
                      Sample Mom
                    </th>
                    <th className="w-[13%] border-r border-slate-900 p-1 text-center">Your lb</th>
                    <th className="w-[14%] p-1 text-center">Your Mom</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  <tr>
                    <td className="border-r border-slate-900 p-1">
                      1- Basic Empty Weight{" "}
                      <span className="text-[6pt] text-slate-600">
                        (Arm: {wb.bewArmIn.toFixed(3)}&quot; · Weighed: {fr.weighingDate || "-"} ·
                        Due: {fr.weighingDueDate || "-"})
                      </span>
                    </td>
                    <td className="border-r border-slate-900 p-1 text-center">1639</td>
                    <td className="border-r border-slate-900 p-1 text-center">64.4</td>
                    <td className="border-r border-slate-900 p-1 text-center font-bold">
                      {String(wb.bewLb)}
                    </td>
                    <td className="p-1 text-center font-bold">{wb.bewMom.toFixed(1)}</td>
                  </tr>
                  <tr>
                    <td className="border-r border-slate-900 p-1">
                      2- Usable Fuel ({wb.fuelGal} Gal @ 6 lb/gal)
                    </td>
                    <td className="border-r border-slate-900 p-1 text-center">210</td>
                    <td className="border-r border-slate-900 p-1 text-center">10.1</td>
                    <td className="border-r border-slate-900 p-1 text-center font-bold">
                      {wb.fuelLb.toFixed(0)}
                    </td>
                    <td className="p-1 text-center font-bold">{wb.fuelMom.toFixed(1)}</td>
                  </tr>
                  <tr>
                    <td className="border-r border-slate-900 p-1">3- Pilot &amp; Front Pax (FS 34-46)</td>
                    <td className="border-r border-slate-900 p-1 text-center">340</td>
                    <td className="border-r border-slate-900 p-1 text-center">12.6</td>
                    <td className="border-r border-slate-900 p-1 text-center font-bold">
                      {wb.frontPaxLb.toFixed(0)}
                    </td>
                    <td className="p-1 text-center font-bold">{wb.frontPaxMom.toFixed(1)}</td>
                  </tr>
                  <tr>
                    <td className="border-r border-slate-900 p-1">4- Rear Passenger (FS 73)</td>
                    <td className="border-r border-slate-900 p-1 text-center">220</td>
                    <td className="border-r border-slate-900 p-1 text-center">16.0</td>
                    <td className="border-r border-slate-900 p-1 text-center font-bold">
                      {wb.rearPaxLb.toFixed(0)}
                    </td>
                    <td className="p-1 text-center font-bold">{wb.rearPaxMom.toFixed(1)}</td>
                  </tr>
                  <tr>
                    <td className="border-r border-slate-900 p-1">5- Baggage A (FS 82-108, max 120 lb)</td>
                    <td className="border-r border-slate-900 p-1 text-center">48</td>
                    <td className="border-r border-slate-900 p-1 text-center">4.6</td>
                    <td className="border-r border-slate-900 p-1 text-center font-bold">
                      {wb.bagALb.toFixed(0)}
                    </td>
                    <td className="p-1 text-center font-bold">{wb.bagAMom.toFixed(1)}</td>
                  </tr>
                  <tr>
                    <td className="border-r border-slate-900 p-1">6- Baggage B (FS 108-142, max 50 lb)</td>
                    <td className="border-r border-slate-900 p-1 text-center">-</td>
                    <td className="border-r border-slate-900 p-1 text-center">-</td>
                    <td className="border-r border-slate-900 p-1 text-center font-bold">
                      {wb.bagBLb.toFixed(0)}
                    </td>
                    <td className="p-1 text-center font-bold">{wb.bagBMom.toFixed(1)}</td>
                  </tr>
                  <tr className="bg-slate-50 font-extrabold">
                    <td className="border-r border-slate-900 p-1">7- RAMP WEIGHT AND MOMENT</td>
                    <td className="border-r border-slate-900 p-1 text-center">2457</td>
                    <td className="border-r border-slate-900 p-1 text-center">107.7</td>
                    <td className="border-r border-slate-900 p-1 text-center">
                      {wb.rampLb.toFixed(1)}
                    </td>
                    <td className="p-1 text-center">{wb.rampMom.toFixed(1)}</td>
                  </tr>
                  <tr>
                    <td className="border-r border-slate-900 p-1">8- Start, Taxi &amp; Run-Up Fuel</td>
                    <td className="border-r border-slate-900 p-1 text-center">-7.0</td>
                    <td className="border-r border-slate-900 p-1 text-center">-0.3</td>
                    <td className="border-r border-slate-900 p-1 text-center">
                      {wb.taxiLb.toFixed(1)}
                    </td>
                    <td className="p-1 text-center">{wb.taxiMom.toFixed(1)}</td>
                  </tr>
                  <tr className="bg-blue-50 font-extrabold">
                    <td className="border-r border-slate-900 p-1">
                      9- TAKEOFF WEIGHT &amp; MOMENT ({wb.category} · CG {wb.towCgArmIn}&quot; · END{" "}
                      {wb.enduranceStr})
                    </td>
                    <td className="border-r border-slate-900 p-1 text-center">2450</td>
                    <td className="border-r border-slate-900 p-1 text-center">107.4</td>
                    <td className="border-r border-slate-900 p-1 text-center">
                      {wb.towLb.toFixed(1)}
                    </td>
                    <td className="p-1 text-center">{wb.towMom.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-2 grid grid-cols-3 border border-slate-900 py-3 text-center text-[7pt] font-bold">
              <div>
                <div>({fr.opsSupervisor || "              "})</div>
                <div className="mt-3">FLIGHT OPERATION SUPERVISOR</div>
              </div>
              <div>
                <div>({fr.cfiName || "              "})</div>
                <div className="mt-3">CERTIFIED FLIGHT INSTRUCTOR</div>
              </div>
              <div>
                <div>({fr.picName || "              "})</div>
                <div className="mt-3">PILOT IN COMMAND</div>
              </div>
            </div>
          </div>
          <div className="mt-1 text-center text-[6pt] text-slate-600">
            {C172_CREW_DESIGNATION_LEGEND}
          </div>
          <div className="mt-1 flex justify-between text-[6.5pt] font-bold">
            <span>Issue No: {fr.issueNo}</span>
            <span>Issue date: {fr.issueDate}</span>
            <span>Revision No: {fr.revisionNo}</span>
            <span>Revision date: {fr.revisionDate}</span>
          </div>

          {fr.includeWbCharts && (
            <div className="mt-4 break-before-page">
              <div className="mb-2 flex justify-between text-[7.5pt] font-extrabold text-slate-900">
                <div>
                  <div>SECTION 6</div>
                  <div>WEIGHT &amp; BALANCE / EQUIPMENT LIST</div>
                </div>
                <div className="text-right">
                  <div>CESSNA</div>
                  <div>MODEL 172R</div>
                </div>
              </div>
              <div className="grid grid-cols-2 items-start gap-3">
                <div>
                  <C172RLoadingGraphSvg wb={wb} />
                  <p className="mt-1 text-[5.5pt] leading-tight text-slate-700">
                    NOTE: LINE REPRESENTING ADJUSTABLE SEATS SHOWS THE PILOT OR PASSENGER CENTER OF
                    GRAVITY ON ADJUSTABLE SEATS POSITIONED FOR AN AVERAGE OCCUPANT.
                  </p>
                </div>
                <div>
                  <C172RCgEnvelopeSvg wb={wb} />
                </div>
              </div>
              <div className="mt-2 border border-[#1B365D] bg-slate-50 px-2 py-1.5 text-center text-[7pt] font-extrabold text-[#1B365D]">
                {fr.aircraftReg} — Ramp: {wb.rampLb.toFixed(1)} lb ({wb.rampMom.toFixed(1)}) ·
                Takeoff: {wb.towLb.toFixed(1)} lb ({wb.towMom.toFixed(1)}) · CG Arm:{" "}
                {wb.towCgArmIn}&quot; · Status: {wb.category}
              </div>
            </div>
          )}
        </div>
      )}

      {activePrintTarget === "fpl" && (
        <div
          className="hidden print:block bg-white text-slate-900"
          style={{ fontFamily: "'Segoe UI', 'Tahoma', Arial, sans-serif" }}
        >
          {/* Top 3-Column EN / Logo / AR Header */}
          <div className="grid grid-cols-3 items-end gap-2 pb-1.5">
            <div className="text-center text-[6.5pt] leading-tight">
              <div>Arab Republic of Egypt</div>
              <div>Ministry of Civil Aviation</div>
              <div>National Air Navigation services Company</div>
              <div className="mt-2 flex items-end gap-1">
                <span className="relative flex-1 border-b border-dashed border-slate-700 text-center font-bold text-[#1B365D]">
                  {fpl.aerodrome || "\u00A0"}
                </span>
                <span>Aerodrome</span>
              </div>
            </div>
            <div className="text-center">
              <img src="/mfc-logo.png" alt="MFC" className="mx-auto h-9 object-contain" />
              <div className="text-[6.5pt] font-extrabold text-[#1B365D]">
                EGYPTIAN AVIATION ACADEMY
              </div>
              <div className="text-[6pt]">Misr Flying College</div>
            </div>
            <div className="text-right text-[7pt] leading-tight" dir="rtl">
              <div>جمهورية مصر العربية</div>
              <div className="font-bold">وزارة الطيران المدني</div>
              <div>الشركة الوطنية لخدمات الملاحة الجوية</div>
              <div className="mt-2 flex items-end gap-1">
                <span className="font-bold">مطار</span>
                <span
                  className="flex-1 border-b border-dashed border-slate-700 text-center font-bold text-[#1B365D]"
                  dir="ltr"
                >
                  {fpl.aerodrome || "\u00A0"}
                </span>
              </div>
            </div>
          </div>

          {/* Outer Official Paper Frame */}
          <div className="border border-slate-900 text-[6.3pt] leading-tight">
            <div className="border-b border-slate-900 py-1 text-center text-[11.5pt] font-extrabold">
              International Flight Plan
            </div>

            {/* AFTN Header */}
            <div className="p-2 space-y-1.5 border-b border-slate-900">
              <div className="flex items-start gap-3">
                <div className="w-[14%]">
                  <div className="text-[6pt]">PRIORITY</div>
                  <div className="mt-1 font-mono text-[10pt] font-extrabold">
                    &lt;=<span className="text-[#1B365D]">{fpl.priority || "FF"}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[6pt]">ADDRESSEE(S)</div>
                  <div className="mt-0.5 border-b border-slate-900 font-mono text-[8pt] font-bold text-[#1B365D]">
                    {fpl.addressees || "\u00A0"}
                  </div>
                  <div className="h-[4.5mm] border-b border-slate-900" />
                  <div className="flex items-end justify-between">
                    <div className="h-[4.5mm] flex-1 border-b border-slate-900" />
                    <span className="pl-2 font-mono text-[9pt] font-extrabold">&lt;=</span>
                  </div>
                </div>
              </div>

              <div className="flex items-end gap-3">
                <div>
                  <div className="text-[6pt]">FILING TIME</div>
                  <PrintComb cells={6} value={fpl.filingTimeUtc} className="w-[28mm]" />
                </div>
                <div>
                  <div className="text-[6pt]">ORIGINATOR</div>
                  <PrintComb cells={8} value={fpl.originator} className="w-[36mm]" />
                </div>
                <span className="font-mono text-[9pt] font-extrabold">&lt;=</span>
              </div>

              <div className="pt-0.5 text-[6pt]">
                SPECIFIC IDENTIFICATION OF ADDRESSEE(S) AND / OR ORIGINATOR{" "}
                {fpl.specificId && (
                  <span className="ml-2 font-mono font-bold text-[#1B365D]">{fpl.specificId}</span>
                )}
              </div>
            </div>

            {/* Body Items 3..18 */}
            <div className="p-2 space-y-1.5 border-b-2 border-double border-slate-900">
              {/* Items 3, 7, 8 */}
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-[6pt]">3 MESSAGE TYPE</div>
                  <div className="font-mono text-[9.5pt] font-extrabold">
                    &lt;=({fpl.item3MsgType || "FPL"}
                  </div>
                </div>
                <div>
                  <div className="text-[6pt]">7 AIRCRAFT IDENTIFICATION</div>
                  <div className="flex items-end gap-1">
                    <span className="font-bold">-</span>
                    <PrintComb cells={7} value={fpl.item7AircraftId} className="w-[36mm]" />
                  </div>
                </div>
                <div>
                  <div className="text-[6pt]">8 FLIGHT RULES</div>
                  <div className="flex items-end gap-1">
                    <span className="font-bold">-</span>
                    <PrintComb cells={1} value={fpl.item8FlightRules} className="w-[6mm]" />
                  </div>
                </div>
                <div>
                  <div className="text-[6pt]">TYPE OF FLIGHT</div>
                  <PrintComb cells={1} value={fpl.item8FlightType} className="w-[6mm]" />
                </div>
                <span className="font-mono text-[9pt] font-extrabold">&lt;=</span>
              </div>

              {/* Items 9, 10 */}
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-[6pt]">9 NUMBER</div>
                  <div className="flex items-end gap-1">
                    <span className="font-bold">-</span>
                    <PrintComb cells={2} value={fpl.item9Number || "1"} className="w-[11mm]" />
                  </div>
                </div>
                <div>
                  <div className="text-[6pt]">TYPE OF AIRCRAFT</div>
                  <div className="flex items-end gap-1">
                    <span className="font-bold">-</span>
                    <PrintComb cells={4} value={fpl.item9AircraftType} className="w-[21mm]" />
                  </div>
                </div>
                <div>
                  <div className="text-[6pt]">WAKE TURBULENCE CAT.</div>
                  <div className="flex items-end gap-1">
                    <span className="font-bold">/</span>
                    <PrintComb cells={1} value={fpl.item9WakeCat} className="w-[6mm]" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[6pt]">10 EQUIPMENT</div>
                  <div className="flex items-center border border-slate-900 px-2 h-[5.2mm] font-mono text-[8.5pt] font-bold text-[#1B365D]">
                    <span className="flex-1 text-right pr-1">{fpl.item10Equipment}</span>
                    <span className="text-slate-900">/</span>
                    <span className="w-8 pl-1">{fpl.item10Surveillance}</span>
                  </div>
                </div>
                <span className="font-mono text-[9pt] font-extrabold">&lt;=</span>
              </div>

              {/* Item 13 */}
              <div className="flex items-end gap-4">
                <div>
                  <div className="text-[6pt]">13 DEPARTURE AERODROME</div>
                  <div className="flex items-end gap-1">
                    <span className="font-bold">-</span>
                    <PrintComb cells={4} value={fpl.item13DepIcao} className="w-[24mm]" />
                  </div>
                </div>
                <div>
                  <div className="text-[6pt]">TIME</div>
                  <PrintComb cells={4} value={fpl.item13EobtUtc} className="w-[24mm]" />
                </div>
                <span className="font-mono text-[9pt] font-extrabold">&lt;=</span>
              </div>

              {/* Item 15 */}
              <div className="space-y-1">
                <div className="flex items-end gap-2">
                  <div>
                    <div className="text-[6pt]">15 CRUISING SPEED</div>
                    <div className="flex items-end gap-1">
                      <span className="font-bold">-</span>
                      <PrintComb cells={5} value={fpl.item15Speed} className="w-[24mm]" />
                    </div>
                  </div>
                  <div>
                    <div className="text-[6pt]">LEVEL</div>
                    <PrintComb cells={5} value={fpl.item15Level} className="w-[24mm]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[6pt]">ROUTE</div>
                    <div className="border border-slate-900 px-1.5 h-[5.2mm] flex items-center font-mono text-[8pt] font-bold text-[#1B365D]">
                      {fpl.item15Route}
                    </div>
                  </div>
                </div>
                <div className="h-[4.2mm] border-b border-slate-900" />
                <div className="h-[4.2mm] border-b border-slate-900" />
                <div className="flex items-end justify-between">
                  <div className="h-[4.2mm] flex-1 border-b border-slate-900" />
                  <span className="pl-2 font-mono text-[9pt] font-extrabold">&lt;=</span>
                </div>
              </div>

              {/* Item 16 */}
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-[6pt]">16 DESTINATION AERODROME</div>
                  <div className="flex items-end gap-1">
                    <span className="font-bold">-</span>
                    <PrintComb cells={4} value={fpl.item16DestIcao} className="w-[24mm]" />
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[5.5pt] font-bold">TOTAL EET</div>
                  <div className="flex justify-between px-2 text-[5.5pt]">
                    <span>HR</span>
                    <span>MIN</span>
                  </div>
                  <PrintComb
                    cells={4}
                    value={fpl.item16TotalEet}
                    midTallIndex={2}
                    className="w-[24mm]"
                  />
                </div>
                <div>
                  <div className="text-[6pt]">ALTN AERODROME</div>
                  <PrintComb cells={4} value={fpl.item16Altn1} className="w-[24mm]" />
                </div>
                <div>
                  <div className="text-[6pt]">2ND ALTN AERODROME</div>
                  <PrintComb cells={4} value={fpl.item16Altn2} className="w-[24mm]" />
                </div>
                <span className="font-mono text-[9pt] font-extrabold">&lt;=</span>
              </div>

              {/* Item 18 */}
              <div>
                <div className="text-[6pt]">18 OTHER INFORMATION</div>
                <div className="flex items-end gap-1">
                  <span className="font-bold">-</span>
                  <div className="flex-1 border-b border-slate-900 font-mono text-[7.8pt] font-bold text-[#1B365D]">
                    {fpl.item18Other || "\u00A0"}
                  </div>
                </div>
                <div className="h-[4.8mm] border-b border-slate-900" />
                <div className="flex items-end justify-between">
                  <div className="h-[4.8mm] flex-1 border-b border-slate-900" />
                  <span className="pl-2 font-mono text-[9pt] font-extrabold">&lt;=</span>
                </div>
              </div>
            </div>

            {/* Item 19 Supplementary Info */}
            <div className="p-2 space-y-2 border-b border-slate-900">
              <div className="text-center text-[6pt] font-extrabold">
                SUPPLEMENTARY INFORMATION (NOT TO BE TRANSMITTED IN FPL MESSAGES)
              </div>

              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-[5.8pt]">19 ENDURANCE (HR / MIN)</div>
                  <div className="flex items-end gap-1">
                    <span className="font-bold">- E/</span>
                    <PrintComb
                      cells={4}
                      value={fpl.item19Endurance}
                      midTallIndex={2}
                      className="w-[24mm]"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-[5.8pt]">PERSONS ON BOARD</div>
                  <div className="flex items-end gap-1">
                    <span className="font-bold">P/</span>
                    <PrintComb cells={3} value={fpl.item19Persons} className="w-[18mm]" />
                  </div>
                </div>
                <div>
                  <div className="text-[5.8pt]">EMERGENCY RADIO (UHF / VHF / ELT)</div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold">R/</span>
                    <PrintCrossBox letter="U" active={fpl.item19RadioU} />
                    <PrintCrossBox letter="V" active={fpl.item19RadioV} />
                    <PrintCrossBox letter="E" active={fpl.item19RadioE} />
                  </div>
                </div>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[5.8pt]">SURVIVAL EQUIPMENT (P / D / M / J)</div>
                  <div className="flex items-center gap-1.5">
                    <PrintCrossBox
                      letter="S"
                      active={
                        fpl.item19SurvP || fpl.item19SurvD || fpl.item19SurvM || fpl.item19SurvJ
                      }
                    />
                    <span className="font-bold">/</span>
                    <PrintCrossBox letter="P" active={fpl.item19SurvP} />
                    <PrintCrossBox letter="D" active={fpl.item19SurvD} />
                    <PrintCrossBox letter="M" active={fpl.item19SurvM} />
                    <PrintCrossBox letter="J" active={fpl.item19SurvJ} />
                  </div>
                </div>
                <div>
                  <div className="text-[5.8pt]">JACKETS (L / F / U / V)</div>
                  <div className="flex items-center gap-1.5">
                    <PrintCrossBox
                      letter="J"
                      active={
                        fpl.item19JacketsL ||
                        fpl.item19JacketsF ||
                        fpl.item19JacketsU ||
                        fpl.item19JacketsV
                      }
                    />
                    <span className="font-bold">/</span>
                    <PrintCrossBox letter="L" active={fpl.item19JacketsL} />
                    <PrintCrossBox letter="F" active={fpl.item19JacketsF} />
                    <PrintCrossBox letter="U" active={fpl.item19JacketsU} />
                    <PrintCrossBox letter="V" active={fpl.item19JacketsV} />
                  </div>
                </div>
              </div>

              <div className="flex items-end gap-2">
                <div>
                  <div className="text-[5.8pt]">DINGHIES (NUMBER / CAPACITY / COVER / COLOR)</div>
                  <div className="flex items-center gap-1.5">
                    <PrintCrossBox
                      letter="D"
                      active={Boolean(
                        fpl.item19DinghiesNum.trim() ||
                          fpl.item19DinghiesCap.trim() ||
                          fpl.item19DinghiesCover ||
                          fpl.item19DinghiesColor.trim()
                      )}
                    />
                    <span className="font-bold">/</span>
                    <PrintComb cells={2} value={fpl.item19DinghiesNum} className="w-[11mm]" />
                    <PrintComb cells={3} value={fpl.item19DinghiesCap} className="w-[16mm]" />
                    <PrintCrossBox letter="C" active={fpl.item19DinghiesCover} />
                    <span className="inline-flex h-[5.2mm] min-w-[44mm] items-center border border-slate-900 px-1.5 font-mono text-[8pt] font-bold text-[#1B365D]">
                      {fpl.item19DinghiesColor}
                    </span>
                    <span className="font-mono text-[9pt] font-extrabold">&lt;=</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[5.8pt]">AIRCRAFT COLOR AND MARKINGS</div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold">A /</span>
                  <div className="flex-1 border border-slate-900 px-1.5 h-[5.2mm] flex items-center font-mono text-[8pt] font-bold text-[#1B365D]">
                    {fpl.item19ColorMarkings}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[5.8pt]">REMARKS</div>
                <div className="flex items-center gap-1.5">
                  <PrintCrossBox letter="N" active={Boolean(fpl.item19Remarks.trim())} />
                  <span className="font-bold">/</span>
                  <div className="flex-1 border border-slate-900 px-1.5 h-[5.2mm] flex items-center font-mono text-[8pt] font-bold text-[#1B365D]">
                    {fpl.item19Remarks}
                  </div>
                  <span className="font-mono text-[9pt] font-extrabold">&lt;=</span>
                </div>
              </div>

              <div>
                <div className="text-[5.8pt]">PILOT-IN-COMMAND</div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold">C /</span>
                  <div className="w-[90mm] border border-slate-900 px-1.5 h-[5.2mm] flex items-center font-mono text-[8pt] font-bold text-[#1B365D]">
                    {fpl.item19Pic}
                  </div>
                  <span className="font-mono text-[9.5pt] font-extrabold">)&lt;=</span>
                </div>
              </div>
            </div>

            {/* Bottom 3-Column Footer */}
            <div className="grid grid-cols-3 divide-x divide-slate-900 text-center">
              <div className="p-1.5">
                <div className="text-[6pt] font-extrabold">FILED BY</div>
                <div className="mt-2 font-mono text-[7.5pt] font-bold text-[#1B365D]">
                  {fpl.filedBy}
                </div>
              </div>
              <div className="p-1.5">
                <div className="text-[6pt] font-extrabold">ACCEPTED BY</div>
                <div className="mt-2 font-mono text-[7.5pt] font-bold text-[#1B365D]">
                  {fpl.acceptedBy}
                </div>
              </div>
              <div className="p-1.5">
                <div className="text-[6pt] font-extrabold">ADDITIONAL INFORMATION</div>
                <div className="mt-2 font-mono text-[7.5pt] font-bold text-[#1B365D]">
                  {fpl.additionalReq}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activePrintTarget === "comms" && (
        <div
          className="hidden print:block bg-white text-slate-900"
          style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}
        >
          <div className="flex items-center justify-between border-b-2 border-[#1B365D] pb-2">
            <div>
              <img src="/mfc-logo.png" alt="MFC" className="h-9 object-contain" />
              <div className="text-[7pt] font-bold text-[#1B365D]">
                EGYPTIAN AVIATION ACADEMY — Misr Flying College
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11pt] font-extrabold">Misr Flying College</div>
              <div className="text-[9.5pt] font-bold">Flying Operation Dept.</div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 border-b border-slate-400 pb-2 text-[8pt] font-bold">
            <div>Aircraft: {comms.aircraftReg}</div>
            <div>PIC: {comms.pilotInCommand}</div>
            <div>Departure: {comms.departureAd}</div>
            <div>Arrival: {comms.arrivalAd}</div>
          </div>
          <div className="mt-2 border border-slate-400 bg-slate-50 p-2 text-[7.5pt]">
            <strong>ATC Clearance:</strong> Cairo control clear for {comms.aircraftReg} to{" "}
            {comms.clearanceDest} Via {comms.clearanceVia} · Climb {comms.clearanceClimb} · Squawk{" "}
            {comms.clearanceSquawk} · Director: {comms.directorFreq}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-4 text-[8pt]">
            <table className="w-full border-collapse border border-slate-400">
              <thead>
                <tr className="bg-[#1B365D] text-white">
                  <th className="p-1 text-left">Communication Frequencies</th>
                  <th className="p-1 text-right">MHz</th>
                </tr>
              </thead>
              <tbody>
                {comms.commFreqList.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-200 ${r.highlight ? "bg-blue-50 font-bold" : ""}`}
                  >
                    <td className="px-2 py-0.5">{r.label}</td>
                    <td className="px-2 py-0.5 text-right font-mono font-bold">{r.freq}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full border-collapse border border-slate-400">
              <thead>
                <tr className="bg-[#1B365D] text-white">
                  <th className="p-1 text-left">Navigation Frequencies</th>
                  <th className="p-1 text-right">MHz / kHz</th>
                </tr>
              </thead>
              <tbody>
                {comms.navFreqList.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-200 ${r.highlight ? "bg-blue-50 font-bold" : ""}`}
                  >
                    <td className="px-2 py-0.5">{r.label}</td>
                    <td className="px-2 py-0.5 text-right font-mono font-bold">{r.freq}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
