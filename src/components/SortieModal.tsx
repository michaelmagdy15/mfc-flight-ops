import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import {
  Aircraft,
  DaySchedule,
  GroupData,
  Instructor,
  Sortie,
  SortieType,
  Student,
  StudentProgram,
} from "../types";
import {
  calcFairnessStats,
  calcInstructorHours,
  canPlaceSortie,
  formatDurationCompact,
  getSlotVisibilityKm,
  PPL_MIN_VFR_VISIBILITY_KM,
} from "../utils/calculations";

interface SortieModalProps {
  aircraft: Aircraft;
  slotIndex: number;
  schedule: DaySchedule;
  group: GroupData;
  instructors: Instructor[];
  students: Student[];
  allAircraft: Aircraft[];
  existingSortie?: Sortie;
  onSave: (sortie: Sortie) => void;
  onClear: () => void;
  onClose: () => void;
  onStartMove?: () => void;
  onQuickAddStudent: (name: string, program: StudentProgram) => Student;
  onUpdateStudentProgram?: (studentId: string, program: StudentProgram) => void;
  onNoShowSwap: (absentStudentId: string, replacementStudentId: string) => void;
}

const DURATION_PRESETS = [30, 60, 90, 120, 150, 180];
const TAG_OPTIONS = ["", "IR", "XC", "NVFR", "CHECK"];

