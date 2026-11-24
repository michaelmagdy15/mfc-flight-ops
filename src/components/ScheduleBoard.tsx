import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Eye,
  GripVertical,
  LayoutGrid,
  LayoutList,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Undo2,
  Wrench,
  X,
} from "lucide-react";
import {
  Aircraft,
  DaySchedule,
  GroupData,
  Instructor,
  NoShowEntry,
  Sortie,
  Student,
  StudentProgram,
} from "../types";
import {
  calcAircraftHours,
  calcInstructorHours,
  calcReassignmentPlan,
  calcScheduleTotals,
  calcStudentStats,
  detectConflicts,
  formatDurationCompact,
  formatMinutes,
  formatSortieDisplay,
  getAircraftCoveredSlots,
  PPL_MIN_VFR_VISIBILITY_KM,
  ReassignmentMove,
} from "../utils/calculations";
import { fetchAssiutWeather } from "../utils/weather";
import { SortieModal } from "./SortieModal";

interface ScheduleBoardProps {
  schedule: DaySchedule;
  group: GroupData;
  instructors: Instructor[];
  students: Student[];
  aircraft: Aircraft[];
  ready?: boolean;
  readOnly?: boolean;
  onChangeSchedule: (next: DaySchedule) => void;
  onChangeInstructors: (next: Instructor[]) => void;
  onChangeStudents: (next: Student[]) => void;
  onQuickAddStudent: (name: string, program: StudentProgram) => Student;
  onRecordNoShow: (entry: NoShowEntry) => void;
}

