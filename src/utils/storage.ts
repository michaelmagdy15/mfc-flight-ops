import { AppState, DaySchedule, GroupData, OpsDocumentsState } from "../types";
import {
  createSeedState,
  GROUP_B_INSTRUCTORS,
  GROUP_B_STUDENTS,
} from "../data/seedData";
import { lookupFleetWeightRecord } from "../data/fleetWeightBalance";
import { normalizeOpsDocuments } from "../data/opsReferenceData";
import { getStoredAdminToken } from "./auth";

const SEED_INST_AR = new Map(
  GROUP_B_INSTRUCTORS.map((i) => [
    i.id,
    { nameAr: i.nameAr, shortNameAr: i.shortNameAr },
  ])
);
const SEED_INST_BY_NAME = new Map(
  GROUP_B_INSTRUCTORS.map((i) => [
    i.name.toLowerCase(),
    { nameAr: i.nameAr, shortNameAr: i.shortNameAr },
  ])
);
const SEED_STU_AR = new Map(
  GROUP_B_STUDENTS.map((s) => [s.id, s.nameAr])
);
const SEED_STU_BY_NAME = new Map(
  GROUP_B_STUDENTS.map((s) => [s.name.toLowerCase(), s.nameAr])
);

const LOCAL_STORAGE_KEY_V2 = "mfc_flight_ops_v2";
const LOCAL_STORAGE_KEY_V1 = "mfc_flight_ops_v1";

export type SyncMode = "cloudflare-d1" | "local-only";

export interface LoadResult {
  state: AppState;
  mode: SyncMode;
  updatedAt: string | null;
}

function normalizeSchedule(s: Partial<DaySchedule> & { date: string }): DaySchedule {
  return {
    date: s.date,
    airport: s.airport || "Assiut Airport",
    issueLabel: s.issueLabel || "DAY ISSUE 1",
    missionCommander: s.missionCommander || "",
    operationsOfficer: s.operationsOfficer || "",
    monitoringOfficer: s.monitoringOfficer || "",
    operationsManager: s.operationsManager || "Capt. Amgad",
    massBriefing: s.massBriefing || "",
    exams: s.exams || "",
    timeSlots: Array.isArray(s.timeSlots) && s.timeSlots.length === 10
      ? s.timeSlots
      : ["6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM"],
    weather: Array.isArray(s.weather) && s.weather.length === 3
      ? s.weather
      : [
          { time: "9 AM", wind: "", temp: "" },
          { time: "12 PM", wind: "", temp: "" },
          { time: "3 PM", wind: "", temp: "" },
        ],
    weatherMeta: s.weatherMeta,
    standby: Array.isArray(s.standby) ? s.standby : [],
    notes: Array.isArray(s.notes) ? s.notes : [],
    grid: s.grid && typeof s.grid === "object" ? s.grid : {},
  };
}

function normalizeGroup(g: Partial<GroupData> & { id: string; name: string }): GroupData {
  const schedules: Record<string, DaySchedule> = {};
  for (const [k, v] of Object.entries(g.schedules || {})) {
    if (v && typeof v === "object") {
      schedules[k] = normalizeSchedule({ ...v, date: v.date || k });
    }
  }
  const instructors = (Array.isArray(g.instructors) ? g.instructors : []).map((inst) => {
    const upgradedInst =
      inst.id === "inst-khidr"
        ? {
            ...inst,
            name: inst.name === "Capt. Khidr" ? "Capt. Khedr" : inst.name,
            shortName: inst.shortName === "Capt. Khidr" ? "Capt. Khedr" : inst.shortName,
          }
        : inst;
    if (upgradedInst.nameAr) return upgradedInst;
    const match =
      SEED_INST_AR.get(upgradedInst.id) ||
      SEED_INST_BY_NAME.get((upgradedInst.name || "").toLowerCase());
    return match
      ? {
          ...upgradedInst,
          nameAr: match.nameAr,
          shortNameAr: upgradedInst.shortNameAr || match.shortNameAr,
        }
      : upgradedInst;
  });

  const students = (Array.isArray(g.students) ? g.students : []).map((stu) => {
    if (stu.nameAr) return stu;
    const match = SEED_STU_AR.get(stu.id) || SEED_STU_BY_NAME.get((stu.name || "").toLowerCase());
    return match ? { ...stu, nameAr: match } : stu;
  });

  const aircraft = (Array.isArray(g.aircraft) ? g.aircraft : []).map((ac) => {
    if ((ac.registration || "").trim().toUpperCase() === "EXTRA") return ac;
    if (ac.basicEmptyWeightLb !== undefined && ac.emptyArmIn !== undefined) {
      return ac;
    }
    const rec = lookupFleetWeightRecord(ac.registration);
    if (!rec) return ac;
    return {
      ...ac,
      basicEmptyWeightLb: ac.basicEmptyWeightLb ?? rec.basicEmptyWeightLb,
      emptyArmIn: ac.emptyArmIn ?? rec.emptyArmIn,
      weighingDate: ac.weighingDate || rec.weighingDate,
      weighingDueDate: ac.weighingDueDate || rec.weighingDueDate,
    };
  });

  return {
    id: g.id,
    name: g.name,
    instructors,
    students,
    aircraft,
    schedules,
    noShows: Array.isArray(g.noShows) ? g.noShows : [],
  };
}

