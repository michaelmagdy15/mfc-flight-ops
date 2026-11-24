import {
  Aircraft,
  DaySchedule,
  ExportLang,
  GroupData,
  Instructor,
  ScheduleConflict,
  Sortie,
  Student,
} from "../types";

export const PPL_MIN_VFR_VISIBILITY_KM = 5;

export function getSlotVisibilityKm(
  schedule: DaySchedule,
  slotIndex: number,
  durationMin = 60
): number | null {
  const interval = getSortieInterval(schedule, slotIndex, durationMin);
  const startHour = Math.floor(interval.startMin / 60);
  const endHour = Math.max(startHour + 1, Math.ceil(interval.endMin / 60));
  const bucket = startHour <= 10 ? 0 : startHour <= 13 ? 1 : 2;

  const rawSlotVis = schedule.weather[bucket]?.visibilityKm;
  const slotVis =
    typeof rawSlotVis === "number" && Number.isFinite(rawSlotVis) ? rawSlotVis : null;

  if (slotVis !== null && slotVis < PPL_MIN_VFR_VISIBILITY_KM) {
    return slotVis;
  }

  let hourlyVis: number | null = null;
  const todayVis = schedule.weatherMeta?.todayVisibility;
  if (todayVis && todayVis.date === schedule.date && Array.isArray(todayVis.hourly) && todayVis.hourly.length > 0) {
    const spanned = todayVis.hourly.filter((pt) => pt.hour >= startHour && pt.hour < endHour);
    if (spanned.length > 0) {
      hourlyVis = Math.min(...spanned.map((pt) => pt.visibilityKm));
    } else {
      const nearest = todayVis.hourly.reduce((best, cur) =>
        Math.abs(cur.hour - startHour) < Math.abs(best.hour - startHour) ? cur : best
      );
      hourlyVis = nearest.visibilityKm;
    }
  }

  if (slotVis !== null && hourlyVis !== null) return Math.min(slotVis, hourlyVis);
  return slotVis ?? hourlyVis;
}

export function isPplVfrVisibilityViolation(
  schedule: DaySchedule,
  slotIndex: number,
  candidate: Pick<Sortie, "durationMin" | "tag">,
  student?: Student
): { violated: boolean; visKm: number | null } {
  const visKm = getSlotVisibilityKm(schedule, slotIndex, candidate.durationMin);
  if (!student || student.program !== "PPL") {
    return { violated: false, visKm };
  }
  if ((candidate.tag || "").trim().toUpperCase() === "IR") {
    return { violated: false, visKm };
  }
  const violated = visKm !== null && visKm < PPL_MIN_VFR_VISIBILITY_KM;
  return { violated, visKm };
}

export function formatMinutes(totalMin: number, zeroDisplay = "-"): string {
  if (!totalMin || totalMin <= 0) return zeroDisplay;
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hrs}:${String(mins).padStart(2, "0")}`;
}

export function formatDurationCompact(totalMin: number): string {
  if (!totalMin || totalMin <= 0) return "0:00";
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hrs}:${String(mins).padStart(2, "0")}`;
}

export function formatScheduleTitleDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts.map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `${weekday}, ${String(d).padStart(2, "0")} / ${String(m).padStart(2, "0")} / ${y}`;
}

export function formatScheduleTitleDateArabic(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts.map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const weekday = weekdays[dt.getUTCDay()];
  return `يوم ${weekday} الموافق ${String(d).padStart(2, "0")} / ${String(m).padStart(2, "0")} / ${y}`;
}

