import { DaySchedule, GroupData, Sortie } from "../types";
import { createBlankSchedule } from "../data/seedData";
import { calcFairnessStats, canPlaceSortie } from "./calculations";

/**
 * Generates a balanced, conflict-free draft schedule for `targetDate`.
 * Prioritizes Fit students with the fewest recent hours (7-day fairness),
 * rotates Fit instructors within daily limits, and respects serviceable
 * aircraft and inspection countdown limits.
 */
export function autoDraftSchedule(
  group: GroupData,
  targetDate: string,
  baseSchedule?: DaySchedule
): DaySchedule {
  const draft: DaySchedule = baseSchedule
    ? { ...structuredClone(baseSchedule), date: targetDate, grid: {}, standby: [] }
    : createBlankSchedule(targetDate, group);

  const fitStudents = group.students.filter((s) => s.fit);
  const fitInstructors = group.instructors.filter((i) => i.fit);
  const flyableAircraft = group.aircraft.filter(
    (a) =>
      a.serviceable &&
      a.registration.toUpperCase() !== "EXTRA" &&
      (a.hoursToInspection === undefined || a.hoursToInspection >= 2)
  );

  if (fitStudents.length === 0 || flyableAircraft.length === 0) {
    return draft;
  }

  const fairness = calcFairnessStats(group, targetDate);
  // Sort students ascending by recent hours -> fewest flights first
  const orderedStudents = [...fitStudents].sort((a, b) => {
    const fa = fairness[a.id]?.recentMin ?? 0;
    const fb = fairness[b.id]?.recentMin ?? 0;
    if (fa !== fb) return fa - fb;
    return (fairness[a.id]?.recentSorties ?? 0) - (fairness[b.id]?.recentSorties ?? 0);
  });

  const assignedTodayCount = new Map<string, number>();
  const instAssignedMin = new Map<string, number>();
  const acAssignedMin = new Map<string, number>();
  const usedStudents = new Set<string>();

  // Fill morning & afternoon wave slots (skip empty/blank slot labels, target up to 5 sorties/plane)
  const activeSlotIndices = draft.timeSlots
    .map((lbl, idx) => ({ lbl: lbl.trim(), idx }))
    .filter((x) => x.lbl.length > 0)
    .slice(0, 7)
    .map((x) => x.idx);

  let studentCursor = 0;

  for (const sIdx of activeSlotIndices) {
    for (const ac of flyableAircraft) {
      if (studentCursor >= orderedStudents.length) break;

      // Respect inspection countdown if set
      const usedAcHrs = (acAssignedMin.get(ac.id) ?? 0) / 60;
      if (ac.hoursToInspection !== undefined && ac.hoursToInspection - usedAcHrs < 1.5) {
        continue;
      }

      // Pick next unscheduled student (fallback to round-robin if all have 1 flight)
      let pickedStudent = orderedStudents[studentCursor];
      let attempts = 0;
      while (attempts < orderedStudents.length) {
        const candidateStu = orderedStudents[(studentCursor + attempts) % orderedStudents.length];
        if ((assignedTodayCount.get(candidateStu.id) ?? 0) === 0) {
          pickedStudent = candidateStu;
          studentCursor = (studentCursor + attempts + 1) % orderedStudents.length;
          break;
        }
        attempts++;
      }
      if (attempts >= orderedStudents.length) {
        pickedStudent = orderedStudents[studentCursor % orderedStudents.length];
        studentCursor = (studentCursor + 1) % orderedStudents.length;
      }

      // Alternate Dual (with least-loaded fit instructor) and Solo (~35% solo)
      const wantSolo = fitInstructors.length === 0 || (sIdx + flyableAircraft.indexOf(ac)) % 3 === 1;
      let chosenInstId: string | undefined;

      if (!wantSolo) {
        const sortedInsts = [...fitInstructors].sort(
          (a, b) => (instAssignedMin.get(a.id) ?? 0) - (instAssignedMin.get(b.id) ?? 0)
        );
        for (const inst of sortedInsts) {
          const maxMin = inst.maxDailyMin ?? 360;
          if ((instAssignedMin.get(inst.id) ?? 0) + 60 > maxMin) continue;
          const probe: Sortie = {
            id: `draft-${ac.id}-${sIdx}`,
            type: "DUAL",
            instructorId: inst.id,
            studentId: pickedStudent.id,
            durationMin: 60,
          };
          if (
            canPlaceSortie(
              draft,
              ac.id,
              sIdx,
              probe,
              group.instructors,
              group.students,
              group.aircraft
            ).length === 0
          ) {
            chosenInstId = inst.id;
            break;
          }
        }
      }

      const sortie: Sortie = chosenInstId
        ? {
            id: `draft-${ac.id}-${sIdx}-${Date.now().toString(36)}`,
            type: "DUAL",
            instructorId: chosenInstId,
            studentId: pickedStudent.id,
            durationMin: 60,
          }
        : {
            id: `draft-${ac.id}-${sIdx}-${Date.now().toString(36)}`,
            type: "SOLO",
            studentId: pickedStudent.id,
            durationMin: 60,
          };

      if (
        canPlaceSortie(
          draft,
          ac.id,
          sIdx,
          sortie,
          group.instructors,
          group.students,
          group.aircraft
        ).length === 0
      ) {
        if (!draft.grid[ac.id]) draft.grid[ac.id] = {};
        draft.grid[ac.id][sIdx] = sortie;
        assignedTodayCount.set(pickedStudent.id, (assignedTodayCount.get(pickedStudent.id) ?? 0) + 1);
        usedStudents.add(pickedStudent.id);
        acAssignedMin.set(ac.id, (acAssignedMin.get(ac.id) ?? 0) + 60);
        if (sortie.type === "DUAL" && sortie.instructorId) {
          instAssignedMin.set(sortie.instructorId, (instAssignedMin.get(sortie.instructorId) ?? 0) + 60);
        }
      }
    }
  }

  // Fill up to 5 Standby students from fit students who didn't get a flight today
  const standbyCandidates = orderedStudents.filter((s) => !usedStudents.has(s.id)).slice(0, 5);
  draft.standby = standbyCandidates.map((s, idx) => ({
    id: `sb-draft-${idx}-${Date.now().toString(36)}`,
    studentId: s.id,
    highlight: false,
  }));

  return draft;
}
