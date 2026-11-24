import { Aircraft } from "../types";

export interface FleetWeightRecord {
  registration: string;
  weighingDate: string;
  weighingDueDate: string;
  emptyArmIn: number;
  basicEmptyWeightLb: number;
  aircraftClass: "C172R" | "MULTI";
}

/**
 * Official Egyptian Aviation Academy (EAA) Planning Department
 * Aircraft Weight and Balance Schedule (24 Fleet Aircraft)
 */
export const EAA_FLEET_WB_RECORDS: FleetWeightRecord[] = [
  { registration: "SU-BNT", weighingDate: "9/9/2024", weighingDueDate: "9/9/2027", emptyArmIn: 40.3364, basicEmptyWeightLb: 1731.4, aircraftClass: "C172R" },
  { registration: "SU-BNY", weighingDate: "10/10/2023", weighingDueDate: "10/10/2026", emptyArmIn: 40.69145, basicEmptyWeightLb: 1742, aircraftClass: "C172R" },
  { registration: "SU-BPB", weighingDate: "18/6/2023", weighingDueDate: "18/6/2026", emptyArmIn: 40.69145, basicEmptyWeightLb: 1742, aircraftClass: "C172R" },
  { registration: "SU-BPC", weighingDate: "10/4/2023", weighingDueDate: "10/4/2026", emptyArmIn: 40.449, basicEmptyWeightLb: 1758.75, aircraftClass: "C172R" },
  { registration: "SU-BPD", weighingDate: "6/11/2023", weighingDueDate: "6/11/2026", emptyArmIn: 40.165119, basicEmptyWeightLb: 1708.1, aircraftClass: "C172R" },
  { registration: "SU-BQS", weighingDate: "28/8/2024", weighingDueDate: "28/8/2027", emptyArmIn: 41.582, basicEmptyWeightLb: 1789, aircraftClass: "C172R" },
  { registration: "SU-BQT", weighingDate: "5/11/2023", weighingDueDate: "5/11/2026", emptyArmIn: 40.183957, basicEmptyWeightLb: 1707.9, aircraftClass: "C172R" },
  { registration: "SU-BQU", weighingDate: "28/8/2024", weighingDueDate: "28/8/2027", emptyArmIn: 41.90873, basicEmptyWeightLb: 1777, aircraftClass: "C172R" },
  { registration: "SU-BQV", weighingDate: "5/11/2023", weighingDueDate: "5/11/2026", emptyArmIn: 40.164729, basicEmptyWeightLb: 1706.8, aircraftClass: "C172R" },
  { registration: "SU-BQW", weighingDate: "11/1/2023", weighingDueDate: "11/1/2026", emptyArmIn: 40.192669, basicEmptyWeightLb: 1706.2, aircraftClass: "C172R" },
  { registration: "SU-BQX", weighingDate: "5/11/2023", weighingDueDate: "5/11/2026", emptyArmIn: 40.174458, basicEmptyWeightLb: 1707, aircraftClass: "C172R" },
  { registration: "SU-BRA", weighingDate: "31/1/2024", weighingDueDate: "31/1/2027", emptyArmIn: 40.9388, basicEmptyWeightLb: 1741.2, aircraftClass: "C172R" },
  { registration: "SU-BRH", weighingDate: "5/2/2025", weighingDueDate: "5/2/2028", emptyArmIn: 40.497722, basicEmptyWeightLb: 1734.5, aircraftClass: "C172R" },
  { registration: "SU-BRI", weighingDate: "5/2/2025", weighingDueDate: "5/2/2028", emptyArmIn: 40.710305, basicEmptyWeightLb: 1737, aircraftClass: "C172R" },
  { registration: "SU-BRJ", weighingDate: "5/2/2025", weighingDueDate: "5/2/2028", emptyArmIn: 40.744, basicEmptyWeightLb: 1738.5, aircraftClass: "C172R" },
  { registration: "SU-BRK", weighingDate: "23/9/2024", weighingDueDate: "23/9/2027", emptyArmIn: 41.0139, basicEmptyWeightLb: 1745, aircraftClass: "C172R" },
  { registration: "SU-BRL", weighingDate: "5/2/2025", weighingDueDate: "5/2/2028", emptyArmIn: 40.7499, basicEmptyWeightLb: 1733.5, aircraftClass: "C172R" },
  { registration: "SU-BRM", weighingDate: "28/1/2024", weighingDueDate: "28/1/2027", emptyArmIn: 40.53243, basicEmptyWeightLb: 1735.7, aircraftClass: "C172R" },
  { registration: "SU-BRN", weighingDate: "5/3/2025", weighingDueDate: "5/3/2028", emptyArmIn: 40.775899, basicEmptyWeightLb: 1751, aircraftClass: "C172R" },
  { registration: "SU-BRO", weighingDate: "5/3/2025", weighingDueDate: "5/3/2028", emptyArmIn: 40.7031, basicEmptyWeightLb: 1740, aircraftClass: "C172R" },
  { registration: "SU-BTP", weighingDate: "20/8/2023", weighingDueDate: "20/8/2026", emptyArmIn: 79.7293, basicEmptyWeightLb: 4002, aircraftClass: "MULTI" },
  { registration: "SU-BTQ", weighingDate: "9/10/2023", weighingDueDate: "9/10/2026", emptyArmIn: 80.1, basicEmptyWeightLb: 3998, aircraftClass: "MULTI" },
  { registration: "SU-BTR", weighingDate: "20/8/2023", weighingDueDate: "20/8/2026", emptyArmIn: 80.684, basicEmptyWeightLb: 2618.9, aircraftClass: "MULTI" },
  { registration: "SU-BTS", weighingDate: "10/10/2023", weighingDueDate: "10/10/2026", emptyArmIn: 80.6446, basicEmptyWeightLb: 2616.2, aircraftClass: "MULTI" },
];