export function formatMinutesAsClock(minFromMidnight: number): string {
  const total = ((minFromMidnight % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function parseSlotStartMin(label: string, slotIndex: number): number {
  const trimmed = (label || "").trim().toUpperCase();
  if (!trimmed) return 360 + slotIndex * 60;

  const amPmMatch = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (amPmMatch) {
    let h = Number(amPmMatch[1]);
    const m = Number(amPmMatch[2] || "0");
    const period = amPmMatch[3];
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return h * 60 + m;
  }

  const h24Match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    const h = Number(h24Match[1]);
    const m = Number(h24Match[2]);
    return h * 60 + m;
  }

  return 360 + slotIndex * 60;
}

export function getSortieInterval(
  schedule: DaySchedule,
  slotIndex: number,
  durationMin: number
): { startMin: number; endMin: number } {
  const startMin = parseSlotStartMin(schedule.timeSlots[slotIndex] || "", slotIndex);
  return { startMin, endMin: startMin + Math.max(15, durationMin || 60) };
}

export function intervalsOverlap(
  a: { startMin: number; endMin: number },
  b: { startMin: number; endMin: number }
): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export interface CoveredSlotInfo {
  fromSlotIndex: number;
  fromLabel: string;
  sortie: Sortie;
}

export function getAircraftCoveredSlots(
  schedule: DaySchedule,
  aircraftId: string
): Map<number, CoveredSlotInfo> {
  const covered = new Map<number, CoveredSlotInfo>();
  const acSlots = schedule.grid[aircraftId] || {};
  const slotStarts = schedule.timeSlots.map((lbl, idx) => parseSlotStartMin(lbl, idx));

  for (const [slotStr, sortie] of Object.entries(acSlots)) {
    const startIdx = Number(slotStr);
    if (!sortie) continue;
    const interval = getSortieInterval(schedule, startIdx, sortie.durationMin);
    for (let sIdx = startIdx + 1; sIdx < schedule.timeSlots.length; sIdx++) {
      const slotStart = slotStarts[sIdx];
      // Covered if the slot start falls strictly inside the sortie's duration
      if (slotStart > interval.startMin && slotStart < interval.endMin) {
        covered.set(sIdx, {
          fromSlotIndex: startIdx,
          fromLabel: schedule.timeSlots[startIdx] || `Slot ${startIdx + 1}`,
          sortie,
        });
      }
    }
  }
  return covered;
}

export function calcAircraftHours(
  aircraftId: string,
  grid: DaySchedule["grid"]
): { soloMin: number; dualMin: number } {
  const slots = grid[aircraftId] || {};
  let soloMin = 0;
  let dualMin = 0;
  for (const sortie of Object.values(slots)) {
    if (!sortie) continue;
    if (sortie.type === "SOLO") {
      soloMin += sortie.durationMin || 0;
    } else {
      dualMin += sortie.durationMin || 0;
    }
  }
  return { soloMin, dualMin };
}

export function calcScheduleTotals(
  schedule: DaySchedule,
  aircraft: Aircraft[]
): { totalSoloMin: number; totalDualMin: number; grandTotalMin: number; sortieCount: number } {
  let totalSoloMin = 0;
  let totalDualMin = 0;
  let sortieCount = 0;

  for (const ac of aircraft) {
    const slots = schedule.grid[ac.id] || {};
    for (const sortie of Object.values(slots)) {
      if (!sortie) continue;
      sortieCount += 1;
      if (sortie.type === "SOLO") totalSoloMin += sortie.durationMin || 0;
      else totalDualMin += sortie.durationMin || 0;
    }
  }

  return {
    totalSoloMin,
    totalDualMin,
    grandTotalMin: totalSoloMin + totalDualMin,
    sortieCount,
  };
}

export function calcStudentStats(
  schedule: DaySchedule
): Record<string, { sorties: number; totalMin: number }> {
  const stats: Record<string, { sorties: number; totalMin: number }> = {};
  for (const acSlots of Object.values(schedule.grid)) {
    for (const sortie of Object.values(acSlots || {})) {
      if (!sortie?.studentId) continue;
      if (!stats[sortie.studentId]) {
        stats[sortie.studentId] = { sorties: 0, totalMin: 0 };
      }
      stats[sortie.studentId].sorties += 1;
      stats[sortie.studentId].totalMin += sortie.durationMin || 0;
    }
  }
  return stats;
}

export function calcInstructorHours(
  schedule: DaySchedule
): Record<string, { sorties: number; totalMin: number }> {
  const stats: Record<string, { sorties: number; totalMin: number }> = {};
  for (const acSlots of Object.values(schedule.grid)) {
    for (const sortie of Object.values(acSlots || {})) {
      if (!sortie || sortie.type !== "DUAL" || !sortie.instructorId) continue;
      if (!stats[sortie.instructorId]) {
        stats[sortie.instructorId] = { sorties: 0, totalMin: 0 };
      }
      stats[sortie.instructorId].sorties += 1;
      stats[sortie.instructorId].totalMin += sortie.durationMin || 0;
    }
  }
  return stats;
}

export interface StudentFairnessStat {
  todaySorties: number;
  todayMin: number;
  recentSorties: number;
  recentMin: number;
  lastFlownDate: string | null;
}

export function calcFairnessStats(
  group: GroupData,
  activeDate: string
): Record<string, StudentFairnessStat> {
  const stats: Record<string, StudentFairnessStat> = {};
  for (const st of group.students) {
    stats[st.id] = {
      todaySorties: 0,
      todayMin: 0,
      recentSorties: 0,
      recentMin: 0,
      lastFlownDate: null,
    };
  }

  const activeMs = Date.parse(`${activeDate}T00:00:00Z`);
  const sevenDaysMs = 7 * 86400 * 1000;

  for (const [dateStr, sch] of Object.entries(group.schedules)) {
    const schMs = Date.parse(`${dateStr}T00:00:00Z`);
    const isToday = dateStr === activeDate;
    const isRecent =
      !Number.isNaN(activeMs) &&
      !Number.isNaN(schMs) &&
      schMs <= activeMs &&
      activeMs - schMs <= sevenDaysMs;

    for (const acSlots of Object.values(sch.grid || {})) {
      for (const sortie of Object.values(acSlots || {})) {
        if (!sortie?.studentId) continue;
        if (!stats[sortie.studentId]) {
          stats[sortie.studentId] = {
            todaySorties: 0,
            todayMin: 0,
            recentSorties: 0,
            recentMin: 0,
            lastFlownDate: null,
          };
        }
        const entry = stats[sortie.studentId];
        if (isToday) {
          entry.todaySorties += 1;
          entry.todayMin += sortie.durationMin || 0;
        }
        if (isRecent) {
          entry.recentSorties += 1;
          entry.recentMin += sortie.durationMin || 0;
        }
        if (!entry.lastFlownDate || dateStr > entry.lastFlownDate) {
          entry.lastFlownDate = dateStr;
        }
      }
    }
  }

  return stats;
}

export function formatSortieDisplay(
  sortie: Sortie,
  instructors: Instructor[],
  students: Student[],
  lang: ExportLang = "EN"
): { topLine: string; bottomLine: string } {
  const dur = formatDurationCompact(sortie.durationMin);
  const tagSuffix = sortie.tag ? ` ${sortie.tag}` : "";
  const stuObj = students.find((s) => s.id === sortie.studentId);
  const studentName =
    lang === "AR" ? stuObj?.nameAr || stuObj?.name || "" : stuObj?.name || "";

  if (sortie.type === "SOLO") {
    const label = studentName || (lang === "AR" ? "بدون طالب" : "UNASSIGNED");
    return {
      topLine: `${label} ${dur}${tagSuffix}`,
      bottomLine: lang === "AR" ? "Solo" : "SOLO",
    };
  }

  const inst = instructors.find((i) => i.id === sortie.instructorId);
  const instName =
    lang === "AR"
      ? inst?.shortNameAr || inst?.nameAr || inst?.shortName || inst?.name || "مدرب"
      : inst
      ? inst.shortName || inst.name
      : "Unassigned";
  return {
    topLine: `${instName} ${dur}${tagSuffix}`,
    bottomLine: studentName,
  };
}

interface PlacedSortie {
  aircraftId: string;
  acReg: string;
  slotIndex: number;
  slotLabel: string;
  sortie: Sortie;
  interval: { startMin: number; endMin: number };
}

export function detectConflicts(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[]
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const instMap = new Map(instructors.map((i) => [i.id, i]));
  const studMap = new Map(students.map((s) => [s.id, s]));

  const placed: PlacedSortie[] = [];

  for (const ac of aircraft) {
    const slots = schedule.grid[ac.id] || {};
    let acDayMin = 0;

    const acEntries = Object.entries(slots)
      .map(([slotStr, sortie]) => ({ slotIndex: Number(slotStr), sortie }))
      .filter((x) => Boolean(x.sortie))
      .sort((a, b) => a.slotIndex - b.slotIndex);

    for (const { slotIndex, sortie } of acEntries) {
      const slotLabel = schedule.timeSlots[slotIndex] || `Slot ${slotIndex + 1}`;
      const interval = getSortieInterval(schedule, slotIndex, sortie.durationMin);
      acDayMin += sortie.durationMin || 0;

      placed.push({
        aircraftId: ac.id,
        acReg: ac.registration,
        slotIndex,
        slotLabel,
        sortie,
        interval,
      });

      if (!ac.serviceable) {
        conflicts.push({
          id: `unsvc-${ac.id}-${slotIndex}`,
          severity: "error",
          aircraftId: ac.id,
          slotIndex,
          message: `${ac.registration} (${slotLabel}) is Unserviceable but has a sortie scheduled.`,
        });
      }

      if (!sortie.studentId) {
        conflicts.push({
          id: `missing-stud-${ac.id}-${slotIndex}`,
          severity: "warning",
          aircraftId: ac.id,
          slotIndex,
          message: `${ac.registration} (${slotLabel}) is missing a student assignment.`,
        });
      } else {
        const student = studMap.get(sortie.studentId);
        if (student && !student.fit) {
          conflicts.push({
            id: `unfit-stud-${ac.id}-${slotIndex}`,
            severity: "error",
            aircraftId: ac.id,
            slotIndex,
            message: `Student ${student.name} on ${ac.registration} (${slotLabel}) is marked Unfit.`,
          });
        }
        const visCheck = isPplVfrVisibilityViolation(schedule, slotIndex, sortie, student);
        if (visCheck.violated && visCheck.visKm !== null && student) {
          conflicts.push({
            id: `ppl-vis-${ac.id}-${slotIndex}`,
            severity: "error",
            aircraftId: ac.id,
            slotIndex,
            message: `PPL VFR Restriction (HEAT): ${student.name} cannot fly VFR on ${ac.registration} (${slotLabel}) — visibility ${visCheck.visKm.toFixed(1)} km is below 5.0 km minimum.`,
          });
        }
      }

      if (sortie.type === "DUAL") {
        if (!sortie.instructorId) {
          conflicts.push({
            id: `missing-inst-${ac.id}-${slotIndex}`,
            severity: "warning",
            aircraftId: ac.id,
            slotIndex,
            message: `${ac.registration} (${slotLabel}) Dual sortie is missing an instructor.`,
          });
        } else {
          const inst = instMap.get(sortie.instructorId);
          if (inst && !inst.fit) {
            conflicts.push({
              id: `unfit-inst-${ac.id}-${slotIndex}`,
              severity: "error",
              aircraftId: ac.id,
              slotIndex,
              message: `Instructor ${inst.name} on ${ac.registration} (${slotLabel}) is marked Unfit.`,
            });
          }
        }
      }
    }

    // Aircraft inspection countdown check
    if (ac.hoursToInspection !== undefined && acDayMin > 0) {
      const remainingAfter = ac.hoursToInspection - acDayMin / 60;
      const firstSlot = acEntries[0]?.slotIndex ?? 0;
      if (remainingAfter < 0) {
        conflicts.push({
          id: `insp-over-${ac.id}`,
          severity: "error",
          aircraftId: ac.id,
          slotIndex: firstSlot,
          message: `${ac.registration} exceeds its ${ac.inspectionType || "50-Hr"} inspection by ${Math.abs(remainingAfter).toFixed(1)}h (${ac.hoursToInspection.toFixed(1)}h remaining).`,
        });
      } else if (remainingAfter < 5) {
        conflicts.push({
          id: `insp-warn-${ac.id}`,
          severity: "warning",
          aircraftId: ac.id,
          slotIndex: firstSlot,
          message: `${ac.registration} will have only ${remainingAfter.toFixed(1)}h left before ${ac.inspectionType || "50-Hr"} inspection after today's flights.`,
        });
      }
    }
  }

  // Pairwise true time-span overlap checks
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      if (!intervalsOverlap(a.interval, b.interval)) continue;

      // 1. Same aircraft time overlap
      if (a.aircraftId === b.aircraftId) {
        conflicts.push({
          id: `ac-ov-${a.aircraftId}-${a.slotIndex}-${b.slotIndex}`,
          severity: "error",
          aircraftId: b.aircraftId,
          slotIndex: b.slotIndex,
          message: `${a.acReg} time overlap: ${a.slotLabel} (${formatDurationCompact(a.sortie.durationMin)}, ends ${formatMinutesAsClock(a.interval.endMin)}) overlaps ${b.slotLabel}.`,
        });
      }

      // 2. Same student overlap across aircraft
      if (a.sortie.studentId && a.sortie.studentId === b.sortie.studentId) {
        const sName = studMap.get(a.sortie.studentId)?.name || a.sortie.studentId;
        conflicts.push({
          id: `stu-ov-${a.sortie.studentId}-${a.slotIndex}-${b.slotIndex}`,
          severity: "error",
          aircraftId: b.aircraftId,
          slotIndex: b.slotIndex,
          message: `Student overlap: ${sName} on ${a.acReg} (${a.slotLabel}) & ${b.acReg} (${b.slotLabel}).`,
        });
      }

      // 3. Same instructor overlap across aircraft
      if (
        a.sortie.type === "DUAL" &&
        b.sortie.type === "DUAL" &&
        a.sortie.instructorId &&
        a.sortie.instructorId === b.sortie.instructorId
      ) {
        const iName = instMap.get(a.sortie.instructorId)?.name || a.sortie.instructorId;
        conflicts.push({
          id: `inst-ov-${a.sortie.instructorId}-${a.slotIndex}-${b.slotIndex}`,
          severity: "error",
          aircraftId: b.aircraftId,
          slotIndex: b.slotIndex,
          message: `Instructor overlap: ${iName} on ${a.acReg} (${a.slotLabel}) & ${b.acReg} (${b.slotLabel}).`,
        });
      }
    }
  }

  // Instructor daily duty hour limits
  const instHours = calcInstructorHours(schedule);
  for (const inst of instructors) {
    const stat = instHours[inst.id];
    if (!stat) continue;
    const warnLimit = inst.maxDailyMin ?? 360;
    const errLimit = Math.max(warnLimit + 120, 480);
    if (stat.totalMin > errLimit || stat.totalMin > warnLimit) {
      const sample = placed.find(
        (p) => p.sortie.type === "DUAL" && p.sortie.instructorId === inst.id
      );
      if (stat.totalMin > errLimit) {
        conflicts.push({
          id: `inst-max-${inst.id}`,
          severity: "error",
          aircraftId: sample?.aircraftId || aircraft[0]?.id || "",
          slotIndex: sample?.slotIndex ?? 0,
          message: `${inst.name} has ${formatDurationCompact(stat.totalMin)} dual today (exceeds ${formatDurationCompact(errLimit)} max limit).`,
        });
      } else {
        conflicts.push({
          id: `inst-warn-${inst.id}`,
          severity: "warning",
          aircraftId: sample?.aircraftId || aircraft[0]?.id || "",
          slotIndex: sample?.slotIndex ?? 0,
          message: `${inst.name} has ${formatDurationCompact(stat.totalMin)} dual today (exceeds ${formatDurationCompact(warnLimit)} duty target).`,
        });
      }
    }
  }

  return conflicts;
}