export const SortieModal: React.FC<SortieModalProps> = ({
  aircraft,
  slotIndex,
  schedule,
  group,
  instructors,
  students,
  allAircraft,
  existingSortie,
  onSave,
  onClear,
  onClose,
  onStartMove,
  onQuickAddStudent,
  onUpdateStudentProgram,
  onNoShowSwap,
}) => {
  const [type, setType] = useState<SortieType>(existingSortie?.type ?? "DUAL");
  const [instructorId, setInstructorId] = useState<string>(
    existingSortie?.instructorId ?? instructors[0]?.id ?? ""
  );
  const [studentId, setStudentId] = useState<string>(existingSortie?.studentId ?? "");
  const [durationMin, setDurationMin] = useState<number>(existingSortie?.durationMin ?? 60);
  const [tag, setTag] = useState<string>(existingSortie?.tag ?? "");
  const [studentQuery, setStudentQuery] = useState("");
  const [fairnessSort, setFairnessSort] = useState(true);

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newStuName, setNewStuName] = useState("");
  const [newStuProg, setNewStuProg] = useState<StudentProgram>("PPL");

  const [showNoShowDrawer, setShowNoShowDrawer] = useState(false);

  const fairnessStats = useMemo(
    () => calcFairnessStats(group, schedule.date),
    [group, schedule.date]
  );
  const instructorHours = useMemo(() => calcInstructorHours(schedule), [schedule]);
  const slotTime = schedule.timeSlots[slotIndex] || `Slot ${slotIndex + 1}`;
  const slotVisKm = useMemo(
    () => getSlotVisibilityKm(schedule, slotIndex, Math.max(15, durationMin || 60)),
    [schedule, slotIndex, durationMin]
  );

  const minRecentMin = useMemo(() => {
    const vals = students.filter((s) => s.fit).map((s) => fairnessStats[s.id]?.recentMin ?? 0);
    return vals.length > 0 ? Math.min(...vals) : 0;
  }, [students, fairnessStats]);

  const orderedStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    const filtered = q
      ? students.filter(
          (s) => s.name.toLowerCase().includes(q) || s.program.toLowerCase().includes(q)
        )
      : [...students];

    if (!fairnessSort) return filtered;

    return filtered.sort((a, b) => {
      if (a.fit !== b.fit) return a.fit ? -1 : 1;
      const fa = fairnessStats[a.id]?.recentMin ?? 0;
      const fb = fairnessStats[b.id]?.recentMin ?? 0;
      if (fa !== fb) return fa - fb;
      return (fairnessStats[a.id]?.todayMin ?? 0) - (fairnessStats[b.id]?.todayMin ?? 0);
    });
  }, [students, studentQuery, fairnessSort, fairnessStats]);

  const liveWarnings = useMemo(() => {
    const candidate: Sortie = {
      id: existingSortie?.id || "probe",
      type,
      instructorId: type === "DUAL" ? instructorId : undefined,
      studentId: studentId || undefined,
      durationMin: Math.max(15, durationMin || 60),
      tag: tag || undefined,
    };
    const warnings = canPlaceSortie(
      schedule,
      aircraft.id,
      slotIndex,
      candidate,
      instructors,
      students,
      allAircraft,
      { aircraftId: aircraft.id, slotIndex }
    );

    if (type === "DUAL" && instructorId) {
      const inst = instructors.find((i) => i.id === instructorId);
      const prevDual = instructorHours[instructorId]?.totalMin ?? 0;
      const existingSameInstMin =
        existingSortie?.type === "DUAL" && existingSortie.instructorId === instructorId
          ? existingSortie.durationMin
          : 0;
      const projected = prevDual - existingSameInstMin + candidate.durationMin;
      const limit = inst?.maxDailyMin ?? 360;
      if (projected > limit) {
        warnings.push(
          `${inst?.name || "Instructor"} projected dual hours today: ${formatDurationCompact(projected)} (limit ${formatDurationCompact(limit)}).`
        );
      }
    }

    if (aircraft.hoursToInspection !== undefined) {
      const currentAcMin = Object.entries(schedule.grid[aircraft.id] || {}).reduce(
        (acc, [k, s]) => (Number(k) === slotIndex || !s ? acc : acc + (s.durationMin || 0)),
        0
      );
      const remainingAfter = aircraft.hoursToInspection - (currentAcMin + candidate.durationMin) / 60;
      if (remainingAfter < 0) {
        warnings.push(
          `${aircraft.registration} would exceed ${aircraft.inspectionType || "50-Hr"} inspection by ${Math.abs(remainingAfter).toFixed(1)}h.`
        );
      }
    }

    return warnings;
  }, [
    existingSortie,
    type,
    instructorId,
    studentId,
    durationMin,
    tag,
    schedule,
    aircraft,
    slotIndex,
    instructors,
    students,
    allAircraft,
    instructorHours,
  ]);

  const standbyStudents = useMemo(() => {
    const sbIds = new Set(schedule.standby.map((sb) => sb.studentId));
    return schedule.standby
      .map((sb) => ({
        sb,
        student: students.find((s) => s.id === sb.studentId),
      }))
      .filter((x): x is { sb: (typeof schedule.standby)[number]; student: Student } => Boolean(x.student))
      .concat(
        students
          .filter((s) => s.fit && !sbIds.has(s.id) && s.id !== existingSortie?.studentId)
          .slice(0, 8)
          .map((s) => ({
            sb: { id: `other-${s.id}`, studentId: s.id, highlight: false },
            student: s,
          }))
      );
  }, [schedule.standby, students, existingSortie?.studentId]);

  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newStuName.trim();
    if (!trimmed) return;
    const created = onQuickAddStudent(trimmed, newStuProg);
    setStudentId(created.id);
    setNewStuName("");
    setShowQuickAdd(false);
  };

  const handleSave = () => {
    onSave({
      id: existingSortie?.id || `sortie-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      instructorId: type === "DUAL" ? instructorId : undefined,
      studentId: studentId || undefined,
      durationMin: Math.max(15, durationMin || 60),
      tag: tag || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-xs sm:items-center sm:p-3"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-slate-200 bg-[#1B365D] px-4 pb-3 pt-2 text-white sm:px-5 sm:py-3.5">
          <div className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-white/35 sm:hidden" />
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-xs font-bold tracking-wide">
                  {aircraft.registration}
                </span>
                <span className="text-sm font-semibold text-blue-100">
                  Slot {slotIndex + 1}: {slotTime}
                </span>
              </div>
              <h3 className="mt-0.5 text-base font-bold">
                {existingSortie ? "Edit Sortie" : "Schedule Sortie"}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sortie editor"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-blue-100 hover:bg-white/15 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {slotVisKm !== null && (
            <div
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-bold ${
                slotVisKm < PPL_MIN_VFR_VISIBILITY_KM
                  ? "border-red-300 bg-red-50 text-[#C00000]"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <span>
                {slotVisKm < PPL_MIN_VFR_VISIBILITY_KM
                  ? `HEAT Visibility ${slotVisKm.toFixed(1)} km — Below 5.0 km PPL VFR Minimum! (IR flights only)`
                  : `HEAT Visibility ${slotVisKm.toFixed(1)} km — VFR OK for PPL (≥ 5.0 km min)`}
              </span>
              <span className="font-mono text-[11px]">HEAT</span>
            </div>
          )}

          {/* Dual vs Solo Toggle */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Flight Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("DUAL")}
                className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
                  type === "DUAL"
                    ? "border-[#1B365D] bg-[#1B365D] text-white shadow-xs"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                DUAL (Instructor + Student)
              </button>
              <button
                type="button"
                onClick={() => setType("SOLO")}
                className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
                  type === "SOLO"
                    ? "border-[#C00000] bg-[#C00000] text-white shadow-xs"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-red-50 hover:text-[#C00000]"
                }`}
              >
                SOLO (Student Only)
              </button>
            </div>
          </div>

          {/* 1-Tap NO SHOW -> Swap from Standby */}
          {existingSortie?.studentId && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#C00000]">
                  <UserX className="h-4 w-4" />
                  <span>
                    Absent / NO SHOW? (
                    {students.find((s) => s.id === existingSortie.studentId)?.name || "Student"})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNoShowDrawer((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-md bg-[#C00000] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#9E0000]"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  {showNoShowDrawer ? "Hide Swap" : "NO SHOW → Swap Standby"}
                </button>
              </div>
              {showNoShowDrawer && (
                <div className="mt-2.5 space-y-1.5 border-t border-red-200 pt-2">
                  <div className="text-[11px] font-semibold text-slate-700">
                    Tap a replacement student (Standby students listed first) to log NO SHOW &amp; swap in 1 click:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {standbyStudents.map(({ sb, student }) => {
                      const isStandby = !sb.id.startsWith("other-");
                      return (
                        <button
                          key={sb.id}
                          type="button"
                          onClick={() => onNoShowSwap(existingSortie.studentId!, student.id)}
                          className={`rounded-md border px-2 py-1 text-[11px] font-bold transition ${
                            isStandby
                              ? "border-blue-300 bg-blue-50 text-[#1B365D] hover:bg-[#1B365D] hover:text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {isStandby ? "⏳ " : ""}
                          {student.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Instructor Selector */}
          {type === "DUAL" && (
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Instructor (Pilot)
              </label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {instructors.map((inst) => {
                  const dualMin = instructorHours[inst.id]?.totalMin ?? 0;
                  return (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => setInstructorId(inst.id)}
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition ${
                        instructorId === inst.id
                          ? "border-[#1B365D] bg-blue-50 text-[#1B365D] ring-1 ring-[#1B365D]"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="truncate">{inst.shortName || inst.name}</span>
                      <span className="ml-1 shrink-0 rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-600">
                        {formatDurationCompact(dualMin)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Student Selector + Program Switch + Fairness Sort + Quick Add */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Student
                </label>
                {(() => {
                  const selectedStu = students.find((s) => s.id === studentId);
                  if (!selectedStu || !onUpdateStudentProgram) return null;
                  return (
                    <div
                      role="group"
                      aria-label="Selected student program"
                      className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5"
                    >
                      <button
                        type="button"
                        onClick={() => onUpdateStudentProgram(selectedStu.id, "PPL")}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold transition ${
                          selectedStu.program === "PPL"
                            ? "bg-[#1B365D] text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        PPL
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateStudentProgram(selectedStu.id, "IRCPL")}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold transition ${
                          selectedStu.program === "IRCPL"
                            ? "bg-[#C00000] text-white"
                            : "text-slate-600 hover:text-[#C00000]"
                        }`}
                      >
                        IRCPL
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFairnessSort((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold transition ${
                    fairnessSort
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  {fairnessSort ? "Needs Flight First" : "Roster Order"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd((v) => !v)}
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold text-[#1B365D] hover:bg-blue-50"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {showQuickAdd ? "Cancel" : "+ Quick Add"}
                </button>
              </div>
            </div>

            {showQuickAdd && (
              <form
                onSubmit={handleQuickAddSubmit}
                className="mb-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 p-2.5"
              >
                <input
                  type="text"
                  value={newStuName}
                  onChange={(e) => setNewStuName(e.target.value)}
                  placeholder="New student full name..."
                  className="min-w-[160px] flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-base focus:border-[#1B365D] focus:outline-none sm:text-xs"
                />
                <select
                  value={newStuProg}
                  onChange={(e) => setNewStuProg(e.target.value as StudentProgram)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold"
                >
                  <option value="PPL">PPL</option>
                  <option value="IRCPL">IRCPL</option>
                </select>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-md bg-[#1B365D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#142947]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add &amp; Select
                </button>
              </form>
            )}

            <input
              type="text"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Search student by name..."
              className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-[#1B365D] focus:outline-none sm:py-1.5 sm:text-sm"
            />

            <div className="max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setStudentId("")}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs ${
                  studentId === "" ? "bg-slate-100 font-bold text-slate-900" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <span>— Unassigned / Leave Student Blank —</span>
                {studentId === "" && <Check className="h-3.5 w-3.5 text-[#1B365D]" />}
              </button>
              {orderedStudents.map((stu) => {
                const stStat = fairnessStats[stu.id];
                const selected = studentId === stu.id;
                const needsFlight = stu.fit && (stStat?.recentMin ?? 0) <= minRecentMin;
                return (
                  <button
                    key={stu.id}
                    type="button"
                    onClick={() => setStudentId(stu.id)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition ${
                      selected ? "bg-blue-50 font-bold text-[#1B365D]" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          stu.program === "IRCPL"
                            ? "bg-red-100 text-[#C00000]"
                            : "bg-slate-200 text-slate-800"
                        }`}
                      >
                        {stu.program}
                      </span>
                      <span className={`truncate ${stu.fit ? "text-slate-900" : "text-slate-400 line-through"}`}>
                        {stu.name}
                      </span>
                      {needsFlight && (
                        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
                          Needs flight
                        </span>
                      )}
                      {!stu.fit && (
                        <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">
                          Unfit
                        </span>
                      )}
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-1.5">
                      {stStat && stStat.todaySorties > 0 && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-[#1B365D]">
                          Today: {stStat.todaySorties}x
                        </span>
                      )}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        7d: {formatDurationCompact(stStat?.recentMin ?? 0)}
                      </span>
                      {selected && <Check className="h-3.5 w-3.5 text-[#1B365D]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration & Tag */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Duration
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationMin(mins)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-bold transition ${
                      durationMin === mins
                        ? "border-[#1B365D] bg-[#1B365D] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {formatDurationCompact(mins)}
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={15}
                    max={480}
                    step={15}
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-base font-bold text-slate-800 sm:text-xs"
                  />
                  <span className="text-[11px] text-slate-500">min</span>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Phase / Tag
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TAG_OPTIONS.map((t) => (
                  <button
                    key={t || "none"}
                    type="button"
                    onClick={() => setTag(t)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-bold transition ${
                      tag === t
                        ? "border-[#1B365D] bg-[#1B365D] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {t || "Standard"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Warnings */}
          {liveWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="mb-1 flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                Time-Span Conflict / Readiness Warning
              </div>
              <ul className="list-disc space-y-0.5 pl-4">
                {liveWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-3">
          {existingSortie ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClear}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-[#C00000] hover:bg-red-50 sm:min-h-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
              {onStartMove && (
                <button
                  type="button"
                  onClick={onStartMove}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#1B365D] hover:bg-blue-100 sm:min-h-0"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Move / Swap Slot
                </button>
              )}
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 sm:min-h-0"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="min-h-[42px] rounded-lg bg-[#1B365D] px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#142947] sm:min-h-0"
            >
              Save Sortie
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