const FLEET_WB_MAP = new Map<string, FleetWeightRecord>(
  EAA_FLEET_WB_RECORDS.map((r) => [r.registration.toUpperCase(), r])
);

/** Computes empty moment/1000 (lb-in / 1000) rounded to 2 decimal places. */
export function computeEmptyMoment(bewLb: number, armIn: number): number {
  return Math.round(((bewLb * armIn) / 1000) * 100) / 100;
}

/**
 * Looks up official EAA W&B record for an aircraft registration.
 * Prioritizes live Admin-edited fields on the active group's aircraft list when present.
 */
export function lookupFleetWeightRecord(
  registration: string,
  groupAircraft?: Aircraft[]
): FleetWeightRecord | null {
  const norm = (registration || "").trim().toUpperCase();
  if (!norm || norm === "EXTRA") return null;

  const base = FLEET_WB_MAP.get(norm);
  const active = groupAircraft?.find((a) => a.registration.trim().toUpperCase() === norm);

  if (
    active &&
    typeof active.basicEmptyWeightLb === "number" &&
    active.basicEmptyWeightLb > 0 &&
    typeof active.emptyArmIn === "number" &&
    active.emptyArmIn > 0
  ) {
    return {
      registration: norm,
      basicEmptyWeightLb: active.basicEmptyWeightLb,
      emptyArmIn: active.emptyArmIn,
      weighingDate: active.weighingDate || base?.weighingDate || "",
      weighingDueDate: active.weighingDueDate || base?.weighingDueDate || "",
      aircraftClass:
        base?.aircraftClass || (active.basicEmptyWeightLb > 2200 ? "MULTI" : "C172R"),
    };
  }

  return base || null;
}

/** Parses a D/M/YYYY date string into a local Date, or returns null if invalid. */
export function parseDmyDate(dmy?: string): Date | null {
  if (!dmy) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const dt = new Date(year, month - 1, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return dt;
}

/** Evaluates weighing certificate status against current date (60-day due-soon threshold). */
export function getWeighingDueStatus(
  dueDateStr?: string,
  now = new Date()
): "ok" | "due-soon" | "overdue" | "unknown" {
  const due = parseDmyDate(dueDateStr);
  if (!due) return "unknown";
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = (due.getTime() - todayMidnight) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 60) return "due-soon";
  return "ok";
}
