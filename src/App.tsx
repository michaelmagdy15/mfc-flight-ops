import React, { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cloud,
  Copy,
  Download,
  Eye,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Lock,
  LogIn,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import {
  createBlankSchedule,
  createNewGroup,
  createSeedState,
} from "./data/seedData";
import { normalizeOpsDocuments } from "./data/opsReferenceData";
import {
  AppState,
  DaySchedule,
  ExportLang,
  ExportStyle,
  GroupData,
  NoShowEntry,
  OpsDocumentsState,
  Student,
  StudentProgram,
} from "./types";
import { autoDraftSchedule } from "./utils/autoDraft";
import {
  checkAuthSession,
  isViewerSessionDismissed,
  logoutAdmin,
  setViewerSessionDismissed,
} from "./utils/auth";
import { exportScheduleToDocx } from "./utils/exportDocx";
import { exportScheduleToPdf } from "./utils/exportPdf";
import { exportScheduleToImage } from "./utils/renderScheduleCanvas";
import { loadInitialState, migrateState, saveCloudState, SyncMode } from "./utils/storage";
import {
  buildWhatsAppBroadcast,
  buildWhatsAppStudentSummary,
} from "./utils/whatsapp";
import { ScheduleBoard } from "./components/ScheduleBoard";
import { RosterManager } from "./components/RosterManager";
import { ReportsDashboard } from "./components/ReportsDashboard";
import { PrintSheet } from "./components/PrintSheet";
import { LoginPage } from "./components/LoginPage";
import { OpsFormsHub } from "./components/OpsFormsHub";

type ActiveTab = "schedule" | "forms" | "roster" | "reports";
type PrintTarget = "schedule" | "release" | "fpl" | "comms";

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((isoDate || "").trim());
  const d = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    : new Date();
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function formatCompactMobileDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((isoDate || "").trim());
  if (!m) return isoDate;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

export function App() {
  const [appState, setAppState] = useState<AppState>(() => createSeedState());
  const [activeDate, setActiveDate] = useState<string>("2026-11-23");
  const [activeTab, setActiveTab] = useState<ActiveTab>("schedule");
  const [exportLang, setExportLang] = useState<ExportLang>("EN");
  const [exportDateOverride, setExportDateOverride] = useState<string | null>(null);
  const [showExportInspection, setShowExportInspection] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("mfc_export_show_insp") !== "false";
    } catch {
      return true;
    }
  });
  const [exportStyle, setExportStyle] = useState<ExportStyle>(() => {
    try {
      return window.localStorage.getItem("mfc_export_style") === "classic" ? "classic" : "modern";
    } catch {
      return "modern";
    }
  });
  const [syncMode, setSyncMode] = useState<SyncMode>("local-only");
  const [hydrated, setHydrated] = useState(false);
  const [savingStatus, setSavingStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);

  // Admin auth + Read-only viewer mode + Operational documents state
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewerDismissed, setViewerDismissed] = useState(() => isViewerSessionDismissed());
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [authToast, setAuthToast] = useState<string | null>(null);
  const [printTarget, setPrintTarget] = useState<PrintTarget>("schedule");
  const [localOpsDocs, setLocalOpsDocs] = useState<OpsDocumentsState>(() =>
    normalizeOpsDocuments(appState.opsDocs)
  );

  useEffect(() => {
    try {
      window.localStorage.setItem("mfc_export_style", exportStyle);
    } catch {
      // Ignore storage errors
    }
  }, [exportStyle]);

  useEffect(() => {
    try {
      window.localStorage.setItem("mfc_export_show_insp", String(showExportInspection));
    } catch {
      // Ignore storage errors
    }
  }, [showExportInspection]);

  // WhatsApp & Mobile slide-up sheets
  const [waOpen, setWaOpen] = useState(false);
  const [waMode, setWaMode] = useState<"dispatch" | "students">("dispatch");
  const [waCopied, setWaCopied] = useState(false);
  const [mobileExportOpen, setMobileExportOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  // New group modal
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [cloneGroup, setCloneGroup] = useState(false);

  const hydratedRef = useRef(false);
  const adminDirtyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const applyAdminState: React.Dispatch<React.SetStateAction<AppState>> = (updater) => {
    if (!isAdmin) return;
    adminDirtyRef.current = true;
    setAppState(updater);
  };

  useEffect(() => {
    let active = true;
    checkAuthSession().then((session) => {
      if (!active) return;
      setIsAdmin(Boolean(session.authenticated));
      setAuthChecked(true);
    });
    loadInitialState().then((res) => {
      if (!active) return;
      setAppState(res.state);
      setLocalOpsDocs(normalizeOpsDocuments(res.state.opsDocs));
      setSyncMode(res.mode);
      const grp =
        res.state.groups.find((g) => g.id === res.state.activeGroupId) || res.state.groups[0];
      if (grp) {
        const dates = Object.keys(grp.schedules).sort();
        if (dates.length > 0 && !grp.schedules["2026-11-23"]) {
          setActiveDate(dates[dates.length - 1]);
        }
      }
      hydratedRef.current = true;
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || !isAdmin || !adminDirtyRef.current) return;
    setSavingStatus("saving");
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      const res = await saveCloudState(appState);
      if (res.unauthorized) {
        setIsAdmin(false);
        adminDirtyRef.current = false;
        setAuthToast("Admin session expired — please sign in again to save changes.");
        setLoginModalOpen(true);
        setSavingStatus("idle");
        return;
      }
      adminDirtyRef.current = false;
      setSyncMode(res.mode);
      setSavingStatus("saved");
    }, 450);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [appState, isAdmin]);

  const setPrintPageCss = (target: PrintTarget) => {
    const ruleId = "mfc-print-page-rule";
    let styleEl = document.getElementById(ruleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = ruleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent =
      target === "release" || target === "fpl"
        ? "@page { size: A4 portrait; margin: 6mm 7mm; }"
        : target === "comms"
        ? "@page { size: A4 portrait; margin: 7mm 8mm; }"
        : "@page { size: A4 landscape; margin: 3.5mm 4mm; }";
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintTarget("schedule");
      setPrintPageCss("schedule");
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const triggerPrint = (target: PrintTarget) => {
    setPrintPageCss(target);
    setPrintTarget(target);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        window.print();
      }, 90);
    });
  };

  const handleLogoutAdmin = async () => {
    await logoutAdmin();
    adminDirtyRef.current = false;
    setIsAdmin(false);
    setViewerSessionDismissed(true);
    setViewerDismissed(true);
  };

  const activeGroup: GroupData =
    appState.groups.find((g) => g.id === appState.activeGroupId) || appState.groups[0];

  const updateActiveGroup = (updater: (grp: GroupData) => GroupData) => {
    applyAdminState((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === activeGroup.id ? updater(g) : g)),
    }));
  };

  const currentSchedule: DaySchedule =
    activeGroup.schedules[activeDate] ?? createBlankSchedule(activeDate, activeGroup);

  const effectiveExportDate = exportDateOverride || activeDate;
  const exportSchedule: DaySchedule =
    effectiveExportDate !== currentSchedule.date
      ? { ...currentSchedule, date: effectiveExportDate }
      : currentSchedule;

  const updateCurrentSchedule = (nextSchedule: DaySchedule) => {
    updateActiveGroup((grp) => ({
      ...grp,
      schedules: {
        ...grp.schedules,
        [activeDate]: nextSchedule,
      },
    }));
  };

  const handleGroupSwitch = (groupId: string) => {
    if (groupId === "__new__") {
      if (!isAdmin) {
        setLoginModalOpen(true);
        return;
      }
      setNewGroupOpen(true);
      return;
    }
    const target = appState.groups.find((g) => g.id === groupId);
    if (!target) return;
    setAppState((prev) => ({ ...prev, activeGroupId: groupId }));
    setExportDateOverride(null);
    const dates = Object.keys(target.schedules).sort();
    if (dates.length > 0) {
      setActiveDate(dates[dates.length - 1]);
    }
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    const created = createNewGroup(trimmed, cloneGroup ? activeGroup : undefined);
    applyAdminState((prev) => ({
      ...prev,
      activeGroupId: created.id,
      groups: [...prev.groups, created],
    }));
    setExportDateOverride(null);
    const dates = Object.keys(created.schedules).sort();
    if (dates.length > 0) setActiveDate(dates[dates.length - 1]);
    setNewGroupName("");
    setNewGroupOpen(false);
  };

  const handleQuickAddStudent = (name: string, program: StudentProgram): Student => {
    const newStudent: Student = {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name,
      program,
      fit: true,
    };
    updateActiveGroup((grp) => ({
      ...grp,
      students: [...grp.students, newStudent],
    }));
    return newStudent;
  };

  const handleRecordNoShow = (entry: NoShowEntry) => {
    updateActiveGroup((grp) => ({
      ...grp,
      noShows: [entry, ...grp.noShows],
    }));
  };

  const handleCopyPreviousDay = () => {
    const sortedDates = Object.keys(activeGroup.schedules)
      .filter((d) => d !== activeDate)
      .sort();
    const prevDates = sortedDates.filter((d) => d < activeDate);
    const sourceKey = prevDates[prevDates.length - 1] || sortedDates[sortedDates.length - 1];
    if (!sourceKey) return;

    const source = activeGroup.schedules[sourceKey];
    const cloned = structuredClone(source);
    cloned.date = activeDate;
    updateCurrentSchedule(cloned);
  };

  const handleAutoDraft = () => {
    const hasSorties = Object.values(currentSchedule.grid).some(
      (slots) => Object.keys(slots || {}).length > 0
    );
    if (
      hasSorties &&
      !confirm("Replace current sorties on this date with an auto-drafted balanced schedule?")
    ) {
      return;
    }
    const drafted = autoDraftSchedule(activeGroup, activeDate, currentSchedule);
    updateCurrentSchedule(drafted);
  };

  const handleClearDay = () => {
    updateCurrentSchedule(createBlankSchedule(activeDate, activeGroup));
  };

  const handleExportDocx = async () => {
    setExportingDocx(true);
    try {
      await exportScheduleToDocx(
        exportSchedule,
        activeGroup.instructors,
        activeGroup.students,
        activeGroup.aircraft,
        exportLang,
        exportStyle,
        activeGroup.name,
        showExportInspection
      );
    } finally {
      setExportingDocx(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportScheduleToPdf(
        exportSchedule,
        activeGroup.instructors,
        activeGroup.students,
        activeGroup.aircraft,
        exportLang,
        exportStyle,
        activeGroup.name,
        showExportInspection
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportImage = async () => {
    setExportingImage(true);
    try {
      await exportScheduleToImage(
        exportSchedule,
        activeGroup.instructors,
        activeGroup.students,
        activeGroup.aircraft,
        exportLang,
        exportStyle,
        activeGroup.name,
        showExportInspection
      );
    } finally {
      setExportingImage(false);
    }
  };

  const handleDownloadBackup = () => {
    const blob = new Blob([JSON.stringify(appState, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mfc-flight-ops-backup-${activeDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const migrated = migrateState(parsed);
        applyAdminState(migrated);
        setLocalOpsDocs(normalizeOpsDocuments(migrated.opsDocs));
        const grp =
          migrated.groups.find((g) => g.id === migrated.activeGroupId) || migrated.groups[0];
        const dates = Object.keys(grp.schedules).sort();
        if (dates.length > 0) setActiveDate(dates[dates.length - 1]);
      } catch {
        alert("Invalid backup JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const waText =
    waMode === "dispatch"
      ? buildWhatsAppBroadcast(
          exportSchedule,
          activeGroup.instructors,
          activeGroup.students,
          activeGroup.aircraft,
          exportLang
        )
      : buildWhatsAppStudentSummary(
          exportSchedule,
          activeGroup.instructors,
          activeGroup.students,
          activeGroup.aircraft,
          exportLang
        );

  if (authChecked && !isAdmin && !viewerDismissed) {
    return (
      <LoginPage
        mode="gate"
        onLoginSuccess={() => {
          setIsAdmin(true);
          setViewerDismissed(false);
          setAuthToast(null);
        }}
        onContinueViewer={() => {
          setViewerSessionDismissed(true);
          setViewerDismissed(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {authToast && (
        <div className="bg-[#C00000] px-4 py-2 text-center text-xs font-extrabold text-white print:hidden">
          {authToast}
        </div>
      )}
      {/* Screen Header & Controls */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-2xs backdrop-blur-xs print:hidden">
        {/* Mobile Portrait Compact Header (< 768px) — single ~52px row, fits >= 360px cleanly */}
        <div className="flex items-center justify-between gap-1.5 px-2.5 pb-1.5 pt-[max(0.45rem,env(safe-area-inset-top))] md:hidden">
          <div className="flex min-w-0 shrink items-center gap-1">
            <img
              src="/mfc-logo.png"
              alt="MFC Crest"
              className="h-6 w-auto max-w-[88px] rounded bg-white object-contain"
            />
            <span
              title={
                syncMode === "cloudflare-d1"
                  ? "Synced with Cloudflare D1"
                  : "Local browser mode"
              }
              className={`h-2 w-2 shrink-0 rounded-full ${
                syncMode === "cloudflare-d1" ? "bg-emerald-500" : "bg-amber-400"
              }`}
            />
          </div>

          {/* Native iOS-style Date Stepper */}
          <div className="flex shrink-0 items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setActiveDate((d) => shiftIsoDate(d, -1));
                setExportDateOverride(null);
              }}
              aria-label="Previous day"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 active:bg-slate-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <label className="relative flex min-w-[96px] cursor-pointer items-center justify-center px-1.5 py-1 text-center">
              <span className="whitespace-nowrap text-xs font-extrabold tracking-tight text-[#1B365D]">
                {formatCompactMobileDate(activeDate)}
              </span>
              <input
                type="date"
                aria-label="Mobile schedule date"
                value={activeDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setActiveDate(e.target.value);
                    setExportDateOverride(null);
                  }
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setActiveDate((d) => shiftIsoDate(d, 1));
                setExportDateOverride(null);
              }}
              aria-label="Next day"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 active:bg-slate-200"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

            {/* Group & Schedule Tools Sheet Trigger + Quick Auth Pill */}
          <div className="flex shrink-0 items-center gap-1">
            {isAdmin ? (
              <button
                type="button"
                onClick={handleLogoutAdmin}
                aria-label="Sign out of Admin"
                title="Admin logged in — tap to lock/logout"
                className="flex h-9 items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-extrabold text-emerald-800"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Admin</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setLoginModalOpen(true)}
                aria-label="Admin Login"
                title="Sign in as Admin to edit schedule"
                className="flex h-9 items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2 text-[10px] font-extrabold text-amber-900"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Login</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileToolsOpen(true)}
              aria-label="Group and schedule tools"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#1B365D] shadow-2xs active:bg-slate-100"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Desktop & iPad Header (>= 768px) */}
        <div className="mx-auto hidden max-w-[1600px] flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 md:flex">
          {/* Brand, Group Switcher & Nav Tabs */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <img
                src="/mfc-logo.png"
                alt="MFC Crest"
                className="h-8 w-auto rounded bg-white object-contain"
              />
              <div className="hidden sm:block">
                <div className="flex items-center gap-1.5 text-sm font-extrabold tracking-tight text-[#1B365D]">
                  <span>MFC Flight Ops</span>
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-[#1B365D]">
                    v4.0
                  </span>
                </div>
              </div>
            </div>

            {/* Multi-Group Switcher + Rename (Admin only for rename/create) */}
            <div className="flex items-center gap-1">
              <select
                value={activeGroup.id}
                onChange={(e) => handleGroupSwitch(e.target.value)}
                className="max-w-[205px] rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-[#1B365D] focus:border-[#1B365D] focus:outline-none"
                title="Switch Detachment / Flight Group"
              >
                {appState.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                {isAdmin && <option value="__new__">+ New Flight Group...</option>}
              </select>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    const nextName = window.prompt("Rename flight group / captain:", activeGroup.name);
                    if (nextName && nextName.trim()) {
                      const trimmed = nextName.trim();
                      updateActiveGroup((grp) => ({ ...grp, name: trimmed }));
                    }
                  }}
                  title="Rename current flight group"
                  className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-[#1B365D]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <nav className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("schedule")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
                  activeTab === "schedule"
                    ? "bg-[#1B365D] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Schedule
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("forms")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
                  activeTab === "forms"
                    ? "bg-[#1B365D] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Ops Forms
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("roster")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
                  activeTab === "roster"
                    ? "bg-[#1B365D] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Roster &amp; Fleet
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("reports")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
                  activeTab === "reports"
                    ? "bg-[#1B365D] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Reports
              </button>
            </nav>
          </div>

          {/* Date, Auth Status, Actions & Export Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isAdmin ? (
              <button
                type="button"
                onClick={handleLogoutAdmin}
                title="Signed in as Admin — click to lock/logout"
                className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold text-emerald-800 hover:bg-emerald-100"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>Admin</span>
                <LogOut className="h-3 w-3 opacity-70" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setLoginModalOpen(true)}
                title="Read-Only Viewer Mode — click to sign in as Admin"
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-extrabold text-amber-950 hover:bg-amber-100"
              >
                <Eye className="h-3.5 w-3.5 text-amber-700" />
                <span>Read-Only</span>
                <span className="rounded bg-[#1B365D] px-1.5 py-0.2 text-[10px] text-white">
                  Admin Login
                </span>
              </button>
            )}

            <div
              className={`hidden items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold xl:inline-flex ${
                syncMode === "cloudflare-d1"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {syncMode === "cloudflare-d1" ? (
                <Cloud className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <HardDrive className="h-3.5 w-3.5 text-slate-500" />
              )}
              <span>
                {syncMode === "cloudflare-d1" ? "D1" : "Local"}
                {savingStatus === "saving" ? "·…" : savingStatus === "saved" ? "·✓" : ""}
              </span>
            </div>

            <input
              type="date"
              value={activeDate}
              onChange={(e) => {
                setActiveDate(e.target.value);
                setExportDateOverride(null);
              }}
              title="Schedule date"
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-[#1B365D] focus:outline-none"
            />

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleCopyPreviousDay}
                  title="Copy sorties from previous day"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Copy Prev</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoDraft}
                  title="Auto-draft balanced schedule prioritizing students with fewest hours"
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Auto-Draft</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setWaCopied(false);
                setWaOpen(true);
              }}
              title="Copy formatted WhatsApp dispatch summary"
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden md:inline">WhatsApp</span>
            </button>

            {/* EN / AR Export Language Switch */}
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setExportLang("EN")}
                className={`rounded-md px-2 py-1 text-[11px] font-extrabold ${
                  exportLang === "EN" ? "bg-white text-[#1B365D] shadow-2xs" : "text-slate-500"
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setExportLang("AR")}
                className={`rounded-md px-2 py-1 text-[11px] font-extrabold ${
                  exportLang === "AR" ? "bg-white text-[#1B365D] shadow-2xs" : "text-slate-500"
                }`}
              >
                عربي
              </button>
            </div>

            {/* Modern / Classic Export Layout Style Switch */}
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setExportStyle("modern")}
                className={`rounded-md px-2 py-1 text-[11px] font-extrabold ${
                  exportStyle === "modern" ? "bg-[#1B365D] text-white shadow-2xs" : "text-slate-500"
                }`}
                title="Modern web-grid export layout (single page + Roster)"
              >
                Modern
              </button>
              <button
                type="button"
                onClick={() => setExportStyle("classic")}
                className={`rounded-md px-2 py-1 text-[11px] font-extrabold ${
                  exportStyle === "classic" ? "bg-[#1B365D] text-white shadow-2xs" : "text-slate-500"
                }`}
                title="Classic traditional table format"
              >
                Classic
              </button>
            </div>

            {/* Export Date Override + Hide/Show Hourly Check + Image/PDF/Word */}
            <div
              className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[11px] font-bold ${
                exportDateOverride && exportDateOverride !== activeDate
                  ? "border-amber-400 bg-amber-50 text-amber-900"
                  : "border-slate-300 bg-slate-50 text-slate-700"
              }`}
              title="Date printed at the top of Image, PDF, Word, Print, and WhatsApp exports (does not alter or clear the schedule)"
            >
              <span className="hidden sm:inline text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                Export Date
              </span>
              <input
                type="date"
                aria-label="Export Date"
                value={effectiveExportDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setExportDateOverride(!val || val === activeDate ? null : val);
                }}
                className="rounded border-0 bg-transparent px-1 py-0.5 text-[11px] font-bold text-slate-900 focus:outline-none"
              />
              {exportDateOverride && exportDateOverride !== activeDate && (
                <button
                  type="button"
                  onClick={() => setExportDateOverride(null)}
                  title="Reset export date to schedule date"
                  className="rounded p-0.5 text-amber-800 hover:bg-amber-200/70"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowExportInspection((v) => !v)}
              title="Show or hide aircraft hourly inspection check in Image, PDF, Word, and Print exports"
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                showExportInspection
                  ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  : "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>Insp Hrs: {showExportInspection ? "On" : "Off"}</span>
            </button>

            <button
              type="button"
              onClick={handleExportImage}
              disabled={exportingImage}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-60"
              title={`Export high-res PNG image (${exportStyle}, ${exportLang})`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {exportingImage ? "PNG..." : `Image (${exportLang})`}
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="inline-flex items-center gap-1 rounded-lg bg-[#C00000] px-2.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#9E0000] disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              {exportingPdf ? "PDF..." : `PDF (${exportLang})`}
            </button>

            <button
              type="button"
              onClick={handleExportDocx}
              disabled={exportingDocx}
              className="inline-flex items-center gap-1 rounded-lg bg-[#1B365D] px-2.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#142947] disabled:opacity-60"
            >
              <FileText className="h-3.5 w-3.5" />
              {exportingDocx ? "Word..." : `Word (${exportLang})`}
            </button>

            <button
              type="button"
              onClick={() => triggerPrint("schedule")}
              title="Browser Print Dialog"
              className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-3.5 w-3.5" />
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={handleClearDay}
                title="Clear all sorties for this date"
                className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-500 hover:bg-red-50 hover:text-[#C00000]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1.5">
              <button
                type="button"
                onClick={handleDownloadBackup}
                title="Download JSON Backup"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    title="Restore JSON Backup"
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Reset schedule to default Group B — Capt. Mohamed Salah (23/11)?")) {
                        const seed = createSeedState();
                        applyAdminState(seed);
                        setLocalOpsDocs(normalizeOpsDocuments(seed.opsDocs));
                        setActiveDate("2026-11-23");
                      }
                    }}
                    title="Reset to Baseline Data"
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#C00000]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main App View */}
      <main
        className={`mx-auto max-w-[1600px] px-3 pb-24 pt-2.5 md:p-4 md:pb-6 ${
          printTarget === "schedule" ? "print:hidden" : "print:m-0 print:max-w-none print:p-0"
        }`}
      >
        {activeTab === "schedule" && (
          <ScheduleBoard
            schedule={currentSchedule}
            group={activeGroup}
            instructors={activeGroup.instructors}
            students={activeGroup.students}
            aircraft={activeGroup.aircraft}
            ready={hydrated}
            readOnly={!isAdmin}
            onChangeSchedule={updateCurrentSchedule}
            onChangeInstructors={(instructors) =>
              updateActiveGroup((grp) => ({ ...grp, instructors }))
            }
            onChangeStudents={(students) =>
              updateActiveGroup((grp) => ({ ...grp, students }))
            }
            onQuickAddStudent={handleQuickAddStudent}
            onRecordNoShow={handleRecordNoShow}
          />
        )}
        {activeTab === "forms" && (
          <OpsFormsHub
            opsDocs={localOpsDocs}
            schedule={currentSchedule}
            instructors={activeGroup.instructors}
            students={activeGroup.students}
            aircraft={activeGroup.aircraft}
            isAdmin={isAdmin}
            activePrintTarget={printTarget}
            onChangeOpsDocsLocal={setLocalOpsDocs}
            onSaveOpsDocsCloud={(nextDocs) =>
              applyAdminState((prev) => ({ ...prev, opsDocs: nextDocs }))
            }
            onPrintDoc={(target) => triggerPrint(target)}
            onRequestAdminLogin={() => setLoginModalOpen(true)}
          />
        )}
        {activeTab === "roster" && (
          <RosterManager
            instructors={activeGroup.instructors}
            students={activeGroup.students}
            aircraft={activeGroup.aircraft}
            readOnly={!isAdmin}
            onRequestAdminLogin={() => setLoginModalOpen(true)}
            onChangeInstructors={(instructors) =>
              updateActiveGroup((grp) => ({ ...grp, instructors }))
            }
            onChangeStudents={(students) =>
              updateActiveGroup((grp) => ({ ...grp, students }))
            }
            onChangeAircraft={(aircraft) =>
              updateActiveGroup((grp) => ({ ...grp, aircraft }))
            }
          />
        )}
        {activeTab === "reports" && <ReportsDashboard group={activeGroup} />}
      </main>

      {/* Fixed iOS-style Mobile Bottom Tab Bar (< 768px) — 5 compact tabs */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur-md md:hidden print:hidden"
      >
        <button
          type="button"
          onClick={() => setActiveTab("schedule")}
          className={`flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-extrabold transition ${
            activeTab === "schedule" ? "text-[#1B365D]" : "text-slate-500"
          }`}
        >
          <Calendar className={`h-5 w-5 ${activeTab === "schedule" ? "stroke-[2.4]" : ""}`} />
          <span className="truncate">Schedule</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("forms")}
          className={`flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-extrabold transition ${
            activeTab === "forms" ? "text-[#1B365D]" : "text-slate-500"
          }`}
        >
          <ClipboardList className={`h-5 w-5 ${activeTab === "forms" ? "stroke-[2.4]" : ""}`} />
          <span className="truncate">Forms</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("roster")}
          className={`flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-extrabold transition ${
            activeTab === "roster" ? "text-[#1B365D]" : "text-slate-500"
          }`}
        >
          <Users className={`h-5 w-5 ${activeTab === "roster" ? "stroke-[2.4]" : ""}`} />
          <span className="truncate">Roster</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileExportOpen(true)}
          className="relative flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-extrabold text-indigo-700 active:bg-indigo-50"
        >
          <span className="relative">
            <Share2 className="h-5 w-5" />
            {exportDateOverride && exportDateOverride !== activeDate && (
              <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-amber-500" />
            )}
          </span>
          <span className="truncate">Export</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reports")}
          className={`flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-extrabold transition ${
            activeTab === "reports" ? "text-[#1B365D]" : "text-slate-500"
          }`}
        >
          <BarChart3 className={`h-5 w-5 ${activeTab === "reports" ? "stroke-[2.4]" : ""}`} />
          <span className="truncate">Reports</span>
        </button>
      </nav>

      {/* Mobile Slide-Up Sheet: Export & Share */}
      {mobileExportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-xs md:hidden print:hidden"
          onClick={() => setMobileExportOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1 w-10 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-extrabold text-[#1B365D]">Export &amp; Share</h2>
                <p className="text-[11px] text-slate-500">{activeGroup.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileExportOpen(false)}
                aria-label="Close export sheet"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[75dvh] space-y-3.5 overflow-y-auto p-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Language
                  </span>
                  <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setExportLang("EN")}
                      className={`min-h-[38px] rounded-lg text-xs font-extrabold ${
                        exportLang === "EN" ? "bg-white text-[#1B365D] shadow-2xs" : "text-slate-600"
                      }`}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportLang("AR")}
                      className={`min-h-[38px] rounded-lg text-xs font-extrabold ${
                        exportLang === "AR" ? "bg-white text-[#1B365D] shadow-2xs" : "text-slate-600"
                      }`}
                    >
                      عربي
                    </button>
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Layout
                  </span>
                  <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setExportStyle("modern")}
                      className={`min-h-[38px] rounded-lg text-xs font-extrabold ${
                        exportStyle === "modern"
                          ? "bg-[#1B365D] text-white shadow-2xs"
                          : "text-slate-600"
                      }`}
                    >
                      Modern
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportStyle("classic")}
                      className={`min-h-[38px] rounded-lg text-xs font-extrabold ${
                        exportStyle === "classic"
                          ? "bg-[#1B365D] text-white shadow-2xs"
                          : "text-slate-600"
                      }`}
                    >
                      Classic
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Top Date on Export
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExportDateOverride(shiftIsoDate(effectiveExportDate, 1))
                      }
                      className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#1B365D] active:bg-blue-50"
                    >
                      +1 Day
                    </button>
                    {exportDateOverride && exportDateOverride !== activeDate && (
                      <button
                        type="button"
                        onClick={() => setExportDateOverride(null)}
                        className="rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 text-[11px] font-extrabold text-amber-900"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="date"
                  aria-label="Mobile Export Date"
                  value={effectiveExportDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setExportDateOverride(!val || val === activeDate ? null : val);
                  }}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-bold text-slate-900 focus:border-[#1B365D] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Changes the printed header date on exports without clearing today&apos;s flights.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowExportInspection((v) => !v)}
                className={`flex min-h-[44px] w-full items-center justify-between rounded-xl border px-3.5 py-2 text-xs font-bold ${
                  showExportInspection
                    ? "border-slate-300 bg-white text-slate-800"
                    : "border-amber-400 bg-amber-50 text-amber-950"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  Aircraft Hourly Inspection Check
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                    showExportInspection
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-200 text-amber-950"
                  }`}
                >
                  {showExportInspection ? "Shown" : "Hidden"}
                </span>
              </button>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    await handleExportImage();
                    setMobileExportOpen(false);
                  }}
                  disabled={exportingImage}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-extrabold text-white shadow-xs active:bg-indigo-700 disabled:opacity-60"
                >
                  <ImageIcon className="h-4 w-4" />
                  {exportingImage
                    ? "Preparing Image..."
                    : `Save Image (PNG · ${exportLang})`}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await handleExportPdf();
                      setMobileExportOpen(false);
                    }}
                    disabled={exportingPdf}
                    className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-[#C00000] px-3 text-xs font-extrabold text-white active:bg-[#9E0000] disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    {exportingPdf ? "PDF..." : `PDF (${exportLang})`}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleExportDocx();
                      setMobileExportOpen(false);
                    }}
                    disabled={exportingDocx}
                    className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-[#1B365D] px-3 text-xs font-extrabold text-white active:bg-[#142947] disabled:opacity-60"
                  >
                    <FileText className="h-4 w-4" />
                    {exportingDocx ? "Word..." : `Word (${exportLang})`}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileExportOpen(false);
                      setWaCopied(false);
                      setWaOpen(true);
                    }}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-extrabold text-white active:bg-emerald-700"
                  >
                    <MessageSquare className="h-4 w-4" />
                    WhatsApp Text
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileExportOpen(false);
                      window.setTimeout(() => triggerPrint("schedule"), 150);
                    }}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 active:bg-slate-100"
                  >
                    <Printer className="h-4 w-4" />
                    Print Sheet
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Slide-Up Sheet: Group & Schedule Tools */}
      {mobileToolsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-xs md:hidden print:hidden"
          onClick={() => setMobileToolsOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1 w-10 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold text-[#1B365D]">
                  Group &amp; Schedule Tools
                </h2>
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-[#1B365D]">
                  v4.0
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileToolsOpen(false)}
                aria-label="Close tools sheet"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[75dvh] space-y-3.5 overflow-y-auto p-4 text-xs">
              {/* Mobile Auth Card */}
              <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div>
                  <div className="font-extrabold text-[#1B365D]">
                    {isAdmin ? "Admin Access Unlocked" : "Read-Only Viewer Mode"}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isAdmin
                      ? "Full schedule, roster, and template edit permissions"
                      : "Sign in as Admin (admin) to modify schedule or rosters"}
                  </div>
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileToolsOpen(false);
                      handleLogoutAdmin();
                    }}
                    className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 font-extrabold text-emerald-800"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Logout
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileToolsOpen(false);
                      setLoginModalOpen(true);
                    }}
                    className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-lg bg-[#1B365D] px-3 font-extrabold text-white"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    Admin Login
                  </button>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  Active Flight Group
                </span>
                <select
                  value={activeGroup.id}
                  onChange={(e) => handleGroupSwitch(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-bold text-[#1B365D] focus:border-[#1B365D] focus:outline-none"
                >
                  {appState.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                  {isAdmin && <option value="__new__">+ New Flight Group...</option>}
                </select>
                {isAdmin && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextName = window.prompt(
                          "Rename flight group / captain:",
                          activeGroup.name
                        );
                        if (nextName && nextName.trim()) {
                          const trimmed = nextName.trim();
                          updateActiveGroup((grp) => ({ ...grp, name: trimmed }));
                        }
                      }}
                      className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 font-bold text-slate-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Rename Group
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileToolsOpen(false);
                        setNewGroupOpen(true);
                      }}
                      className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 font-bold text-[#1B365D]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New Group
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        handleCopyPreviousDay();
                        setMobileToolsOpen(false);
                      }}
                      className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 font-bold text-slate-800"
                    >
                      <Copy className="h-4 w-4" />
                      Copy Prev Day
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleAutoDraft();
                        setMobileToolsOpen(false);
                      }}
                      className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 font-bold text-emerald-900"
                    >
                      <Wand2 className="h-4 w-4" />
                      Auto-Draft
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadBackup();
                    setMobileToolsOpen(false);
                  }}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 font-bold text-slate-700"
                >
                  <Download className="h-4 w-4" />
                  Save Backup
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileToolsOpen(false);
                      importInputRef.current?.click();
                    }}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 font-bold text-slate-700"
                  >
                    <Upload className="h-4 w-4" />
                    Restore Backup
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                <span>Cloud Sync: {syncMode === "cloudflare-d1" ? "Cloudflare D1" : "Local"}</span>
                <span>
                  {savingStatus === "saving"
                    ? "Saving..."
                    : savingStatus === "saved"
                    ? "Saved ✓"
                    : "Ready"}
                </span>
              </div>

              {isAdmin && (
                <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Clear all sorties for this date?")) {
                        handleClearDay();
                        setMobileToolsOpen(false);
                      }
                    }}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 font-bold text-[#C00000]"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Day
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm("Reset schedule to default Group B — Capt. Mohamed Salah (23/11)?")
                      ) {
                        const seed = createSeedState();
                        applyAdminState(seed);
                        setLocalOpsDocs(normalizeOpsDocuments(seed.opsDocs));
                        setActiveDate("2026-11-23");
                        setMobileToolsOpen(false);
                      }
                    }}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 font-bold text-slate-700"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset Seed
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Modal */}
      {waOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-3 print:hidden"
          onClick={() => setWaOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-xl sm:pb-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-emerald-700 px-4 py-3 text-white">
              <div className="flex items-center gap-2 font-bold">
                <MessageSquare className="h-4 w-4" />
                <span>WhatsApp Dispatch Message</span>
              </div>
              <button type="button" onClick={() => setWaOpen(false)} className="p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWaMode("dispatch");
                    setWaCopied(false);
                  }}
                  className={`min-h-[40px] flex-1 rounded-lg border px-3 py-1.5 text-xs font-bold ${
                    waMode === "dispatch"
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  Full Aircraft Dispatch
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWaMode("students");
                    setWaCopied(false);
                  }}
                  className={`min-h-[40px] flex-1 rounded-lg border px-3 py-1.5 text-xs font-bold ${
                    waMode === "students"
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  Per-Student Flight Calls
                </button>
              </div>
              <textarea
                readOnly
                rows={10}
                value={waText}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-800"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(waText);
                    setWaCopied(true);
                  }}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 sm:w-auto"
                >
                  {waCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {waCopied ? "Copied!" : "Copy for WhatsApp"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create New Flight Group Modal */}
      {newGroupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-3 print:hidden"
          onClick={() => setNewGroupOpen(false)}
        >
          <form
            onSubmit={handleCreateGroup}
            className="w-full max-w-md overflow-hidden rounded-t-2xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-xl sm:pb-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-[#1B365D] px-4 py-3 text-white">
              <span className="font-bold">Create New Flight Group</span>
              <button type="button" onClick={() => setNewGroupOpen(false)} className="p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-xs">
              <label className="block">
                <span className="font-bold text-slate-700">Group / Detachment Name</span>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Group C — Capt. Saad"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-[#1B365D] focus:outline-none sm:text-sm"
                />
              </label>
              <label className="flex items-center gap-2 font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={cloneGroup}
                  onChange={(e) => setCloneGroup(e.target.checked)}
                />
                Copy aircraft &amp; rosters from {activeGroup.name}
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={() => setNewGroupOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-[#1B365D] px-3 py-1.5 text-xs font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Create Group
              </button>
            </div>
          </form>
        </div>
      )}

      {/* On-Demand Admin Login Modal (from Read-Only Viewer Mode) */}
      {loginModalOpen && (
        <LoginPage
          mode="modal"
          onLoginSuccess={() => {
            setIsAdmin(true);
            setViewerDismissed(false);
            setAuthToast(null);
            setLoginModalOpen(false);
          }}
          onContinueViewer={() => setLoginModalOpen(false)}
          onClose={() => setLoginModalOpen(false)}
        />
      )}

      {/* Browser Print View (matches active exportLang & exportStyle when printing Schedule) */}
      {printTarget === "schedule" && (
        <PrintSheet
          schedule={exportSchedule}
          instructors={activeGroup.instructors}
          students={activeGroup.students}
          aircraft={activeGroup.aircraft}
          lang={exportLang}
          style={exportStyle}
          groupName={activeGroup.name}
          showInspectionHours={showExportInspection}
        />
      )}
    </div>
  );
}

export default App;