export function canPlaceSortie(
  schedule: DaySchedule,
  targetAcId: string,
  targetSlotIndex: number,
  candidate: Sortie,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  ignoreCell?: { aircraftId: string; slotIndex: number }
): string[] {
  const reasons: string[] = [];
  const targetAc = aircraft.find((a) => a.id === targetAcId);
  if (targetAc && !targetAc.serviceable) {
    reasons.push(`${targetAc.registration} is marked Unserviceable.`);
  }

  const candInterval = getSortieInterval(schedule, targetSlotIndex, candidate.durationMin);
  const studMap = new Map(students.map((s) => [s.id, s]));
  const instMap = new Map(instructors.map((i) => [i.id, i]));
  const acMap = new Map(aircraft.map((a) => [a.id, a]));

  if (candidate.studentId) {
    const stu = studMap.get(candidate.studentId);
    if (stu && !stu.fit) reasons.push(`Student ${stu.name} is Unfit.`);
    const visCheck = isPplVfrVisibilityViolation(schedule, targetSlotIndex, candidate, stu);
    if (visCheck.violated && visCheck.visKm !== null && stu) {
      reasons.push(
        `PPL VFR Restriction (HEAT): ${stu.name} cannot fly VFR when visibility is ${visCheck.visKm.toFixed(1)} km (< 5.0 km minimum).`
      );
    }
  }
  if (candidate.type === "DUAL" && candidate.instructorId) {
    const inst = instMap.get(candidate.instructorId);
    if (inst && !inst.fit) reasons.push(`Instructor ${inst.name} is Unfit.`);
  }

  for (const [acId, slots] of Object.entries(schedule.grid)) {
    const acReg = acMap.get(acId)?.registration || acId;
    for (const [slotStr, other] of Object.entries(slots || {})) {
      const sIdx = Number(slotStr);
      if (!other) continue;
      if (ignoreCell && ignoreCell.aircraftId === acId && ignoreCell.slotIndex === sIdx) continue;
      const otherInt = getSortieInterval(schedule, sIdx, other.durationMin);
      if (!intervalsOverlap(candInterval, otherInt)) continue;
      const sLbl = schedule.timeSlots[sIdx] || `Slot ${sIdx + 1}`;

      if (acId === targetAcId) {
        reasons.push(`Aircraft ${acReg} already has a flight (${sLbl}, ${formatDurationCompact(other.durationMin)}) overlapping this time.`);
      }
      if (candidate.studentId && other.studentId === candidate.studentId) {
        const sName = studMap.get(candidate.studentId)?.name || "Student";
        reasons.push(`${sName} is already flying on ${acReg} at ${sLbl}.`);
      }
      if (
        candidate.type === "DUAL" &&
        other.type === "DUAL" &&
        candidate.instructorId &&
        other.instructorId === candidate.instructorId
      ) {
        const iName = instMap.get(candidate.instructorId)?.name || "Instructor";
        reasons.push(`${iName} is already flying on ${acReg} at ${sLbl}.`);
      }
    }
  }

  return reasons;
}