export function migrateState(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") {
    return createSeedState();
  }

  const obj = raw as Record<string, unknown>;

  // Already v2
  if (obj.version === 2 && Array.isArray(obj.groups) && obj.groups.length > 0) {
    const groups = obj.groups
      .filter((g): g is GroupData => {
        if (!g || typeof g !== "object") return false;
        const gd = g as GroupData;
        return Boolean(gd.id) && gd.id !== "grp-hamdy" && !/hamdy/i.test(gd.name || "");
      })
      .map((g) => {
        const renamed =
          g.id === "grp-msalah" && /^Group A\b/i.test(g.name || "")
            ? { ...g, name: "Group B — Capt. Mohamed Salah" }
            : g;
        return normalizeGroup(renamed);
      });
    if (groups.length === 0) return createSeedState();
    const activeId =
      typeof obj.activeGroupId === "string" && groups.some((g) => g.id === obj.activeGroupId)
        ? obj.activeGroupId
        : groups[0].id;
    return {
      version: 2,
      activeGroupId: activeId,
      groups,
      opsDocs: normalizeOpsDocuments(obj.opsDocs as Partial<OpsDocumentsState> | undefined),
    };
  }

  // Upgrade v1 single-group state into v2
  if (
    Array.isArray(obj.instructors) &&
    Array.isArray(obj.students) &&
    Array.isArray(obj.aircraft) &&
    obj.schedules &&
    typeof obj.schedules === "object"
  ) {
    const firstScheduleKey = Object.keys(obj.schedules as Record<string, unknown>)[0] || "";
    if (firstScheduleKey === "2026-11-18") {
      return createSeedState();
    }
    const primaryGroup = normalizeGroup({
      id: "grp-msalah",
      name: "Group B — Capt. Mohamed Salah",
      instructors: obj.instructors as GroupData["instructors"],
      students: obj.students as GroupData["students"],
      aircraft: obj.aircraft as GroupData["aircraft"],
      schedules: obj.schedules as GroupData["schedules"],
      noShows: [],
    });

    return {
      version: 2,
      activeGroupId: primaryGroup.id,
      groups: [primaryGroup],
      opsDocs: normalizeOpsDocuments(undefined),
    };
  }

  return createSeedState();
}

export function loadLocalState(): AppState | null {
  try {
    const rawV2 = window.localStorage.getItem(LOCAL_STORAGE_KEY_V2);
    if (rawV2) {
      return migrateState(JSON.parse(rawV2));
    }
    const rawV1 = window.localStorage.getItem(LOCAL_STORAGE_KEY_V1);
    if (rawV1) {
      const migrated = migrateState(JSON.parse(rawV1));
      saveLocalState(migrated);
      return migrated;
    }
  } catch {
    // Ignore malformed local storage
  }
  return null;
}

export function saveLocalState(state: AppState): void {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY_V2, JSON.stringify(state));
  } catch {
    // Ignore quota errors
  }
}

export async function loadInitialState(): Promise<LoadResult> {
  const local = loadLocalState();

  try {
    const res = await fetch("/api/state", { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = (await res.json()) as {
        ok?: boolean;
        mode?: SyncMode;
        state?: unknown;
        updatedAt?: string | null;
      };
      if (data.ok && data.mode === "cloudflare-d1") {
        if (data.state) {
          const migrated = migrateState(data.state);
          saveLocalState(migrated);
          return { state: migrated, mode: "cloudflare-d1", updatedAt: data.updatedAt ?? null };
        }
        const initial = local ?? createSeedState();
        saveLocalState(initial);
        return { state: initial, mode: "cloudflare-d1", updatedAt: null };
      }
    }
  } catch {
    // Offline or local Vite dev without Pages Functions -> fall back to localStorage
  }

  const fallback = local ?? createSeedState();
  saveLocalState(fallback);
  return { state: fallback, mode: "local-only", updatedAt: null };
}

export async function saveCloudState(
  state: AppState
): Promise<{ ok: boolean; mode: SyncMode; updatedAt: string | null; unauthorized?: boolean }> {
  saveLocalState(state);
  const token = getStoredAdminToken();
  try {
    const res = await fetch("/api/state", {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(token && token !== "local-admin-ok" ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ state }),
    });
    if (res.status === 401) {
      return { ok: false, mode: "cloudflare-d1", updatedAt: null, unauthorized: true };
    }
    if (res.ok) {
      const data = (await res.json()) as { ok?: boolean; updatedAt?: string };
      return { ok: true, mode: "cloudflare-d1", updatedAt: data.updatedAt ?? new Date().toISOString() };
    }
  } catch {
    // Running locally without Cloudflare D1 backend
  }
  return { ok: false, mode: "local-only", updatedAt: null };
}