export const ScheduleBoard: React.FC<ScheduleBoardProps> = ({
  schedule,
  group,
  instructors,
  students,
  aircraft,
  ready = true,
  readOnly = false,
  onChangeSchedule,
  onChangeInstructors,
  onChangeStudents,
  onQuickAddStudent,
  onRecordNoShow,
}) => {
  const [rosterOpen, setRosterOpen] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );
  const [viewMode, setViewMode] = useState<"grid" | "cards">(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "cards" : "grid"
  );
  const [mobileMetaOpen, setMobileMetaOpen] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [heatExpanded, setHeatExpanded] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [alertsExpanded, setAlertsExpanded] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [selectedMobileAcId, setSelectedMobileAcId] = useState<string>("ALL");
  const [highlightedStudentId, setHighlightedStudentId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ aircraftId: string; slotIndex: number } | null>(
    null
  );

  // Unified PointerEvents touch/mouse drag, 1-Tap Move/Swap & Undo stack
  type SlotCoord = { aircraftId: string; slotIndex: number };
  type ActiveDragState = SlotCoord & {
    label: string;
    subLabel: string;
    isSolo: boolean;
    pointerId: number;
    x: number;
    y: number;
  };
  type PendingDragState = SlotCoord & {
    label: string;
    subLabel: string;
    isSolo: boolean;
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    timerId: number | null;
  };

  const [undoStack, setUndoStack] = useState<DaySchedule[]>([]);
  const [toastMsg, setToastMsg] = useState<{ id: number; text: string; canUndo?: boolean } | null>(
    null
  );
  const [moveModeActive, setMoveModeActive] = useState(false);
  const [movingSource, setMovingSource] = useState<SlotCoord | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null);
  const [hoverDrop, setHoverDrop] = useState<SlotCoord | null>(null);

  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingDragRef = useRef<PendingDragState | null>(null);
  const activeDragRef = useRef<ActiveDragState | null>(null);
  const hoverDropRef = useRef<SlotCoord | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const toastTimerRef = useRef<number | null>(null);
  const moveOrSwapRef = useRef<
    (srcAcId: string, srcSlot: number, dstAcId: string, dstSlot: number) => void
  >(() => {});

  // Weather loading state & auto-check HEAT visibility on date change
  const [fetchingWx, setFetchingWx] = useState(false);
  const [wxError, setWxError] = useState<string | null>(null);
  const autoFetchedDatesRef = useRef<Set<string>>(new Set());
  const latestScheduleRef = useRef(schedule);
  latestScheduleRef.current = schedule;
  const onChangeRef = useRef(onChangeSchedule);
  onChangeRef.current = onChangeSchedule;

  useEffect(() => {
    if (!ready) return;
    const dateKey = schedule.date;
    const meta = latestScheduleRef.current.weatherMeta;
    const needsFetch =
      !meta?.todayVisibility ||
      meta.todayVisibility.date !== dateKey ||
      !meta.nextDayVisibility;

    if (!needsFetch || autoFetchedDatesRef.current.has(dateKey)) return;
    autoFetchedDatesRef.current.add(dateKey);

    let cancelled = false;
    setFetchingWx(true);
    setWxError(null);
    fetchAssiutWeather(dateKey)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.slots.length === 3) {
          const cur = latestScheduleRef.current;
          if (cur.date !== dateKey) return;
          const mergedSlots = res.slots.map((s, idx) => {
            const existing = cur.weather[idx];
            const hasManualWind = Boolean(existing?.wind && existing.wind.trim().length > 0);
            const hasManualTemp = Boolean(existing?.temp && existing.temp.trim().length > 0);
            const hasManualVis =
              typeof existing?.visibilityKm === "number" && Number.isFinite(existing.visibilityKm);
            return {
              time: existing?.time || s.time,
              wind: hasManualWind ? existing!.wind : s.wind,
              temp: hasManualTemp ? existing!.temp : s.temp,
              visibilityKm: hasManualVis ? existing!.visibilityKm : s.visibilityKm,
            };
          });
          onChangeRef.current({ ...cur, weather: mergedSlots, weatherMeta: res.meta });
        } else if (res.error) {
          setWxError(res.error);
        }
      })
      .finally(() => {
        setFetchingWx(false);
        if (cancelled) {
          autoFetchedDatesRef.current.delete(dateKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [schedule.date, ready]);

  // Modal / quick edit for Captain names
  const [editingInstructor, setEditingInstructor] = useState<{
    id: string;
    name: string;
    shortName: string;
    nameAr: string;
    shortNameAr: string;
    shortTouched: boolean;
  } | null>(null);

  const openEditInstructor = (inst: Instructor) => {
    if (readOnly) return;
    const shortVal = inst.shortName || inst.name;
    setEditingInstructor({
      id: inst.id,
      name: inst.name,
      shortName: shortVal,
      nameAr: inst.nameAr || "",
      shortNameAr: inst.shortNameAr || inst.nameAr || "",
      shortTouched: shortVal !== inst.name,
    });
  };

  const saveEditInstructor = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || !editingInstructor) return;
    const trimmedName = editingInstructor.name.trim();
    if (!trimmedName) return;
    const trimmedShort = editingInstructor.shortName.trim() || trimmedName;
    const trimmedAr = editingInstructor.nameAr.trim() || undefined;
    const trimmedShortAr = editingInstructor.shortNameAr.trim() || trimmedAr;
    onChangeInstructors(
      instructors.map((i) =>
        i.id === editingInstructor.id
          ? {
              ...i,
              name: trimmedName,
              shortName: trimmedShort,
              nameAr: trimmedAr,
              shortNameAr: trimmedShortAr,
            }
          : i
      )
    );
    setEditingInstructor(null);
  };

  // Standby student selector
  const [standbyPickId, setStandbyPickId] = useState<string>("");

  // Reassignment modal state
  const [reassignAc, setReassignAc] = useState<Aircraft | null>(null);

  const totals = useMemo(() => calcScheduleTotals(schedule, aircraft), [schedule, aircraft]);
  const studentStats = useMemo(() => calcStudentStats(schedule), [schedule]);
  const instructorHours = useMemo(() => calcInstructorHours(schedule), [schedule]);
  const conflicts = useMemo(
    () => detectConflicts(schedule, instructors, students, aircraft),
    [schedule, instructors, students, aircraft]
  );

  const conflictCellKeys = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of conflicts) {
      const k = `${c.aircraftId}:${c.slotIndex}`;
      const arr = map.get(k) || [];
      arr.push(c.message);
      map.set(k, arr);
    }
    return map;
  }, [conflicts]);

  const ircplStudents = useMemo(() => students.filter((s) => s.program === "IRCPL"), [students]);
  const pplStudents = useMemo(() => students.filter((s) => s.program === "PPL"), [students]);

  const updateMeta = (patch: Partial<DaySchedule>) => {
    if (readOnly) return;
    onChangeSchedule({ ...schedule, ...patch });
  };

  const showToast = (text: string, canUndo = false) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    const id = Date.now();
    setToastMsg({ id, text, canUndo });
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg((cur) => (cur?.id === id ? null : cur));
    }, 5000);
  };

  const commitSchedule = (nextSchedule: DaySchedule, toastText?: string) => {
    if (readOnly) return;
    setUndoStack((prev) => [...prev.slice(-14), schedule]);
    onChangeSchedule(nextSchedule);
    if (toastText) {
      showToast(toastText, true);
    }
  };

  const handleUndo = () => {
    if (readOnly) return;
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      onChangeSchedule(previous);
      showToast("Undid last change", false);
      return prev.slice(0, -1);
    });
  };

  const handleSaveSortie = (aircraftId: string, slotIndex: number, sortie: Sortie) => {
    const prevAcGrid = schedule.grid[aircraftId] || {};
    commitSchedule({
      ...schedule,
      grid: {
        ...schedule.grid,
        [aircraftId]: {
          ...prevAcGrid,
          [slotIndex]: sortie,
        },
      },
    });
    setEditingCell(null);
  };

  const handleClearSortie = (aircraftId: string, slotIndex: number) => {
    const prevAcGrid = { ...(schedule.grid[aircraftId] || {}) };
    delete prevAcGrid[slotIndex];
    commitSchedule(
      {
        ...schedule,
        grid: {
          ...schedule.grid,
          [aircraftId]: prevAcGrid,
        },
      },
      "Cleared slot"
    );
    setEditingCell(null);
  };

  const handleNoShowSwap = (
    aircraftId: string,
    slotIndex: number,
    absentStudentId: string,
    replacementStudentId: string
  ) => {
    const existing = schedule.grid[aircraftId]?.[slotIndex];
    if (!existing) return;

    const acReg = aircraft.find((a) => a.id === aircraftId)?.registration || aircraftId;
    const absName = students.find((s) => s.id === absentStudentId)?.name || absentStudentId;
    const repName = students.find((s) => s.id === replacementStudentId)?.name || replacementStudentId;

    onRecordNoShow({
      id: `ns-${Date.now().toString(36)}`,
      date: schedule.date,
      studentId: absentStudentId,
      studentName: absName,
      aircraftReg: acReg,
      slotLabel: schedule.timeSlots[slotIndex] || `Slot ${slotIndex + 1}`,
      replacedByStudentId: replacementStudentId,
      replacedByStudentName: repName,
      timestamp: new Date().toISOString(),
    });

    const nextStandby = schedule.standby.filter((sb) => sb.studentId !== replacementStudentId);
    const prevAcGrid = schedule.grid[aircraftId] || {};
    commitSchedule(
      {
        ...schedule,
        standby: nextStandby,
        grid: {
          ...schedule.grid,
          [aircraftId]: {
            ...prevAcGrid,
            [slotIndex]: {
              ...existing,
              studentId: replacementStudentId,
            },
          },
        },
      },
      `Swapped NO SHOW → ${repName}`
    );
    setEditingCell(null);
  };

  const moveOrSwapSortie = (
    srcAcId: string,
    srcSlot: number,
    targetAcId: string,
    targetSlotIndex: number
  ) => {
    if (srcAcId === targetAcId && srcSlot === targetSlotIndex) return;

    const srcSortie = schedule.grid[srcAcId]?.[srcSlot];
    if (!srcSortie) return;
    const destSortie = schedule.grid[targetAcId]?.[targetSlotIndex];

    const nextGrid = { ...schedule.grid };
    const nextSrcAc = { ...(nextGrid[srcAcId] || {}) };
    const nextDstAc = srcAcId === targetAcId ? nextSrcAc : { ...(nextGrid[targetAcId] || {}) };

    if (destSortie) {
      nextSrcAc[srcSlot] = destSortie;
    } else {
      delete nextSrcAc[srcSlot];
    }
    nextDstAc[targetSlotIndex] = srcSortie;

    nextGrid[srcAcId] = nextSrcAc;
    nextGrid[targetAcId] = nextDstAc;

    const srcReg = aircraft.find((a) => a.id === srcAcId)?.registration || srcAcId;
    const dstReg = aircraft.find((a) => a.id === targetAcId)?.registration || targetAcId;
    const srcTime = schedule.timeSlots[srcSlot] || `Slot ${srcSlot + 1}`;
    const dstTime = schedule.timeSlots[targetSlotIndex] || `Slot ${targetSlotIndex + 1}`;

    commitSchedule(
      { ...schedule, grid: nextGrid },
      destSortie
        ? `Swapped ${srcReg} ${srcTime} ⇄ ${dstReg} ${dstTime}`
        : `Moved ${srcReg} ${srcTime} → ${dstReg} ${dstTime}`
    );
  };

  moveOrSwapRef.current = moveOrSwapSortie;

  const startActiveDragNow = (
    acId: string,
    sIdx: number,
    label: string,
    subLabel: string,
    isSolo: boolean,
    pointerId: number,
    x: number,
    y: number
  ) => {
    const nextDrag: ActiveDragState = {
      aircraftId: acId,
      slotIndex: sIdx,
      label,
      subLabel,
      isSolo,
      pointerId,
      x,
      y,
    };
    activeDragRef.current = nextDrag;
    setActiveDrag(nextDrag);
    const initialHover: SlotCoord = { aircraftId: acId, slotIndex: sIdx };
    hoverDropRef.current = initialHover;
    setHoverDrop(initialHover);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(14);
    }
  };

  const beginHandleDrag = (
    e: React.PointerEvent,
    acId: string,
    sIdx: number,
    label: string,
    subLabel: string,
    isSolo: boolean
  ) => {
    if (
      readOnly ||
      e.isPrimary === false ||
      (e.pointerType === "mouse" && e.button !== 0) ||
      moveModeActive ||
      movingSource
    ) {
      return;
    }
    e.stopPropagation();
    if (pendingDragRef.current?.timerId) {
      window.clearTimeout(pendingDragRef.current.timerId);
    }
    pendingDragRef.current = null;
    startActiveDragNow(acId, sIdx, label, subLabel, isSolo, e.pointerId, e.clientX, e.clientY);
  };

  const beginCardPointerDown = (
    e: React.PointerEvent,
    acId: string,
    sIdx: number,
    sortie: Sortie | undefined,
    disp: { topLine: string; bottomLine: string } | null
  ) => {
    if (
      readOnly ||
      !sortie ||
      !disp ||
      e.isPrimary === false ||
      (e.pointerType === "mouse" && e.button !== 0) ||
      moveModeActive ||
      movingSource
    ) {
      return;
    }
    if ((e.target as HTMLElement)?.closest("[data-drag-handle]")) return;

    if (pendingDragRef.current?.timerId) {
      window.clearTimeout(pendingDragRef.current.timerId);
    }
    const pending: PendingDragState = {
      aircraftId: acId,
      slotIndex: sIdx,
      label: disp.topLine,
      subLabel: disp.bottomLine || "No student",
      isSolo: sortie.type === "SOLO",
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      timerId: null,
    };

    if (e.pointerType !== "mouse") {
      pending.timerId = window.setTimeout(() => {
        if (pendingDragRef.current?.pointerId !== pending.pointerId) return;
        pendingDragRef.current = null;
        startActiveDragNow(
          pending.aircraftId,
          pending.slotIndex,
          pending.label,
          pending.subLabel,
          pending.isSolo,
          pending.pointerId,
          pending.startX,
          pending.startY
        );
      }, 200);
    }

    pendingDragRef.current = pending;
  };

  useEffect(() => {
    const parseDropCellAt = (x: number, y: number): SlotCoord | null => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-cell]");
      if (!el) return null;
      const raw = el.getAttribute("data-drop-cell");
      if (!raw) return null;
      const sep = raw.lastIndexOf("|");
      if (sep <= 0) return null;
      const aircraftId = raw.slice(0, sep);
      const slotIndex = Number.parseInt(raw.slice(sep + 1), 10);
      if (!aircraftId || Number.isNaN(slotIndex)) return null;
      return { aircraftId, slotIndex };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (pending && pending.pointerId === e.pointerId) {
        const dist = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY);
        if (pending.pointerType === "mouse") {
          if (dist > 6) {
            pendingDragRef.current = null;
            startActiveDragNow(
              pending.aircraftId,
              pending.slotIndex,
              pending.label,
              pending.subLabel,
              pending.isSolo,
              pending.pointerId,
              e.clientX,
              e.clientY
            );
          }
        } else if (dist > 10 && !activeDragRef.current) {
          if (pending.timerId) window.clearTimeout(pending.timerId);
          pendingDragRef.current = null;
        }
      }

      const active = activeDragRef.current;
      if (active && active.pointerId === e.pointerId) {
        const updated: ActiveDragState = { ...active, x: e.clientX, y: e.clientY };
        activeDragRef.current = updated;
        setActiveDrag(updated);

        const nextDrop = parseDropCellAt(e.clientX, e.clientY);
        const curDrop = hoverDropRef.current;
        if (
          nextDrop?.aircraftId !== curDrop?.aircraftId ||
          nextDrop?.slotIndex !== curDrop?.slotIndex
        ) {
          hoverDropRef.current = nextDrop;
          setHoverDrop(nextDrop);
        }
      }
    };

    const finishDrag = (e: PointerEvent, commitDrop: boolean) => {
      const pending = pendingDragRef.current;
      if (pending && pending.pointerId === e.pointerId) {
        if (pending.timerId) window.clearTimeout(pending.timerId);
        pendingDragRef.current = null;
      }

      const active = activeDragRef.current;
      if (!active || active.pointerId !== e.pointerId) return;

      const finalDrop = commitDrop
        ? parseDropCellAt(e.clientX, e.clientY) ?? hoverDropRef.current
        : null;

      activeDragRef.current = null;
      hoverDropRef.current = null;
      setActiveDrag(null);
      setHoverDrop(null);

      if (
        commitDrop &&
        finalDrop &&
        (finalDrop.aircraftId !== active.aircraftId || finalDrop.slotIndex !== active.slotIndex)
      ) {
        suppressClickUntilRef.current = Date.now() + 400;
        moveOrSwapRef.current(
          active.aircraftId,
          active.slotIndex,
          finalDrop.aircraftId,
          finalDrop.slotIndex
        );
      }
    };

    const handlePointerUp = (e: PointerEvent) => finishDrag(e, true);
    const handlePointerCancel = (e: PointerEvent) => finishDrag(e, false);
    const handleTouchMove = (e: TouchEvent) => {
      if (activeDragRef.current) {
        e.preventDefault();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  // Gentle edge auto-scroll when dragging near viewport or horizontal grid edges
  const isDraggingNow = Boolean(activeDrag);
  useEffect(() => {
    if (!isDraggingNow) return;
    let rafId = 0;
    const step = () => {
      const drag = activeDragRef.current;
      if (drag) {
        const vh = window.innerHeight;
        if (drag.y < 72) window.scrollBy(0, -10);
        else if (drag.y > vh - 72) window.scrollBy(0, 10);

        const scroller = gridScrollRef.current;
        if (scroller) {
          const rect = scroller.getBoundingClientRect();
          if (drag.x < rect.left + 84) scroller.scrollLeft -= 12;
          else if (drag.x > rect.right - 56) scroller.scrollLeft += 12;
        }
      }
      rafId = window.requestAnimationFrame(step);
    };
    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [isDraggingNow]);

  const handleSlotTap = (aircraftId: string, slotIndex: number, hasSortie: boolean) => {
    if (readOnly) return;
    if (Date.now() < suppressClickUntilRef.current) return;

    if (movingSource) {
      if (movingSource.aircraftId === aircraftId && movingSource.slotIndex === slotIndex) {
        setMovingSource(null);
        setMoveModeActive(false);
        return;
      }
      moveOrSwapSortie(movingSource.aircraftId, movingSource.slotIndex, aircraftId, slotIndex);
      setMovingSource(null);
      setMoveModeActive(false);
      return;
    }

    if (moveModeActive) {
      if (hasSortie) {
        setMovingSource({ aircraftId, slotIndex });
      } else {
        showToast("Tap an occupied slot first to pick a sortie to move", false);
      }
      return;
    }

    setEditingCell({ aircraftId, slotIndex });
  };

  const handleFetchWeather = async () => {
    setFetchingWx(true);
    setWxError(null);
    const res = await fetchAssiutWeather(schedule.date);
    setFetchingWx(false);
    if (res.ok && res.slots.length === 3) {
      if (readOnly) {
        showToast(res.meta?.advisory || "HEAT weather checked (read-only preview)", false);
      } else {
        updateMeta({ weather: res.slots, weatherMeta: res.meta });
      }
    } else {
      setWxError(res.error || "Weather unavailable");
    }
  };

  const reassignMoves: ReassignmentMove[] = useMemo(() => {
    if (!reassignAc) return [];
    return calcReassignmentPlan(schedule, reassignAc.id, instructors, students, aircraft);
  }, [reassignAc, schedule, instructors, students, aircraft]);

  const applyReassignment = () => {
    if (!reassignAc) return;
    const nextGrid: DaySchedule["grid"] = structuredClone(schedule.grid);
    for (const move of reassignMoves) {
      if (move.targetAcId && move.targetSlotIndex !== null) {
        if (!nextGrid[move.targetAcId]) nextGrid[move.targetAcId] = {};
        nextGrid[move.targetAcId][move.targetSlotIndex] = { ...move.sortie };
        delete nextGrid[move.sourceAcId]?.[move.sourceSlotIndex];
      }
    }
    commitSchedule({ ...schedule, grid: nextGrid }, `Reassigned ${reassignAc.registration}`);
    setReassignAc(null);
  };

  const activeAc = editingCell ? aircraft.find((a) => a.id === editingCell.aircraftId) : undefined;
  const existingSortie =
    editingCell && activeAc ? schedule.grid[activeAc.id]?.[editingCell.slotIndex] : undefined;

  const fitInstructors = instructors.filter((i) => i.fit).length;
  const fitStudents = students.filter((s) => s.fit).length;
  const physicalAircraft = aircraft.filter((a) => a.registration !== "EXTRA");
  const svcAircraft = physicalAircraft.filter((a) => a.serviceable).length;
  const filteredMobileAircraft =
    selectedMobileAcId !== "ALL" && aircraft.some((a) => a.id === selectedMobileAcId)
      ? aircraft.filter((a) => a.id === selectedMobileAcId)
      : aircraft;
  const heatHasLowVis = Boolean(
    (schedule.weatherMeta?.todayVisibility && !schedule.weatherMeta.todayVisibility.vfrOkForPpl) ||
      (schedule.weatherMeta?.nextDayVisibility &&
        !schedule.weatherMeta.nextDayVisibility.vfrOkForPpl) ||
      (schedule.weatherMeta?.metarVisKm !== null &&
        schedule.weatherMeta?.metarVisKm !== undefined &&
        schedule.weatherMeta.metarVisKm < PPL_MIN_VFR_VISIBILITY_KM)
  );

  return (
    <div className="space-y-2.5 md:space-y-4">
      {/* Compact 1-Row Mobile KPI Summary Strip (< 768px) */}
      <div className="grid grid-cols-4 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white py-2 text-center shadow-2xs md:hidden">
        <div className="px-1">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Total
          </div>
          <div className="text-sm font-extrabold leading-tight text-[#1B365D]">
            {formatMinutes(totals.grandTotalMin, "0:00")}
          </div>
          <div className="text-[9px] font-semibold text-slate-500">
            {totals.sortieCount} sorties
          </div>
        </div>
        <div className="px-1">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#C00000]">Solo</div>
          <div className="text-sm font-extrabold leading-tight text-[#C00000]">
            {formatMinutes(totals.totalSoloMin, "0:00")}
          </div>
          <div className="text-[9px] font-semibold text-slate-400">hrs</div>
        </div>
        <div className="px-1">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Dual</div>
          <div className="text-sm font-extrabold leading-tight text-slate-900">
            {formatMinutes(totals.totalDualMin, "0:00")}
          </div>
          <div className="text-[9px] font-semibold text-slate-400">hrs</div>
        </div>
        <div className="px-1">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Ready
          </div>
          <div className="text-sm font-extrabold leading-tight text-emerald-700">
            {svcAircraft}/{physicalAircraft.length}
          </div>
          <div className="text-[9px] font-semibold text-slate-500">{fitInstructors} Capt</div>
        </div>
      </div>

      {/* Desktop & iPad 6-Card KPI Strip (>= 768px) */}
      <div className="hidden grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total Hours
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-xl font-extrabold text-[#1B365D]">
              {formatMinutes(totals.grandTotalMin, "0:00")}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {totals.sortieCount} sorties
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#C00000]">
            Solo Hours
          </div>
          <div className="mt-0.5 text-xl font-extrabold text-[#C00000]">
            {formatMinutes(totals.totalSoloMin, "0:00")}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Dual Hours
          </div>
          <div className="mt-0.5 text-xl font-extrabold text-slate-900">
            {formatMinutes(totals.totalDualMin, "0:00")}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Fleet Ready
          </div>
          <div className="mt-0.5 text-xl font-extrabold text-emerald-700">
            {svcAircraft}{" "}
            <span className="text-xs font-semibold text-slate-500">
              / {physicalAircraft.length}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Fit Students
          </div>
          <div className="mt-0.5 text-xl font-extrabold text-slate-900">
            {fitStudents}{" "}
            <span className="text-xs font-semibold text-slate-500">/ {students.length}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Fit Instructors
          </div>
          <div className="mt-0.5 text-xl font-extrabold text-slate-900">
            {fitInstructors}{" "}
            <span className="text-xs font-semibold text-slate-500">/ {instructors.length}</span>
          </div>
        </div>
      </div>

      {/* HEAT Assiut Airport Daily & Next-Day VFR Visibility Monitor */}
      <div
        className={`rounded-xl border bg-white shadow-2xs ${
          heatHasLowVis ? "border-red-300" : "border-slate-200"
        } ${heatExpanded ? "p-3.5" : "px-3 py-2"}`}
      >
        {!heatExpanded ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setHeatExpanded(true)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <Eye className={`h-4 w-4 shrink-0 ${heatHasLowVis ? "text-[#C00000]" : "text-blue-600"}`} />
              <div className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-800">
                <span
                  className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                    heatHasLowVis
                      ? "bg-red-100 text-[#C00000]"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {heatHasLowVis ? "HEAT < 5km" : "HEAT VFR OK"}
                </span>
                {schedule.weatherMeta?.todayVisibility && schedule.weatherMeta?.nextDayVisibility ? (
                  <span className="text-slate-600">
                    {schedule.weatherMeta.todayVisibility.minVisibilityKm.toFixed(1)}km · Tmrw{" "}
                    {schedule.weatherMeta.nextDayVisibility.minVisibilityKm.toFixed(1)}km
                  </span>
                ) : (
                  <span className="text-slate-500">Tap to check HEAT visibility</span>
                )}
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={handleFetchWeather}
              disabled={fetchingWx}
              aria-label="Refresh HEAT visibility"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-[#1B365D] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${fetchingWx ? "animate-spin" : ""}`} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                  <Eye className="h-4 w-4 text-blue-600" />
                  HEAT (Assiut Airport) · Daily &amp; Next-Day VFR Visibility Monitor
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">
                  PPL VFR Min: {PPL_MIN_VFR_VISIBILITY_KM}.0 km
                </span>
                {schedule.weatherMeta?.fetchedAt && (
                  <span className="text-[10px] font-semibold text-slate-400">
                    Checked{" "}
                    {new Date(schedule.weatherMeta.fetchedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleFetchWeather}
                  disabled={fetchingWx}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-[#1B365D] hover:bg-blue-100 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3 w-3 ${fetchingWx ? "animate-spin" : ""}`} />
                  {fetchingWx ? "Checking HEAT..." : "Refresh HEAT"}
                </button>
                <button
                  type="button"
                  onClick={() => setHeatExpanded(false)}
                  aria-label="Collapse HEAT monitor"
                  className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600 md:hidden"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

        {schedule.weatherMeta?.advisory && (
          <div
            className={`mt-2 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
              (schedule.weatherMeta.todayVisibility && !schedule.weatherMeta.todayVisibility.vfrOkForPpl) ||
              (schedule.weatherMeta.nextDayVisibility && !schedule.weatherMeta.nextDayVisibility.vfrOkForPpl) ||
              (schedule.weatherMeta.metarVisKm !== null &&
                schedule.weatherMeta.metarVisKm !== undefined &&
                schedule.weatherMeta.metarVisKm < PPL_MIN_VFR_VISIBILITY_KM)
                ? "border-red-300 bg-red-50 text-[#C00000]"
                : (schedule.weatherMeta.maxCrosswindKt ?? 0) >= 12
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{schedule.weatherMeta.advisory}</span>
          </div>
        )}

        <div className="mt-2.5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Today's Visibility */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-[#1B365D]">
                Today · {schedule.weatherMeta?.todayVisibility?.date || schedule.date}
              </span>
              {schedule.weatherMeta?.todayVisibility ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    schedule.weatherMeta.todayVisibility.vfrOkForPpl
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-[#C00000]"
                  }`}
                >
                  {schedule.weatherMeta.todayVisibility.vfrOkForPpl
                    ? `VFR OK (Min ${schedule.weatherMeta.todayVisibility.minVisibilityKm.toFixed(1)} km)`
                    : `PPL NO-GO (< 5 km · Min ${schedule.weatherMeta.todayVisibility.minVisibilityKm.toFixed(1)} km)`}
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400">
                  {fetchingWx ? "Loading HEAT visibility..." : "Click Refresh HEAT"}
                </span>
              )}
            </div>
            {schedule.weatherMeta?.todayVisibility && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {schedule.weatherMeta.todayVisibility.hourly.map((pt) => {
                  const low = pt.visibilityKm < PPL_MIN_VFR_VISIBILITY_KM;
                  return (
                    <span
                      key={pt.hour}
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                        low
                          ? "border-red-300 bg-red-100 text-[#C00000]"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      {pt.label}: {pt.visibilityKm.toFixed(1)}km
                    </span>
                  );
                })}
              </div>
            )}
            {schedule.weatherMeta?.metarRaw && (
              <div
                className={`mt-1.5 truncate rounded border px-2 py-1 font-mono text-[10px] ${
                  schedule.weatherMeta.metarVisKm !== null &&
                  schedule.weatherMeta.metarVisKm !== undefined &&
                  schedule.weatherMeta.metarVisKm < PPL_MIN_VFR_VISIBILITY_KM
                    ? "border-red-300 bg-red-50 font-bold text-[#C00000]"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
                title={schedule.weatherMeta.metarRaw}
              >
                {schedule.weatherMeta.metarRaw}
              </div>
            )}
          </div>

          {/* Next Day Visibility */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-[#1B365D]">
                Next Day · {schedule.weatherMeta?.nextDayVisibility?.date || "Tomorrow"}
              </span>
              {schedule.weatherMeta?.nextDayVisibility ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    schedule.weatherMeta.nextDayVisibility.vfrOkForPpl
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-[#C00000]"
                  }`}
                >
                  {schedule.weatherMeta.nextDayVisibility.vfrOkForPpl
                    ? `NEXT DAY VFR OK (Min ${schedule.weatherMeta.nextDayVisibility.minVisibilityKm.toFixed(1)} km)`
                    : `NEXT DAY PPL ALERT (< 5 km · Min ${schedule.weatherMeta.nextDayVisibility.minVisibilityKm.toFixed(1)} km)`}
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400">
                  {fetchingWx ? "Checking next-day forecast..." : "Click Refresh HEAT"}
                </span>
              )}
            </div>
            {schedule.weatherMeta?.nextDayVisibility && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {schedule.weatherMeta.nextDayVisibility.hourly.map((pt) => {
                  const low = pt.visibilityKm < PPL_MIN_VFR_VISIBILITY_KM;
                  return (
                    <span
                      key={pt.hour}
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                        low
                          ? "border-red-300 bg-red-100 text-[#C00000]"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      {pt.label}: {pt.visibilityKm.toFixed(1)}km
                    </span>
                  );
                })}
              </div>
            )}
            {schedule.weatherMeta?.tafRaw && (
              <div
                className={`mt-1.5 truncate rounded border px-2 py-1 font-mono text-[10px] ${
                  schedule.weatherMeta.tafMinVisKm !== null &&
                  schedule.weatherMeta.tafMinVisKm !== undefined &&
                  schedule.weatherMeta.tafMinVisKm < PPL_MIN_VFR_VISIBILITY_KM
                    ? "border-red-300 bg-red-50 font-bold text-[#C00000]"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
                title={schedule.weatherMeta.tafRaw}
              >
                {schedule.weatherMeta.tafRaw}
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </div>

      {/* Mission Metadata Bar & Instructor Workload (toggleable on phones/iPad) */}
      {mobileMetaOpen && (
        <>
          <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs sm:grid-cols-3 lg:grid-cols-6">
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Airport
          </span>
          <input
            type="text"
            readOnly={readOnly}
            value={schedule.airport}
            onChange={(e) => updateMeta({ airport: e.target.value })}
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-base font-semibold text-slate-900 focus:border-[#1B365D] focus:outline-none read-only:bg-slate-50 md:text-xs"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Issue Label
          </span>
          <input
            type="text"
            readOnly={readOnly}
            value={schedule.issueLabel}
            onChange={(e) => updateMeta({ issueLabel: e.target.value })}
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-base font-semibold text-slate-900 focus:border-[#1B365D] focus:outline-none read-only:bg-slate-50 md:text-xs"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Mission Commander
          </span>
          <input
            type="text"
            readOnly={readOnly}
            value={schedule.missionCommander}
            onChange={(e) => updateMeta({ missionCommander: e.target.value })}
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-base font-semibold text-slate-900 focus:border-[#1B365D] focus:outline-none read-only:bg-slate-50 md:text-xs"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Operations Officer
          </span>
          <input
            type="text"
            readOnly={readOnly}
            value={schedule.operationsOfficer}
            onChange={(e) => updateMeta({ operationsOfficer: e.target.value })}
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-base font-semibold text-slate-900 focus:border-[#1B365D] focus:outline-none read-only:bg-slate-50 md:text-xs"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Monitoring
          </span>
          <input
            type="text"
            readOnly={readOnly}
            value={schedule.monitoringOfficer}
            onChange={(e) => updateMeta({ monitoringOfficer: e.target.value })}
            placeholder={readOnly ? "-" : "Optional..."}
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-base font-semibold text-slate-900 focus:border-[#1B365D] focus:outline-none read-only:bg-slate-50 md:text-xs"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Operations Manager
          </span>
          <input
            type="text"
            readOnly={readOnly}
            value={schedule.operationsManager}
            onChange={(e) => updateMeta({ operationsManager: e.target.value })}
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-base font-semibold text-slate-900 focus:border-[#1B365D] focus:outline-none read-only:bg-slate-50 md:text-xs"
          />
        </label>
      </div>

      {/* Instructor Workload Strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs shadow-2xs">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
          Instructor Dual Load:
        </span>
        {instructors.map((inst) => {
          const stat = instructorHours[inst.id];
          const mins = stat?.totalMin ?? 0;
          const warnLimit = inst.maxDailyMin ?? 360;
          const errLimit = Math.max(warnLimit + 120, 480);
          const colorCls =
            mins > errLimit
              ? "border-red-300 bg-red-100 text-[#C00000]"
              : mins > warnLimit
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-slate-200 bg-slate-50 text-slate-700";
          return readOnly ? (
            <span
              key={inst.id}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-bold ${colorCls}`}
            >
              <span>{inst.shortName || inst.name}</span>
              <span className="font-mono">{formatDurationCompact(mins)}</span>
            </span>
          ) : (
            <button
              key={inst.id}
              type="button"
              onClick={() => openEditInstructor(inst)}
              title={`Click to edit ${inst.name}`}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-bold transition hover:ring-1 hover:ring-[#1B365D] ${colorCls}`}
            >
              <span>{inst.shortName || inst.name}</span>
              <span className="font-mono">{formatDurationCompact(mins)}</span>
              <Pencil className="h-2.5 w-2.5 opacity-60" />
            </button>
          );
        })}
          </div>
        </>
      )}

      {/* Real-time Conflict Banner + View/Touch/Roster Controls */}
      <div
        className={`rounded-xl border p-2 text-xs md:p-3 ${
          conflicts.length === 0
            ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
            : "border-amber-300 bg-amber-50 text-amber-950"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 font-bold">
            {conflicts.length === 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="truncate md:whitespace-normal">
                  <span className="md:hidden">0 Conflicts · All Clear</span>
                  <span className="hidden md:inline">
                    Schedule validation clear — 0 time-span overlaps, all crew &amp; aircraft ready.
                  </span>
                </span>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAlertsExpanded((v) => !v)}
                className="flex min-w-0 items-center gap-1.5 text-left"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span className="truncate md:whitespace-normal">
                  <span className="md:hidden">
                    {conflicts.length} Alert{conflicts.length > 1 ? "s" : ""} ·{" "}
                    {alertsExpanded ? "Hide" : "Tap to view"}
                  </span>
                  <span className="hidden md:inline">
                    {conflicts.length} Scheduling Alert{conflicts.length > 1 ? "s" : ""} (click an
                    alert to jump straight to that slot)
                  </span>
                </span>
                {alertsExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 shrink-0 md:hidden" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 md:hidden" />
                )}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1 md:gap-1.5">
            {!readOnly && undoStack.length > 0 && (
              <button
                type="button"
                onClick={handleUndo}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-[#1B365D] shadow-2xs hover:bg-slate-50 md:px-2.5"
                title="Undo last schedule change"
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span>Undo ({undoStack.length})</span>
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  if (moveModeActive || movingSource) {
                    setMoveModeActive(false);
                    setMovingSource(null);
                  } else {
                    setMoveModeActive(true);
                  }
                }}
                className={`inline-flex min-h-[32px] items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition md:px-2.5 ${
                  moveModeActive || movingSource
                    ? "border-blue-600 bg-blue-600 text-white shadow-2xs"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                title="1-Tap Move or Swap slots without dragging"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span className="md:hidden">{moveModeActive || movingSource ? "Moving" : "Move"}</span>
                <span className="hidden md:inline">
                  {moveModeActive || movingSource ? "Move Mode On" : "Move / Swap"}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileMetaOpen((v) => !v)}
              className="inline-flex min-h-[32px] items-center gap-0.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              title="Toggle Mission Metadata & Instructor Dual Load"
            >
              {mobileMetaOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              <span className="md:hidden">Ops</span>
              <span className="hidden md:inline">Details</span>
            </button>
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold md:px-2 ${
                  viewMode === "grid" ? "bg-[#1B365D] text-white" : "text-slate-600"
                }`}
              >
                <LayoutGrid className="h-3 w-3" /> Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold md:px-2 ${
                  viewMode === "cards" ? "bg-[#1B365D] text-white" : "text-slate-600"
                }`}
              >
                <LayoutList className="h-3 w-3" />{" "}
                <span className="md:hidden">Cards</span>
                <span className="hidden md:inline">Mobile Cards</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setRosterOpen((v) => !v)}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
            >
              {rosterOpen ? (
                <PanelLeftClose className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              )}
              <span className="md:hidden">{rosterOpen ? "Hide" : "Roster"}</span>
              <span className="hidden md:inline">
                {rosterOpen ? "Hide Roster" : "Show Roster"}
              </span>
            </button>
          </div>
        </div>

        {alertsExpanded && conflicts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {conflicts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setEditingCell({ aircraftId: c.aircraftId, slotIndex: c.slotIndex })}
                className={`rounded-md border px-2.5 py-1 text-left text-[11px] font-semibold transition hover:opacity-90 ${
                  c.severity === "error"
                    ? "border-red-300 bg-red-100 text-[#C00000]"
                    : "border-amber-300 bg-white text-amber-900"
                }`}
              >
                {c.message}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Split Workspace: Live Roster + Grid OR Mobile Cards */}
      <div className="flex flex-col gap-4 xl:flex-row">
        {rosterOpen && (
          <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white shadow-xs xl:w-64">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
                Mission Roster
              </span>
              {highlightedStudentId && (
                <button
                  type="button"
                  onClick={() => setHighlightedStudentId(null)}
                  className="text-[11px] font-semibold text-blue-700 hover:underline"
                >
                  Clear Highlight
                </button>
              )}
            </div>

            <div className="max-h-[540px] divide-y divide-slate-100 overflow-y-auto p-2.5 text-xs">
              <div className="pb-2">
                <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Instructors ({instructors.length})
                </div>
                <div className="space-y-0.5">
                  {instructors.map((inst) => (
                    <div
                      key={inst.id}
                      className="flex items-center justify-between gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => openEditInstructor(inst)}
                        title={readOnly ? inst.name : `Rename ${inst.name}`}
                        className={`min-w-0 flex-1 truncate text-left ${
                          readOnly ? "cursor-default" : "hover:text-[#1B365D]"
                        } ${inst.fit ? "" : "text-slate-400 line-through"}`}
                      >
                        {inst.name}
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        {!inst.fit && (
                          <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">
                            Unfit
                          </span>
                        )}
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => openEditInstructor(inst)}
                            title={`Edit ${inst.name}`}
                            className="rounded p-0.5 text-slate-400 hover:bg-blue-50 hover:text-[#1B365D]"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {ircplStudents.length > 0 && (
                <div className="py-2">
                  <div className="mb-1 text-center text-[11px] font-extrabold tracking-wide text-[#C00000]">
                    IRCPL ({ircplStudents.length})
                  </div>
                  <div className="space-y-0.5">
                    {ircplStudents.map((stu, i) => {
                      const stat = studentStats[stu.id];
                      const isHi = highlightedStudentId === stu.id;
                      return (
                        <div
                          key={stu.id}
                          className={`flex w-full items-center justify-between gap-1 rounded px-1.5 py-0.5 transition ${
                            isHi ? "bg-red-100 ring-1 ring-[#C00000]" : "hover:bg-red-50/60"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setHighlightedStudentId(isHi ? null : stu.id)}
                            className={`min-w-0 flex-1 truncate text-left font-semibold text-[#C00000] ${
                              stu.fit ? "" : "opacity-50 line-through"
                            }`}
                          >
                            {i + 1}. {stu.name}
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            {stat && (
                              <span className="rounded bg-red-100 px-1.5 text-[10px] font-bold text-[#C00000]">
                                {stat.sorties}x
                              </span>
                            )}
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() =>
                                  onChangeStudents(
                                    students.map((s) =>
                                      s.id === stu.id ? { ...s, program: "PPL" } : s
                                    )
                                  )
                                }
                                title="Switch to PPL"
                                className="rounded border border-red-200 bg-white px-1 py-0 text-[9px] font-extrabold text-[#C00000] hover:bg-[#1B365D] hover:text-white"
                              >
                                IRCPL
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <div className="mb-1 text-center text-[11px] font-extrabold tracking-wide text-slate-800">
                  {ircplStudents.length > 0
                    ? `PPL (${pplStudents.length})`
                    : `Students (${pplStudents.length})`}
                </div>
                <div className="space-y-0.5">
                  {pplStudents.map((stu, i) => {
                    const stat = studentStats[stu.id];
                    const isHi = highlightedStudentId === stu.id;
                    return (
                      <div
                        key={stu.id}
                        className={`flex w-full items-center justify-between gap-1 rounded px-1.5 py-0.5 transition ${
                          isHi ? "bg-blue-100 ring-1 ring-[#1B365D]" : "hover:bg-slate-100"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setHighlightedStudentId(isHi ? null : stu.id)}
                          className={`min-w-0 flex-1 truncate text-left font-semibold text-slate-800 ${
                            stu.fit ? "" : "opacity-50 line-through"
                          }`}
                        >
                          {ircplStudents.length + i + 1}. {stu.name}
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          {stat && (
                            <span className="rounded bg-slate-200 px-1.5 text-[10px] font-bold text-slate-800">
                              {stat.sorties}x
                            </span>
                          )}
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() =>
                                onChangeStudents(
                                  students.map((s) =>
                                    s.id === stu.id ? { ...s, program: "IRCPL" } : s
                                  )
                                )
                              }
                              title="Switch to IRCPL"
                              className="rounded border border-slate-200 bg-white px-1 py-0 text-[9px] font-extrabold text-slate-600 hover:border-[#C00000] hover:bg-[#C00000] hover:text-white"
                            >
                              PPL
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        )}

        {viewMode === "grid" ? (
          /* Desktop & Tablet Interactive Schedule Table */
          <div
            ref={gridScrollRef}
            className="min-w-0 flex-1 touch-pan-x touch-pan-y overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-xs [-webkit-overflow-scrolling:touch]"
          >
            <table className="w-full min-w-[1050px] border-collapse text-xs">
              <thead>
                <tr className="bg-[#1B365D] text-white">
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-20 w-28 border-b border-r-2 border-slate-600 bg-[#1B365D] px-2 py-2 text-center text-xs font-extrabold uppercase tracking-wide"
                  >
                    Aircraft
                  </th>
                  <th
                    colSpan={10}
                    className="border-b border-r border-slate-600 px-2 py-1.5 text-center text-xs font-extrabold uppercase tracking-wider"
                  >
                    Time From &amp; To{readOnly ? " (Read-Only View)" : " (Tap to edit · Drag handle or hold to move/swap)"}
                  </th>
                  <th
                    colSpan={2}
                    className="w-28 border-b border-slate-600 px-2 py-1.5 text-center text-xs font-extrabold uppercase tracking-wide"
                  >
                    Flight Hours
                  </th>
                </tr>
                <tr className="bg-slate-100 text-slate-800">
                  {schedule.timeSlots.map((slotVal, sIdx) => (
                    <th
                      key={sIdx}
                      className="min-w-[92px] border-b border-r border-slate-300 p-1 text-center font-bold"
                    >
                      <input
                        type="text"
                        readOnly={readOnly}
                        value={slotVal}
                        onChange={(e) => {
                          const nextSlots = [...schedule.timeSlots];
                          nextSlots[sIdx] = e.target.value;
                          updateMeta({ timeSlots: nextSlots });
                        }}
                        placeholder={`Slot ${sIdx + 1}`}
                        className="w-full rounded bg-transparent px-1 py-0.5 text-center text-xs font-extrabold text-[#1B365D] hover:bg-white focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1B365D] read-only:hover:bg-transparent"
                      />
                      <div className="mt-0.5 flex justify-between px-1 font-mono text-[9px] font-semibold text-slate-400">
                        <span>00</span>
                        <span>15</span>
                        <span>30</span>
                        <span>45</span>
                      </div>
                    </th>
                  ))}
                  <th className="w-14 border-b border-r-2 border-r-[#C00000] border-slate-300 px-1 py-1 text-center text-xs font-extrabold text-[#C00000]">
                    Solo
                  </th>
                  <th className="w-14 border-b border-slate-300 px-1 py-1 text-center text-xs font-extrabold text-slate-900">
                    Dual
                  </th>
                </tr>
              </thead>

              <tbody>
                {aircraft.map((ac, acIdx) => {
                  const isBand = acIdx % 2 === 0;
                  const hours = calcAircraftHours(ac.id, schedule.grid);
                  const coveredSlots = getAircraftCoveredSlots(schedule, ac.id);
                  const dayHrsUsed = (hours.soloMin + hours.dualMin) / 60;
                  const inspAfter =
                    ac.hoursToInspection !== undefined ? ac.hoursToInspection - dayHrsUsed : undefined;
                  const acHasSorties = Object.keys(schedule.grid[ac.id] || {}).length > 0;

                  return (
                    <tr key={ac.id} className="bg-white">
                      <td
                        className={`sticky left-0 z-10 border-b border-r-2 border-slate-300 px-2 py-2 text-center align-middle ${
                          isBand ? "bg-slate-50" : "bg-white"
                        }`}
                      >
                        <div className="font-mono text-xs font-extrabold text-slate-900">
                          {ac.registration}
                        </div>
                        {inspAfter !== undefined && (
                          <div
                            className={`mt-0.5 inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-bold ${
                              inspAfter < 0
                                ? "bg-red-100 text-[#C00000]"
                                : inspAfter < 5
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-200/70 text-slate-600"
                            }`}
                          >
                            <Wrench className="h-2.5 w-2.5" />
                            {inspAfter.toFixed(1)}h
                          </div>
                        )}
                        {!ac.serviceable && (
                          <div className="mt-1 space-y-1">
                            <span className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-extrabold text-[#C00000]">
                              UNSVC
                            </span>
                            {!readOnly && acHasSorties && (
                              <button
                                type="button"
                                onClick={() => setReassignAc(ac)}
                                className="flex w-full items-center justify-center gap-0.5 rounded bg-[#C00000] px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-[#9E0000]"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" /> Reassign
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {schedule.timeSlots.map((_, sIdx) => {
                        const sortie = schedule.grid[ac.id]?.[sIdx];
                        const coveredBy = !sortie ? coveredSlots.get(sIdx) : undefined;
                        const disp = sortie
                          ? formatSortieDisplay(sortie, instructors, students)
                          : null;
                        const cellAlerts = conflictCellKeys.get(`${ac.id}:${sIdx}`);
                        const isStudentHighlighted =
                          Boolean(highlightedStudentId) &&
                          sortie?.studentId === highlightedStudentId;
                        const isDraggingThis =
                          activeDrag?.aircraftId === ac.id && activeDrag?.slotIndex === sIdx;
                        const isDropTarget =
                          hoverDrop?.aircraftId === ac.id &&
                          hoverDrop?.slotIndex === sIdx &&
                          !(activeDrag?.aircraftId === ac.id && activeDrag?.slotIndex === sIdx);
                        const isMoveSource =
                          movingSource?.aircraftId === ac.id && movingSource?.slotIndex === sIdx;
                        const isMoveDestination = Boolean(movingSource) && !isMoveSource;

                        return (
                          <td
                            key={sIdx}
                            data-drop-cell={`${ac.id}|${sIdx}`}
                            className={`bg-white border-b border-r border-slate-300 p-1 align-middle ${
                              isStudentHighlighted ? "ring-2 ring-inset ring-amber-500" : ""
                            }`}
                          >
                            <button
                              type="button"
                              onPointerDown={(e) =>
                                beginCardPointerDown(e, ac.id, sIdx, sortie, disp)
                              }
                              onClick={() => handleSlotTap(ac.id, sIdx, Boolean(sortie))}
                              title={
                                cellAlerts
                                  ? cellAlerts.join("\n")
                                  : coveredBy
                                  ? `Aircraft busy (continuing ${coveredBy.fromLabel} sortie)`
                                  : readOnly
                                  ? "Read-Only View (Admin login required to edit)"
                                  : "Tap to assign/edit · Drag grip handle or hold to move/swap"
                              }
                              className={`group relative flex min-h-[54px] w-full select-none flex-col items-center justify-center rounded-lg py-1 text-center transition ${
                                sortie && !readOnly ? "pl-4 pr-1.5" : "px-1.5"
                              } ${readOnly ? "cursor-default" : ""} ${
                                sortie
                                  ? sortie.type === "SOLO"
                                    ? "border border-slate-300 bg-white text-[#C00000] shadow-2xs hover:border-slate-500"
                                    : "border border-slate-300 bg-white text-slate-900 shadow-2xs hover:border-[#1B365D]"
                                  : coveredBy
                                  ? "border border-dashed border-slate-300 bg-white text-slate-600 hover:border-blue-400"
                                  : "border border-dashed border-slate-200/80 bg-white text-slate-400 hover:border-slate-400"
                              } ${cellAlerts ? "ring-2 ring-amber-400" : ""} ${
                                isDraggingThis ? "scale-95 opacity-40 ring-2 ring-blue-400" : ""
                              } ${
                                isDropTarget
                                  ? "scale-[1.02] border-blue-600 bg-blue-50/40 ring-2 ring-blue-600"
                                  : ""
                              } ${
                                isMoveSource
                                  ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-600"
                                  : isMoveDestination
                                  ? "border-dashed border-blue-400 hover:border-blue-600 hover:bg-blue-50/30"
                                  : ""
                              }`}
                            >
                              {!readOnly && sortie && disp && !moveModeActive && !movingSource && (
                                <span
                                  data-drag-handle="1"
                                  onPointerDown={(e) =>
                                    beginHandleDrag(
                                      e,
                                      ac.id,
                                      sIdx,
                                      disp.topLine,
                                      disp.bottomLine || "No student",
                                      sortie.type === "SOLO"
                                    )
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  title="Drag handle — hold & drag to move or swap"
                                  className="touch-none absolute left-0.5 top-1/2 flex h-7 w-4 -translate-y-1/2 cursor-grab items-center justify-center rounded text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </span>
                              )}

                              {sortie && disp ? (
                                <>
                                  <span className="w-full truncate text-[11px] font-extrabold leading-tight">
                                    {disp.topLine}
                                  </span>
                                  <span className="mt-0.5 w-full truncate text-[11px] font-bold leading-tight opacity-90">
                                    {disp.bottomLine || (
                                      <span className="italic text-amber-600">No student</span>
                                    )}
                                  </span>
                                  {cellAlerts && (
                                    <AlertTriangle className="absolute right-0.5 top-0.5 h-3 w-3 text-amber-600" />
                                  )}
                                </>
                              ) : coveredBy ? (
                                <span className="text-[10px] font-bold italic text-blue-700">
                                  ← Cont. ({coveredBy.fromLabel})
                                </span>
                              ) : !readOnly ? (
                                <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold opacity-0 transition group-hover:opacity-100">
                                  <Plus className="h-3 w-3" /> Add
                                </span>
                              ) : null}
                            </button>
                          </td>
                        );
                      })}

                      <td
                        className={`border-b border-r-2 border-r-[#C00000] border-slate-300 px-2 py-2 text-center font-mono text-xs font-extrabold text-[#C00000] ${
                          isBand ? "bg-slate-50" : "bg-white"
                        }`}
                      >
                        {formatMinutes(hours.soloMin, "-")}
                      </td>
                      <td
                        className={`border-b border-slate-300 px-2 py-2 text-center font-mono text-xs font-extrabold text-slate-900 ${
                          isBand ? "bg-slate-50" : "bg-white"
                        }`}
                      >
                        {formatMinutes(hours.dualMin, "-")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="bg-slate-100 font-extrabold">
                  <td
                    colSpan={11}
                    className="border-r border-t-2 border-slate-300 px-3 py-2 text-right text-xs uppercase tracking-wide text-slate-700"
                  >
                    Daily Auto-Calculated Totals (Grand Total:{" "}
                    <span className="text-[#1B365D]">
                      {formatMinutes(totals.grandTotalMin, "0:00")}
                    </span>
                    )
                  </td>
                  <td className="border-r-2 border-t-2 border-r-[#C00000] border-slate-300 px-2 py-2 text-center font-mono text-xs text-[#C00000]">
                    {formatMinutes(totals.totalSoloMin, "0:00")}
                  </td>
                  <td className="border-t-2 border-slate-300 px-2 py-2 text-center font-mono text-xs text-slate-900">
                    {formatMinutes(totals.totalDualMin, "0:00")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          /* Mobile Vertical Aircraft Card View + Sticky Aircraft Quick-Jump Strip */
          <div className="min-w-0 flex-1 space-y-2.5">
            {/* Sticky Horizontal Aircraft Quick-Jump Bar (< 768px) */}
            <div
              role="tablist"
              aria-label="Aircraft quick jump"
              className="no-scrollbar sticky top-[50px] z-20 -mx-3 flex items-center gap-1.5 overflow-x-auto border-b border-slate-200/80 bg-slate-100/95 px-3 py-1.5 backdrop-blur-xs md:hidden"
            >
              <button
                type="button"
                onClick={() => setSelectedMobileAcId("ALL")}
                className={`min-h-[34px] shrink-0 rounded-full px-3 text-xs font-extrabold transition ${
                  selectedMobileAcId === "ALL"
                    ? "bg-[#1B365D] text-white shadow-2xs"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                All ({aircraft.length})
              </button>
              {aircraft.map((ac) => {
                const isActive = selectedMobileAcId === ac.id;
                const acSortieCnt = Object.keys(schedule.grid[ac.id] || {}).length;
                return (
                  <button
                    key={ac.id}
                    type="button"
                    onClick={() => setSelectedMobileAcId(ac.id)}
                    className={`inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-full px-3 font-mono text-xs font-extrabold transition ${
                      isActive
                        ? "bg-[#1B365D] text-white shadow-2xs"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <span>{ac.registration}</span>
                    {acSortieCnt > 0 && (
                      <span
                        className={`rounded-full px-1 text-[10px] font-bold ${
                          isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {acSortieCnt}
                      </span>
                    )}
                    {!ac.serviceable && (
                      <span className="h-2 w-2 rounded-full bg-[#C00000]" title="UNSVC" />
                    )}
                  </button>
                );
              })}
            </div>

            {filteredMobileAircraft.map((ac) => {
              const hours = calcAircraftHours(ac.id, schedule.grid);
              const coveredSlots = getAircraftCoveredSlots(schedule, ac.id);
              const dayHrsUsed = (hours.soloMin + hours.dualMin) / 60;
              const inspAfter =
                ac.hoursToInspection !== undefined ? ac.hoursToInspection - dayHrsUsed : undefined;

              return (
                <div
                  key={ac.id}
                  className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1B365D] px-3.5 py-2.5 text-white">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-extrabold">{ac.registration}</span>
                      {inspAfter !== undefined && (
                        <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold">
                          Insp: {inspAfter.toFixed(1)}h left
                        </span>
                      )}
                      {!ac.serviceable && (
                        <span className="rounded bg-[#C00000] px-1.5 py-0.5 text-[10px] font-bold">
                          UNSVC
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs font-bold">
                      <span className="rounded bg-white/95 px-2 py-0.5 text-[#C00000]">
                        Solo {formatMinutes(hours.soloMin, "-")}
                      </span>
                      <span className="rounded bg-white/95 px-2 py-0.5 text-slate-900">
                        Dual {formatMinutes(hours.dualMin, "-")}
                      </span>
                      {!readOnly && !ac.serviceable && Object.keys(schedule.grid[ac.id] || {}).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setReassignAc(ac)}
                          className="rounded bg-[#C00000] px-2 py-0.5 text-[10px] font-bold text-white"
                        >
                          Reassign
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2.5 sm:grid-cols-5">
                    {schedule.timeSlots.map((slotLabel, sIdx) => {
                      const sortie = schedule.grid[ac.id]?.[sIdx];
                      const coveredBy = !sortie ? coveredSlots.get(sIdx) : undefined;
                      const disp = sortie
                        ? formatSortieDisplay(sortie, instructors, students)
                        : null;
                      const alerts = conflictCellKeys.get(`${ac.id}:${sIdx}`);
                      const isDraggingThis =
                        activeDrag?.aircraftId === ac.id && activeDrag?.slotIndex === sIdx;
                      const isDropTarget =
                        hoverDrop?.aircraftId === ac.id &&
                        hoverDrop?.slotIndex === sIdx &&
                        !(activeDrag?.aircraftId === ac.id && activeDrag?.slotIndex === sIdx);
                      const isMoveSource =
                        movingSource?.aircraftId === ac.id && movingSource?.slotIndex === sIdx;
                      const isMoveDestination = Boolean(movingSource) && !isMoveSource;

                      return (
                        <button
                          key={sIdx}
                          type="button"
                          data-drop-cell={`${ac.id}|${sIdx}`}
                          onPointerDown={(e) => beginCardPointerDown(e, ac.id, sIdx, sortie, disp)}
                          onClick={() => handleSlotTap(ac.id, sIdx, Boolean(sortie))}
                          className={`relative flex min-h-[76px] select-none flex-col items-start justify-between rounded-xl border p-2.5 text-left text-xs transition active:scale-[0.98] ${
                            sortie
                              ? sortie.type === "SOLO"
                                ? "border-slate-300 bg-white text-[#C00000] shadow-2xs"
                                : "border-slate-300 bg-white text-slate-900 shadow-2xs"
                              : coveredBy
                              ? "border-dashed border-slate-300 bg-white text-slate-600"
                              : "border-dashed border-slate-200 bg-white text-slate-400 hover:border-slate-400"
                          } ${alerts ? "ring-2 ring-amber-400" : ""} ${
                            isDraggingThis ? "scale-95 opacity-40 ring-2 ring-blue-400" : ""
                          } ${
                            isDropTarget
                              ? "scale-[1.02] border-blue-600 bg-blue-50/40 ring-2 ring-blue-600"
                              : ""
                          } ${
                            isMoveSource
                              ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-600"
                              : isMoveDestination
                              ? "border-dashed border-blue-400 bg-blue-50/20"
                              : ""
                          }`}
                        >
                          <div className="flex w-full items-center justify-between gap-1 text-[10px] font-bold uppercase text-slate-500">
                            <span>{slotLabel || `Slot ${sIdx + 1}`}</span>
                            <span className="flex items-center gap-1">
                              {alerts && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                              {!readOnly && sortie && disp && !moveModeActive && !movingSource && (
                                <span
                                  data-drag-handle="1"
                                  onPointerDown={(e) =>
                                    beginHandleDrag(
                                      e,
                                      ac.id,
                                      sIdx,
                                      disp.topLine,
                                      disp.bottomLine || "No student",
                                      sortie.type === "SOLO"
                                    )
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  title="Drag handle — hold & drag to move or swap"
                                  className="touch-none -mr-1.5 -mt-1.5 flex h-8 w-7 cursor-grab items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </span>
                              )}
                            </span>
                          </div>
                          {sortie && disp ? (
                            <div className="mt-1 w-full">
                              <div className="truncate text-[12px] font-extrabold leading-tight">
                                {disp.topLine}
                              </div>
                              <div className="mt-0.5 truncate text-[12px] font-semibold leading-tight opacity-90">
                                {disp.bottomLine || "No student"}
                              </div>
                            </div>
                          ) : coveredBy ? (
                            <div className="mt-1 text-[11px] font-semibold italic text-blue-700">
                              Cont. ({coveredBy.fromLabel})
                            </div>
                          ) : !readOnly ? (
                            <div className="mt-1 text-xs font-semibold">+ Assign</div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dedicated Standby Strip */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
              Standby Queue / احتياطي ({schedule.standby.length})
            </h3>
            <p className="text-[11px] text-slate-500">
              Students on standby for quick NO SHOW replacement (exported directly above Notes).
            </p>
          </div>
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={standbyPickId}
                onChange={(e) => setStandbyPickId(e.target.value)}
                className="min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-base font-semibold md:text-xs"
              >
                <option value="">Select student for Standby...</option>
                {students
                  .filter((s) => s.fit && !schedule.standby.some((sb) => sb.studentId === s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.program})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!standbyPickId}
                onClick={() => {
                  if (!standbyPickId) return;
                  updateMeta({
                    standby: [
                      ...schedule.standby,
                      { id: `sb-${Date.now().toString(36)}`, studentId: standbyPickId, highlight: false },
                    ],
                  });
                  setStandbyPickId("");
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-[#1B365D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#142947] disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {schedule.standby.length === 0 ? (
            <span className="text-xs italic text-slate-400">
              No standby students queued for this date yet.
            </span>
          ) : (
            schedule.standby.map((sb) => {
              const stu = students.find((s) => s.id === sb.studentId);
              return (
                <div
                  key={sb.id}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${
                    sb.highlight
                      ? "border-red-300 bg-red-50 text-[#C00000]"
                      : "border-blue-200 bg-[#E9F2FB] text-slate-900"
                  }`}
                >
                  <span>{stu?.name || "Unknown"}</span>
                  {!readOnly && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          updateMeta({
                            standby: schedule.standby.map((item) =>
                              item.id === sb.id ? { ...item, highlight: !item.highlight } : item
                            ),
                          })
                        }
                        className="rounded bg-white/80 px-1 py-0.5 text-[9px] font-extrabold text-slate-600 hover:bg-white"
                        title="Toggle red priority highlight"
                      >
                        {sb.highlight ? "RED" : "STD"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateMeta({
                            standby: schedule.standby.filter((item) => item.id !== sb.id),
                          })
                        }
                        className="text-slate-400 hover:text-[#C00000]"
                        title="Remove from standby"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Weather Forecast, Briefings & Standing Notes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-5">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
              <CloudSun className="h-4 w-4" />
              Weather Forecast (HEAT)
            </div>
            <button
              type="button"
              onClick={handleFetchWeather}
              disabled={fetchingWx}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-[#1B365D] hover:bg-blue-100 disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${fetchingWx ? "animate-spin" : ""}`} />
              {fetchingWx ? "Fetching HEAT..." : "Fetch Assiut Weather"}
            </button>
          </div>

          {schedule.weatherMeta?.advisory && (
            <div
              className={`mb-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                (schedule.weatherMeta.maxCrosswindKt ?? 0) >= 12
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {schedule.weatherMeta.advisory}
            </div>
          )}
          {wxError && (
            <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-[#C00000]">
              {wxError}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {schedule.weather.map((w, idx) => (
              <div key={idx} className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <input
                  type="text"
                  readOnly={readOnly}
                  value={w.time}
                  onChange={(e) => {
                    const nextW = schedule.weather.map((item, i) =>
                      i === idx ? { ...item, time: e.target.value } : item
                    );
                    updateMeta({ weather: nextW });
                  }}
                  className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center text-xs font-bold text-[#1B365D]"
                />
                <input
                  type="text"
                  readOnly={readOnly}
                  value={w.wind.replace("\n", " ")}
                  onChange={(e) => {
                    const nextW = schedule.weather.map((item, i) =>
                      i === idx ? { ...item, wind: e.target.value } : item
                    );
                    updateMeta({ weather: nextW });
                  }}
                  placeholder="Wind (D/KTS)"
                  className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center text-base font-semibold md:text-[11px]"
                />
                <input
                  type="text"
                  readOnly={readOnly}
                  value={w.temp}
                  onChange={(e) => {
                    const nextW = schedule.weather.map((item, i) =>
                      i === idx ? { ...item, temp: e.target.value } : item
                    );
                    updateMeta({ weather: nextW });
                  }}
                  placeholder="TEMP °C"
                  className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center text-base font-bold md:text-xs"
                />
                <div className="flex items-center gap-1">
                  <span className="shrink-0 text-[9px] font-bold uppercase text-slate-500">
                    Vis km
                  </span>
                  <input
                    type="number"
                    readOnly={readOnly}
                    step="0.5"
                    min="0"
                    value={w.visibilityKm ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const parsed = raw === "" ? undefined : Number(raw);
                      const nextW = schedule.weather.map((item, i) =>
                        i === idx
                          ? {
                              ...item,
                              visibilityKm:
                                parsed !== undefined && Number.isFinite(parsed)
                                  ? parsed
                                  : undefined,
                            }
                          : item
                      );
                      updateMeta({ weather: nextW });
                    }}
                    placeholder="≥5.0"
                    className={`w-full rounded border bg-white px-1 py-0.5 text-center text-base font-bold md:text-[11px] ${
                      w.visibilityKm !== undefined && w.visibilityKm < PPL_MIN_VFR_VISIBILITY_KM
                        ? "border-red-400 bg-red-50 text-[#C00000]"
                        : "border-slate-200 text-slate-700"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] font-bold uppercase text-slate-500">
                Mass Briefing
              </span>
              <input
                type="text"
                readOnly={readOnly}
                value={schedule.massBriefing}
                onChange={(e) => updateMeta({ massBriefing: e.target.value })}
                placeholder={readOnly ? "-" : "Time / room..."}
                className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-base font-semibold read-only:bg-slate-50 md:text-xs"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase text-slate-500">
                Exams
              </span>
              <input
                type="text"
                readOnly={readOnly}
                value={schedule.exams}
                onChange={(e) => updateMeta({ exams: e.target.value })}
                placeholder={readOnly ? "-" : "Exam details..."}
                className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-base font-semibold read-only:bg-slate-50 md:text-xs"
              />
            </label>
          </div>
        </div>

        {/* Standing Notes */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-7">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#1B365D]">
              Standing Flight Instructions (Notes)
            </span>
          </div>
          <div className="space-y-2">
            {schedule.notes.map((n, idx) => (
              <div key={idx} className="flex items-start gap-2">
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextNotes = schedule.notes.map((item, i) =>
                        i === idx ? { ...item, highlight: !item.highlight } : item
                      );
                      updateMeta({ notes: nextNotes });
                    }}
                    className={`mt-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      n.highlight ? "bg-red-100 text-[#C00000]" : "bg-slate-100 text-slate-600"
                    }`}
                    title="Toggle red alert highlight"
                  >
                    {n.highlight ? "RED" : "STD"}
                  </button>
                )}
                <input
                  type="text"
                  readOnly={readOnly}
                  value={n.text}
                  onChange={(e) => {
                    const nextNotes = schedule.notes.map((item, i) =>
                      i === idx ? { ...item, text: e.target.value } : item
                    );
                    updateMeta({ notes: nextNotes });
                  }}
                  className={`w-full rounded-md border border-slate-200 px-2.5 py-1 text-base font-semibold focus:border-[#1B365D] focus:outline-none read-only:bg-slate-50 md:text-xs ${
                    n.highlight ? "text-[#C00000] underline" : "text-slate-800"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal for Editing / Assigning Sortie */}
      {!readOnly && editingCell && activeAc && (
        <SortieModal
          aircraft={activeAc}
          slotIndex={editingCell.slotIndex}
          schedule={schedule}
          group={group}
          instructors={instructors}
          students={students}
          allAircraft={aircraft}
          existingSortie={existingSortie}
          onSave={(sortie) => handleSaveSortie(activeAc.id, editingCell.slotIndex, sortie)}
          onClear={() => handleClearSortie(activeAc.id, editingCell.slotIndex)}
          onClose={() => setEditingCell(null)}
          onQuickAddStudent={onQuickAddStudent}
          onUpdateStudentProgram={(stuId, program) =>
            onChangeStudents(
              students.map((s) => (s.id === stuId ? { ...s, program } : s))
            )
          }
          onNoShowSwap={(absId, repId) =>
            handleNoShowSwap(activeAc.id, editingCell.slotIndex, absId, repId)
          }
          onStartMove={
            existingSortie
              ? () => {
                  setMovingSource({
                    aircraftId: activeAc.id,
                    slotIndex: editingCell.slotIndex,
                  });
                  setMoveModeActive(true);
                  setEditingCell(null);
                }
              : undefined
          }
        />
      )}

      {/* Aircraft Reassignment Modal */}
      {!readOnly && reassignAc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3"
          onClick={() => setReassignAc(null)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-[#C00000] px-4 py-3 text-white">
              <div className="font-bold">
                Reassign Sorties from {reassignAc.registration} (Unserviceable)
              </div>
              <button type="button" onClick={() => setReassignAc(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 p-4 text-xs">
              {reassignMoves.map((m, i) => {
                const stuName =
                  students.find((s) => s.id === m.sortie.studentId)?.name || "Unassigned";
                const srcTime = schedule.timeSlots[m.sourceSlotIndex] || `Slot ${m.sourceSlotIndex + 1}`;
                const dstTime =
                  m.targetSlotIndex !== null
                    ? schedule.timeSlots[m.targetSlotIndex] || `Slot ${m.targetSlotIndex + 1}`
                    : "";
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <span className="font-bold">{stuName}</span> · {srcTime} (
                      {formatDurationCompact(m.sortie.durationMin)})
                    </div>
                    {m.targetAcReg ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                        → {m.targetAcReg} ({dstTime})
                      </span>
                    ) : (
                      <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-[#C00000]">
                        No conflict-free slot
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={() => setReassignAc(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyReassignment}
                className="rounded-lg bg-[#1B365D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#142947]"
              >
                Apply Available Moves
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Touch / Mouse Drag Ghost Pill */}
      {activeDrag && (
        <div
          className="pointer-events-none fixed z-[80] w-40 rounded-xl border-2 border-blue-600 bg-white px-2.5 py-1.5 text-center shadow-2xl"
          style={{
            left: activeDrag.x,
            top: activeDrag.y,
            transform: "translate(-50%, -115%)",
          }}
        >
          <div
            className={`truncate text-[11px] font-extrabold leading-tight ${
              activeDrag.isSolo ? "text-[#C00000]" : "text-slate-900"
            }`}
          >
            {activeDrag.label}
          </div>
          <div className="mt-0.5 truncate text-[11px] font-bold leading-tight text-slate-700">
            {activeDrag.subLabel}
          </div>
        </div>
      )}

      {/* Sticky Bottom 1-Tap Move / Swap Bar */}
      {(moveModeActive || movingSource) && (
        <div className="fixed inset-x-3 bottom-[calc(4.1rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center justify-between gap-2 rounded-xl border border-blue-500 bg-[#1B365D] px-4 py-2.5 text-xs font-bold text-white shadow-2xl md:bottom-3">
          <div className="flex min-w-0 items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 shrink-0 text-blue-300" />
            <span className="truncate">
              {movingSource
                ? (() => {
                    const srcAcReg =
                      aircraft.find((a) => a.id === movingSource.aircraftId)?.registration ||
                      movingSource.aircraftId;
                    const srcSlotLbl =
                      schedule.timeSlots[movingSource.slotIndex] ||
                      `Slot ${movingSource.slotIndex + 1}`;
                    return `Moving: ${srcAcReg} · ${srcSlotLbl} — Tap any slot to move or swap`;
                  })()
                : "Move Mode — Tap any occupied slot to pick it up"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setMovingSource(null);
              setMoveModeActive(false);
            }}
            className="shrink-0 rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-white/25"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Undo Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed right-3 z-50 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/95 px-3.5 py-2 text-xs font-bold text-white shadow-xl md:right-4 ${
            moveModeActive || movingSource
              ? "bottom-[calc(7.6rem+env(safe-area-inset-bottom))] md:bottom-16"
              : "bottom-[calc(4.1rem+env(safe-area-inset-bottom))] md:bottom-4"
          }`}
        >
          <span>{toastMsg.text}</span>
          {toastMsg.canUndo && undoStack.length > 0 && (
            <button
              type="button"
              onClick={handleUndo}
              className="inline-flex items-center gap-1 rounded-md bg-blue-500 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-blue-400"
            >
              <Undo2 className="h-3 w-3" />
              Undo
            </button>
          )}
        </div>
      )}

      {/* Edit Captain / Instructor Name Modal */}
      {!readOnly && editingInstructor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-3"
          onClick={() => setEditingInstructor(null)}
        >
          <form
            onSubmit={saveEditInstructor}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-t-2xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-xl sm:pb-0"
          >
            <div className="flex items-center justify-between bg-[#1B365D] px-4 py-3 text-white">
              <div className="text-sm font-bold">Edit Captain / Instructor Name</div>
              <button
                type="button"
                onClick={() => setEditingInstructor(null)}
                className="rounded p-1 hover:bg-white/15"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-xs">
              <label className="block">
                <span className="font-bold text-slate-700">Full Name (English)</span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editingInstructor.name}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditingInstructor((cur) =>
                      cur
                        ? {
                            ...cur,
                            name: v,
                            shortName: cur.shortTouched ? cur.shortName : v,
                          }
                        : null
                    );
                  }}
                  placeholder="e.g. Capt. Khedr"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-semibold text-slate-900 focus:border-[#1B365D] focus:outline-none sm:text-xs"
                />
              </label>
              <label className="block">
                <span className="font-bold text-slate-700">
                  Slot Label (English — shown inside timetable boxes)
                </span>
                <input
                  type="text"
                  value={editingInstructor.shortName}
                  onChange={(e) =>
                    setEditingInstructor((cur) =>
                      cur ? { ...cur, shortName: e.target.value, shortTouched: true } : null
                    )
                  }
                  placeholder="e.g. Capt. Khedr"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-semibold text-slate-900 focus:border-[#1B365D] focus:outline-none sm:text-xs"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="font-bold text-slate-700">Arabic Name</span>
                  <input
                    type="text"
                    dir="rtl"
                    value={editingInstructor.nameAr}
                    onChange={(e) =>
                      setEditingInstructor((cur) =>
                        cur ? { ...cur, nameAr: e.target.value } : null
                      )
                    }
                    placeholder="ك/ خضر"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-semibold text-slate-900 focus:border-[#1B365D] focus:outline-none sm:text-xs"
                  />
                </label>
                <label className="block">
                  <span className="font-bold text-slate-700">Arabic Slot Label</span>
                  <input
                    type="text"
                    dir="rtl"
                    value={editingInstructor.shortNameAr}
                    onChange={(e) =>
                      setEditingInstructor((cur) =>
                        cur ? { ...cur, shortNameAr: e.target.value } : null
                      )
                    }
                    placeholder="ك/ خضر"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-semibold text-slate-900 focus:border-[#1B365D] focus:outline-none sm:text-xs"
                  />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={() => setEditingInstructor(null)}
                className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-[#1B365D] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#142947]"
              >
                <Check className="h-3.5 w-3.5" /> Save Captain Name
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