export interface ReassignmentMove {
  sourceAcId: string;
  sourceAcReg: string;
  sourceSlotIndex: number;
  targetAcId: string | null;
  targetAcReg: string | null;
  targetSlotIndex: number | null;
  sortie: Sortie;
}

export function calcReassignmentPlan(
  schedule: DaySchedule,
  sourceAcId: string,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[]
): ReassignmentMove[] {
  const sourceAc = aircraft.find((a) => a.id === sourceAcId);
  const sourceSlots = schedule.grid[sourceAcId] || {};
  const entries = Object.entries(sourceSlots)
    .map(([k, v]) => ({ slotIndex: Number(k), sortie: v }))
    .filter((x) => Boolean(x.sortie))
    .sort((a, b) => a.slotIndex - b.slotIndex);

  // Simulate moving sequentially on a cloned grid
  const tempSchedule: DaySchedule = structuredClone(schedule);
  const moves: ReassignmentMove[] = [];

  for (const { slotIndex, sortie } of entries) {
    let assignedAc: Aircraft | null = null;
    let assignedSlot: number | null = null;

    // Prefer same slot on another serviceable aircraft first, then nearest slot
    const slotOrder = [
      slotIndex,
      ...Array.from({ length: schedule.timeSlots.length }, (_, i) => i).filter((i) => i !== slotIndex),
    ];

    outer: for (const candidateSlot of slotOrder) {
      if (!schedule.timeSlots[candidateSlot] && candidateSlot !== slotIndex) continue;
      for (const candidateAc of aircraft) {
        if (candidateAc.id === sourceAcId || !candidateAc.serviceable) continue;
        if (candidateAc.registration.toUpperCase() === "EXTRA") continue;
        if (tempSchedule.grid[candidateAc.id]?.[candidateSlot]) continue;

        const errs = canPlaceSortie(
          tempSchedule,
          candidateAc.id,
          candidateSlot,
          sortie,
          instructors,
          students,
          aircraft,
          { aircraftId: sourceAcId, slotIndex }
        );
        if (errs.length === 0) {
          assignedAc = candidateAc;
          assignedSlot = candidateSlot;
          break outer;
        }
      }
    }

    if (assignedAc && assignedSlot !== null) {
      if (!tempSchedule.grid[assignedAc.id]) tempSchedule.grid[assignedAc.id] = {};
      tempSchedule.grid[assignedAc.id][assignedSlot] = { ...sortie };
      delete tempSchedule.grid[sourceAcId]?.[slotIndex];
    }

    moves.push({
      sourceAcId,
      sourceAcReg: sourceAc?.registration || sourceAcId,
      sourceSlotIndex: slotIndex,
      targetAcId: assignedAc?.id ?? null,
      targetAcReg: assignedAc?.registration ?? null,
      targetSlotIndex: assignedSlot,
      sortie,
    });
  }

  return moves;
}

export interface RangeAnalytics {
  dayCount: number;
  totalSorties: number;
  totalSoloMin: number;
  totalDualMin: number;
  studentRows: {
    id: string;
    name: string;
    program: string;
    dualMin: number;
    soloMin: number;
    irMin: number;
    sorties: number;
    noShows: number;
  }[];
  instructorRows: {
    id: string;
    name: string;
    dualMin: number;
    sorties: number;
  }[];
  aircraftRows: {
    id: string;
    registration: string;
    soloMin: number;
    dualMin: number;
    sorties: number;
    hoursToInspection?: number;
  }[];
  noShows: GroupData["noShows"];
}

export function calcRangeAnalytics(
  group: GroupData,
  startDate?: string,
  endDate?: string
): RangeAnalytics {
  const sMap = new Map(
    group.students.map((st) => [
      st.id,
      {
        id: st.id,
        name: st.name,
        program: st.program,
        dualMin: 0,
        soloMin: 0,
        irMin: 0,
        sorties: 0,
        noShows: 0,
      },
    ])
  );
  const iMap = new Map(
    group.instructors.map((inst) => [
      inst.id,
      { id: inst.id, name: inst.name, dualMin: 0, sorties: 0 },
    ])
  );
  const aMap = new Map(
    group.aircraft.map((ac) => [
      ac.id,
      {
        id: ac.id,
        registration: ac.registration,
        soloMin: 0,
        dualMin: 0,
        sorties: 0,
        hoursToInspection: ac.hoursToInspection,
      },
    ])
  );

  let dayCount = 0;
  let totalSorties = 0;
  let totalSoloMin = 0;
  let totalDualMin = 0;

  for (const [dateStr, sch] of Object.entries(group.schedules)) {
    if (startDate && dateStr < startDate) continue;
    if (endDate && dateStr > endDate) continue;
    dayCount += 1;

    for (const [acId, slots] of Object.entries(sch.grid || {})) {
      const acRow = aMap.get(acId);
      for (const sortie of Object.values(slots || {})) {
        if (!sortie) continue;
        const mins = sortie.durationMin || 0;
        totalSorties += 1;
        if (sortie.type === "SOLO") totalSoloMin += mins;
        else totalDualMin += mins;

        if (acRow) {
          acRow.sorties += 1;
          if (sortie.type === "SOLO") acRow.soloMin += mins;
          else acRow.dualMin += mins;
        }

        if (sortie.studentId && sMap.has(sortie.studentId)) {
          const stRow = sMap.get(sortie.studentId)!;
          stRow.sorties += 1;
          if (sortie.type === "SOLO") stRow.soloMin += mins;
          else stRow.dualMin += mins;
          if (sortie.tag === "IR") stRow.irMin += mins;
        }

        if (sortie.type === "DUAL" && sortie.instructorId && iMap.has(sortie.instructorId)) {
          const iRow = iMap.get(sortie.instructorId)!;
          iRow.sorties += 1;
          iRow.dualMin += mins;
        }
      }
    }
  }

  const filteredNoShows = group.noShows.filter((ns) => {
    if (startDate && ns.date < startDate) return false;
    if (endDate && ns.date > endDate) return false;
    return true;
  });

  for (const ns of filteredNoShows) {
    const stRow = sMap.get(ns.studentId);
    if (stRow) stRow.noShows += 1;
  }

  return {
    dayCount,
    totalSorties,
    totalSoloMin,
    totalDualMin,
    studentRows: Array.from(sMap.values()),
    instructorRows: Array.from(iMap.values()),
    aircraftRows: Array.from(aMap.values()),
    noShows: filteredNoShows,
  };
}
