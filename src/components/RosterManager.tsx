import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  Pencil,
  Plane,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Aircraft, Instructor, Student, StudentProgram } from "../types";
import {
  computeEmptyMoment,
  EAA_FLEET_WB_RECORDS,
  getWeighingDueStatus,
  lookupFleetWeightRecord,
} from "../data/fleetWeightBalance";

interface RosterManagerProps {
  instructors: Instructor[];
  students: Student[];
  aircraft: Aircraft[];
  readOnly?: boolean;
  onRequestAdminLogin?: () => void;
  onChangeInstructors: (next: Instructor[]) => void;
  onChangeStudents: (next: Student[]) => void;
  onChangeAircraft: (next: Aircraft[]) => void;
}

export const RosterManager: React.FC<RosterManagerProps> = ({
  instructors,
  students,
  aircraft,
  readOnly = false,
  onRequestAdminLogin,
  onChangeInstructors,
  onChangeStudents,
  onChangeAircraft,
}) => {
  const [stuSearch, setStuSearch] = useState("");
  const [stuName, setStuName] = useState("");
  const [stuNameAr, setStuNameAr] = useState("");
  const [stuProgram, setStuProgram] = useState<StudentProgram>("PPL");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkProgram, setBulkProgram] = useState<StudentProgram>("PPL");

  const [instName, setInstName] = useState("");
  const [instShort, setInstShort] = useState("");
  const [instNameAr, setInstNameAr] = useState("");
  const [acReg, setAcReg] = useState("");
  const [fleetWbSearch, setFleetWbSearch] = useState("");
  const [mobileSubTab, setMobileSubTab] = useState<"students" | "instructors" | "aircraft">(
    "students"
  );

  // Inline student edit state
  const [editingStuId, setEditingStuId] = useState<string | null>(null);
  const [editStuName, setEditStuName] = useState("");
  const [editStuNameAr, setEditStuNameAr] = useState("");
  const [editStuProg, setEditStuProg] = useState<StudentProgram>("PPL");

  // Inline instructor edit state
  const [editingInstId, setEditingInstId] = useState<string | null>(null);
  const [editInstName, setEditInstName] = useState("");
  const [editInstShort, setEditInstShort] = useState("");
  const [editInstNameAr, setEditInstNameAr] = useState("");
  const [editInstShortAr, setEditInstShortAr] = useState("");
  const [editInstShortTouched, setEditInstShortTouched] = useState(false);

  const startEditStudent = (stu: Student) => {
    setEditingStuId(stu.id);
    setEditStuName(stu.name);
    setEditStuNameAr(stu.nameAr || "");
    setEditStuProg(stu.program);
  };

  const saveEditStudent = () => {
    if (!editingStuId) return;
    const trimmed = editStuName.trim();
    if (!trimmed) return;
    const trimmedAr = editStuNameAr.trim() || undefined;
    onChangeStudents(
      students.map((s) =>
        s.id === editingStuId
          ? { ...s, name: trimmed, nameAr: trimmedAr, program: editStuProg }
          : s
      )
    );
    setEditingStuId(null);
  };

  const startEditInstructor = (inst: Instructor) => {
    setEditingInstId(inst.id);
    setEditInstName(inst.name);
    const currentShort = inst.shortName || inst.name;
    setEditInstShort(currentShort);
    setEditInstNameAr(inst.nameAr || "");
    setEditInstShortAr(inst.shortNameAr || inst.nameAr || "");
    setEditInstShortTouched(currentShort !== inst.name);
  };

  const saveEditInstructor = () => {
    if (!editingInstId) return;
    const trimmedName = editInstName.trim();
    if (!trimmedName) return;
    const trimmedShort = editInstShort.trim() || trimmedName;
    const trimmedAr = editInstNameAr.trim() || undefined;
    const trimmedShortAr = editInstShortAr.trim() || trimmedAr;
    onChangeInstructors(
      instructors.map((i) =>
        i.id === editingInstId
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
    setEditingInstId(null);
  };

  const filteredStudents = useMemo(() => {
    const q = stuSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || s.program.toLowerCase().includes(q)
    );
  }, [students, stuSearch]);

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const name = stuName.trim();
    if (!name) return;
    const next: Student = {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name,
      nameAr: stuNameAr.trim() || undefined,
      program: stuProgram,
      fit: true,
    };
    onChangeStudents([...students, next]);
    setStuName("");
    setStuNameAr("");
  };

  const handleBulkAddStudents = () => {
    const rawNames = bulkText
      .split(/[\r\n,]+/)
      .map((s) => s.replace(/^\d+[\.\-\)\s]+/, "").trim())
      .filter(Boolean);
    if (rawNames.length === 0) return;

    const existingSet = new Set(students.map((s) => s.name.toLowerCase()));
    const additions: Student[] = [];
    rawNames.forEach((name, idx) => {
      if (existingSet.has(name.toLowerCase())) return;
      existingSet.add(name.toLowerCase());
      additions.push({
        id: `st-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        name,
        program: bulkProgram,
        fit: true,
      });
    });

    if (additions.length > 0) {
      onChangeStudents([...students, ...additions]);
    }
    setBulkText("");
    setBulkOpen(false);
  };

  const handleAddInstructor = (e: React.FormEvent) => {
    e.preventDefault();
    const name = instName.trim();
    if (!name) return;
    const arVal = instNameAr.trim() || undefined;
    const next: Instructor = {
      id: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name,
      shortName: instShort.trim() || name,
      nameAr: arVal,
      shortNameAr: arVal,
      fit: true,
      maxDailyMin: 360,
    };
    onChangeInstructors([...instructors, next]);
    setInstName("");
    setInstShort("");
    setInstNameAr("");
  };

  const buildAircraftWithWb = (regRaw: string): Aircraft => {
    const reg = regRaw.trim().toUpperCase();
    const rec = lookupFleetWeightRecord(reg);
    return {
      id: `ac-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      registration: reg,
      serviceable: true,
      hoursToInspection: 50,
      inspectionType: "50-Hr",
      ...(rec
        ? {
            basicEmptyWeightLb: rec.basicEmptyWeightLb,
            emptyArmIn: rec.emptyArmIn,
            weighingDate: rec.weighingDate,
            weighingDueDate: rec.weighingDueDate,
          }
        : {}),
    };
  };

  const handleAddAircraft = (e: React.FormEvent) => {
    e.preventDefault();
    const reg = acReg.trim().toUpperCase();
    if (!reg) return;
    onChangeAircraft([...aircraft, buildAircraftWithWb(reg)]);
    setAcReg("");
  };

  const filteredFleetWb = useMemo(() => {
    const q = fleetWbSearch.trim().toLowerCase();
    if (!q) return EAA_FLEET_WB_RECORDS;
    return EAA_FLEET_WB_RECORDS.filter(
      (r) =>
        r.registration.toLowerCase().includes(q) ||
        r.aircraftClass.toLowerCase().includes(q) ||
        r.weighingDate.includes(q) ||
        r.weighingDueDate.includes(q)
    );
  }, [fleetWbSearch]);

  return (
    <div className="space-y-3">
      {readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs text-[#1B365D]">
          <div className="flex items-center gap-2 font-bold">
            <Eye className="h-4 w-4 shrink-0" />
            <span>
              Read-Only View — Sign in as Admin to add or edit students, instructors, or aircraft.
            </span>
          </div>
          {onRequestAdminLogin && (
            <button
              type="button"
              onClick={onRequestAdminLogin}
              className="rounded-lg bg-[#1B365D] px-3 py-1.5 text-xs font-extrabold text-white hover:bg-[#142947]"
            >
              Admin Login
            </button>
          )}
        </div>
      )}

      {/* Mobile Portrait Sub-Tab Bar (< 1024px) */}
      <div
        role="tablist"
        aria-label="Roster sections"
        className="grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-200/80 p-1 lg:hidden"
      >
        <button
          type="button"
          onClick={() => setMobileSubTab("students")}
          className={`min-h-[40px] rounded-lg px-2 text-xs font-extrabold transition ${
            mobileSubTab === "students"
              ? "bg-white text-[#1B365D] shadow-2xs"
              : "text-slate-600"
          }`}
        >
          Students ({students.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileSubTab("instructors")}
          className={`min-h-[40px] rounded-lg px-2 text-xs font-extrabold transition ${
            mobileSubTab === "instructors"
              ? "bg-white text-[#1B365D] shadow-2xs"
              : "text-slate-600"
          }`}
        >
          Captains ({instructors.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileSubTab("aircraft")}
          className={`min-h-[40px] rounded-lg px-2 text-xs font-extrabold transition ${
            mobileSubTab === "aircraft"
              ? "bg-white text-[#1B365D] shadow-2xs"
              : "text-slate-600"
          }`}
        >
          Fleet ({aircraft.length})
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Students Panel (5 cols) */}
        <section
          className={`flex-col rounded-xl border border-slate-200 bg-white shadow-xs lg:col-span-5 ${
            mobileSubTab === "students" ? "flex" : "hidden lg:flex"
          }`}
        >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#1B365D]" />
            <h2 className="text-sm font-bold text-slate-900">
              Students Roster ({students.length})
            </h2>
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-[#C00000]">
              {students.filter((s) => s.program === "IRCPL").length} IRCPL
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700">
              {students.filter((s) => s.program === "PPL").length} PPL
            </span>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setBulkOpen((v) => !v)}
              className="rounded-lg border border-[#1B365D]/30 bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#1B365D] hover:bg-blue-100"
            >
              {bulkOpen ? "Close Bulk Paste" : "+ Bulk Paste Names"}
            </button>
          )}
        </div>

        <div className="space-y-3 p-4">
          {!readOnly && (
            <form onSubmit={handleAddStudent} className="flex flex-wrap gap-2">
              <input
                type="text"
                value={stuName}
                onChange={(e) => setStuName(e.target.value)}
                placeholder="Student name (EN)..."
                className="min-w-[130px] flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-base focus:border-[#1B365D] focus:outline-none sm:text-xs"
              />
              <input
                type="text"
                dir="rtl"
                value={stuNameAr}
                onChange={(e) => setStuNameAr(e.target.value)}
                placeholder="الاسم بالعربي (اختياري)"
                className="min-w-[120px] flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-base focus:border-[#1B365D] focus:outline-none sm:text-xs"
              />
              <select
                value={stuProgram}
                onChange={(e) => setStuProgram(e.target.value as StudentProgram)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base font-bold sm:text-xs"
              >
                <option value="PPL">PPL</option>
                <option value="IRCPL">IRCPL</option>
              </select>
              <button
                type="submit"
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-[#1B365D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#142947]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </form>
          )}

          {!readOnly && bulkOpen && (
            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1B365D]">
                  Paste multiple names (one per line or comma-separated)
                </span>
                <select
                  value={bulkProgram}
                  onChange={(e) => setBulkProgram(e.target.value as StudentProgram)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold"
                >
                  <option value="PPL">Add to PPL</option>
                  <option value="IRCPL">Add to IRCPL</option>
                </select>
              </div>
              <textarea
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"1. Student One\n2. Student Two\nStudent Three"}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs focus:border-[#1B365D] focus:outline-none"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleBulkAddStudents}
                  className="rounded-lg bg-[#1B365D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#142947]"
                >
                  Import Students
                </button>
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 sm:top-2" />
            <input
              type="text"
              value={stuSearch}
              onChange={(e) => setStuSearch(e.target.value)}
              placeholder="Filter students..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-base focus:border-[#1B365D] focus:bg-white focus:outline-none sm:text-xs"
            />
          </div>

          <div className="max-h-[440px] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {filteredStudents.map((stu, idx) =>
              editingStuId === stu.id ? (
                <div
                  key={stu.id}
                  className="space-y-2 bg-blue-50/50 px-3 py-2.5 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveEditStudent();
                    } else if (e.key === "Escape") {
                      setEditingStuId(null);
                    }
                  }}
                >
                  <div className="flex flex-wrap gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={editStuName}
                      onChange={(e) => setEditStuName(e.target.value)}
                      placeholder="Student name (EN)"
                      className="min-w-[120px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold focus:border-[#1B365D] focus:outline-none"
                    />
                    <input
                      type="text"
                      dir="rtl"
                      value={editStuNameAr}
                      onChange={(e) => setEditStuNameAr(e.target.value)}
                      placeholder="الاسم بالعربي"
                      className="min-w-[100px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-[#1B365D] focus:outline-none"
                    />
                    <select
                      value={editStuProg}
                      onChange={(e) => setEditStuProg(e.target.value as StudentProgram)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold"
                    >
                      <option value="PPL">PPL</option>
                      <option value="IRCPL">IRCPL</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingStuId(null)}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                    >
                      <X className="h-3 w-3" /> Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEditStudent}
                      className="inline-flex items-center gap-1 rounded bg-[#1B365D] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#142947]"
                    >
                      <Check className="h-3 w-3" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={stu.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-slate-50"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="w-5 shrink-0 text-right font-mono text-[11px] text-slate-400">
                      {idx + 1}.
                    </span>
                    {readOnly ? (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                          stu.program === "IRCPL"
                            ? "bg-red-100 text-[#C00000]"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {stu.program}
                      </span>
                    ) : (
                      <div
                        role="group"
                        aria-label={`Program for ${stu.name}`}
                        className="inline-flex shrink-0 rounded-md border border-slate-300 bg-slate-100 p-0.5"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onChangeStudents(
                              students.map((s) => (s.id === stu.id ? { ...s, program: "PPL" } : s))
                            )
                          }
                          className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold transition ${
                            stu.program === "PPL"
                              ? "bg-[#1B365D] text-white shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          PPL
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeStudents(
                              students.map((s) => (s.id === stu.id ? { ...s, program: "IRCPL" } : s))
                            )
                          }
                          className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold transition ${
                            stu.program === "IRCPL"
                              ? "bg-[#C00000] text-white shadow-2xs"
                              : "text-slate-600 hover:text-[#C00000]"
                          }`}
                        >
                          IRCPL
                        </button>
                      </div>
                    )}
                    <span
                      onClick={() => !readOnly && startEditStudent(stu)}
                      title={readOnly ? stu.name : "Click to edit student name"}
                      className={`${readOnly ? "" : "cursor-pointer hover:text-[#1B365D]"} truncate font-semibold ${
                        stu.fit ? "text-slate-900" : "text-slate-400 line-through"
                      }`}
                    >
                      {stu.name}
                      {stu.nameAr ? (
                        <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                          ({stu.nameAr})
                        </span>
                      ) : null}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => startEditStudent(stu)}
                        className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-[#1B365D]"
                        title="Edit student name & program"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {readOnly ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold ${
                          stu.fit ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {stu.fit ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Fit
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-3 w-3" /> Unfit
                          </>
                        )}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onChangeStudents(
                            students.map((s) => (s.id === stu.id ? { ...s, fit: !s.fit } : s))
                          )
                        }
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold ${
                          stu.fit
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                        }`}
                      >
                        {stu.fit ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Fit
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-3 w-3" /> Unfit
                          </>
                        )}
                      </button>
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => onChangeStudents(students.filter((s) => s.id !== stu.id))}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-[#C00000]"
                        title="Remove student"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Instructors Panel (3 cols) */}
      <section
        className={`flex-col rounded-xl border border-slate-200 bg-white shadow-xs lg:col-span-3 ${
          mobileSubTab === "instructors" ? "flex" : "hidden lg:flex"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <UserCheck className="h-4 w-4 text-[#1B365D]" />
          <h2 className="text-sm font-bold text-slate-900">
            Instructors ({instructors.length})
          </h2>
        </div>

        <div className="space-y-3 p-4">
          {!readOnly && (
            <form onSubmit={handleAddInstructor} className="space-y-2">
              <input
                type="text"
                value={instName}
                onChange={(e) => setInstName(e.target.value)}
                placeholder="Full name EN (e.g. Capt. Mohamed Salah)"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-base focus:border-[#1B365D] focus:outline-none sm:text-xs"
              />
              <input
                type="text"
                dir="rtl"
                value={instNameAr}
                onChange={(e) => setInstNameAr(e.target.value)}
                placeholder="الاسم بالعربي (مثل: ك/ محمد صلاح)"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-base focus:border-[#1B365D] focus:outline-none sm:text-xs"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={instShort}
                  onChange={(e) => setInstShort(e.target.value)}
                  placeholder="Slot label (optional)"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-base focus:border-[#1B365D] focus:outline-none sm:text-xs"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-[#1B365D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#142947]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {instructors.map((inst) => (
              <div
                key={inst.id}
                className="space-y-1.5 px-3 py-2.5 text-xs hover:bg-slate-50"
              >
                {!readOnly && editingInstId === inst.id ? (
                  <div
                    className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-2.5"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEditInstructor();
                      } else if (e.key === "Escape") {
                        setEditingInstId(null);
                      }
                    }}
                  >
                    <div>
                      <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-500">
                        Full Name (EN)
                      </span>
                      <input
                        type="text"
                        autoFocus
                        value={editInstName}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditInstName(v);
                          if (!editInstShortTouched) {
                            setEditInstShort(v);
                          }
                        }}
                        placeholder="e.g. Capt. Khedr"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold focus:border-[#1B365D] focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-500">
                        Slot Display Label (EN)
                      </span>
                      <input
                        type="text"
                        value={editInstShort}
                        onChange={(e) => {
                          setEditInstShortTouched(true);
                          setEditInstShort(e.target.value);
                        }}
                        placeholder="Shown inside slot cells"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-[#1B365D] focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      <div>
                        <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-500">
                          Arabic Name (AR)
                        </span>
                        <input
                          type="text"
                          dir="rtl"
                          value={editInstNameAr}
                          onChange={(e) => setEditInstNameAr(e.target.value)}
                          placeholder="ك/ خضر"
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-[#1B365D] focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-500">
                          Arabic Slot Label
                        </span>
                        <input
                          type="text"
                          dir="rtl"
                          value={editInstShortAr}
                          onChange={(e) => setEditInstShortAr(e.target.value)}
                          placeholder="ك/ خضر"
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-[#1B365D] focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setEditingInstId(null)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        <X className="h-3 w-3" /> Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveEditInstructor}
                        className="inline-flex items-center gap-1 rounded bg-[#1B365D] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#142947]"
                      >
                        <Check className="h-3 w-3" /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => startEditInstructor(inst)}
                        title={readOnly ? inst.name : "Click to rename captain"}
                        className={`block max-w-full truncate text-left font-bold ${
                          readOnly ? "cursor-default" : "hover:text-[#1B365D]"
                        } ${inst.fit ? "text-slate-900" : "text-slate-400 line-through"}`}
                      >
                        {inst.name}
                      </button>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                        {inst.shortName && inst.shortName !== inst.name && (
                          <span>Slot: {inst.shortName}</span>
                        )}
                        {inst.nameAr && <span dir="rtl">{inst.nameAr}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => startEditInstructor(inst)}
                          className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-[#1B365D]"
                          title="Edit captain name & labels"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {readOnly ? (
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                            inst.fit ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {inst.fit ? "Fit" : "Unfit"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onChangeInstructors(
                              instructors.map((i) => (i.id === inst.id ? { ...i, fit: !i.fit } : i))
                            )
                          }
                          className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                            inst.fit ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {inst.fit ? "Fit" : "Unfit"}
                        </button>
                      )}
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() =>
                            onChangeInstructors(instructors.filter((i) => i.id !== inst.id))
                          }
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-[#C00000]"
                          title="Remove instructor"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Daily dual limit:</span>
                  <select
                    disabled={readOnly}
                    value={inst.maxDailyMin ?? 360}
                    onChange={(e) =>
                      onChangeInstructors(
                        instructors.map((i) =>
                          i.id === inst.id ? { ...i, maxDailyMin: Number(e.target.value) } : i
                        )
                      )
                    }
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 disabled:bg-slate-50"
                  >
                    <option value={240}>4:00 hrs</option>
                    <option value={300}>5:00 hrs</option>
                    <option value={360}>6:00 hrs</option>
                    <option value={420}>7:00 hrs</option>
                    <option value={480}>8:00 hrs</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Aircraft Fleet & Inspection Countdown Panel (4 cols) */}
      <section
        className={`flex-col rounded-xl border border-slate-200 bg-white shadow-xs lg:col-span-4 ${
          mobileSubTab === "aircraft" ? "flex" : "hidden lg:flex"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Plane className="h-4 w-4 text-[#1B365D]" />
          <h2 className="text-sm font-bold text-slate-900">
            Aircraft Fleet &amp; Inspection ({aircraft.length})
          </h2>
        </div>

        <div className="space-y-3 p-4">
          {!readOnly && (
            <form onSubmit={handleAddAircraft} className="flex gap-2">
              <input
                type="text"
                value={acReg}
                onChange={(e) => setAcReg(e.target.value)}
                placeholder="Registration (e.g. SU-BRM)"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-base uppercase focus:border-[#1B365D] focus:outline-none sm:text-xs"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-[#1B365D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#142947]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </form>
          )}

          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {aircraft.map((ac) => {
              const isExtra = ac.registration.toUpperCase() === "EXTRA";
              return (
                <div key={ac.id} className="space-y-2 px-3 py-2.5 text-xs hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {ac.registration}
                    </span>
                    <div className="flex items-center gap-1">
                      {readOnly ? (
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                            ac.serviceable
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-100 text-[#C00000]"
                          }`}
                        >
                          {ac.serviceable ? "Serviceable" : "Unserviceable"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onChangeAircraft(
                              aircraft.map((a) =>
                                a.id === ac.id ? { ...a, serviceable: !a.serviceable } : a
                              )
                            )
                          }
                          className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                            ac.serviceable
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-100 text-[#C00000]"
                          }`}
                        >
                          {ac.serviceable ? "Serviceable" : "Unserviceable"}
                        </button>
                      )}
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => onChangeAircraft(aircraft.filter((a) => a.id !== ac.id))}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-[#C00000]"
                          title="Remove aircraft"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {!isExtra && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px]">
                      <div className="flex items-center gap-1 text-slate-600">
                        <Wrench className="h-3 w-3 text-slate-500" />
                        <select
                          disabled={readOnly}
                          value={ac.inspectionType || "50-Hr"}
                          onChange={(e) =>
                            onChangeAircraft(
                              aircraft.map((a) =>
                                a.id === ac.id
                                  ? { ...a, inspectionType: e.target.value as "50-Hr" | "100-Hr" }
                                  : a
                              )
                            )
                          }
                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] font-bold disabled:bg-slate-100"
                        >
                          <option value="50-Hr">50-Hr</option>
                          <option value="100-Hr">100-Hr</option>
                        </select>
                        <span>left:</span>
                        <input
                          type="number"
                          readOnly={readOnly}
                          step="0.5"
                          min="0"
                          value={ac.hoursToInspection ?? ""}
                          onChange={(e) =>
                            onChangeAircraft(
                              aircraft.map((a) =>
                                a.id === ac.id
                                  ? {
                                      ...a,
                                      hoursToInspection:
                                        e.target.value === "" ? undefined : Number(e.target.value),
                                    }
                                  : a
                              )
                            )
                          }
                          placeholder="--"
                          className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center font-mono font-bold text-slate-800 read-only:bg-slate-100"
                        />
                        <span>h</span>
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onChangeAircraft(
                                aircraft.map((a) =>
                                  a.id === ac.id
                                    ? { ...a, hoursToInspection: 50, inspectionType: "50-Hr" }
                                    : a
                                )
                              )
                            }
                            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
                          >
                            50h
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onChangeAircraft(
                                aircraft.map((a) =>
                                  a.id === ac.id
                                    ? { ...a, hoursToInspection: 100, inspectionType: "100-Hr" }
                                    : a
                                )
                              )
                            }
                            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
                          >
                            100h
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {!isExtra && (
                    (() => {
                      const rec = lookupFleetWeightRecord(ac.registration);
                      const bewVal = ac.basicEmptyWeightLb ?? rec?.basicEmptyWeightLb;
                      const armVal = ac.emptyArmIn ?? rec?.emptyArmIn;
                      const weighedVal = ac.weighingDate ?? rec?.weighingDate ?? "";
                      const dueVal = ac.weighingDueDate ?? rec?.weighingDueDate ?? "";
                      const momVal =
                        bewVal !== undefined && armVal !== undefined
                          ? computeEmptyMoment(bewVal, armVal).toFixed(2)
                          : "-";
                      const dueStatus = getWeighingDueStatus(dueVal);
                      const updateAcWb = (patch: Partial<Aircraft>) =>
                        onChangeAircraft(
                          aircraft.map((a) => (a.id === ac.id ? { ...a, ...patch } : a))
                        );

                      return (
                        <div className="space-y-1.5 rounded-md border border-blue-100 bg-blue-50/40 px-2 py-1.5 text-[11px]">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-extrabold text-[#1B365D]">
                              W&amp;B · Mom: <span className="font-mono">{momVal}</span>
                            </span>
                            {dueStatus !== "unknown" && (
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${
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
                                  : "Due"}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                            <label className="block">
                              <span className="block text-[9px] font-bold uppercase text-slate-500">
                                BEW (lb)
                              </span>
                              <input
                                type="number"
                                step="0.1"
                                readOnly={readOnly}
                                value={bewVal ?? ""}
                                onChange={(e) =>
                                  updateAcWb({
                                    basicEmptyWeightLb:
                                      e.target.value === "" ? undefined : Number(e.target.value),
                                  })
                                }
                                placeholder="--"
                                className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center font-mono text-base font-bold text-slate-900 read-only:bg-slate-100 sm:text-[11px]"
                              />
                            </label>
                            <label className="block">
                              <span className="block text-[9px] font-bold uppercase text-slate-500">
                                Arm (in)
                              </span>
                              <input
                                type="number"
                                step="0.0001"
                                readOnly={readOnly}
                                value={armVal ?? ""}
                                onChange={(e) =>
                                  updateAcWb({
                                    emptyArmIn:
                                      e.target.value === "" ? undefined : Number(e.target.value),
                                  })
                                }
                                placeholder="--"
                                className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center font-mono text-base font-bold text-slate-900 read-only:bg-slate-100 sm:text-[11px]"
                              />
                            </label>
                            <label className="block">
                              <span className="block text-[9px] font-bold uppercase text-slate-500">
                                Weighed
                              </span>
                              <input
                                type="text"
                                readOnly={readOnly}
                                value={weighedVal}
                                onChange={(e) => updateAcWb({ weighingDate: e.target.value })}
                                placeholder="D/M/YYYY"
                                className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center font-mono text-base font-semibold text-slate-800 read-only:bg-slate-100 sm:text-[11px]"
                              />
                            </label>
                            <label className="block">
                              <span className="block text-[9px] font-bold uppercase text-slate-500">
                                Due Date
                              </span>
                              <input
                                type="text"
                                readOnly={readOnly}
                                value={dueVal}
                                onChange={(e) => updateAcWb({ weighingDueDate: e.target.value })}
                                placeholder="D/M/YYYY"
                                className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center font-mono text-base font-semibold text-slate-800 read-only:bg-slate-100 sm:text-[11px]"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })()
                  )}

                  {!ac.serviceable && (
                    <input
                      type="text"
                      readOnly={readOnly}
                      value={ac.note || ""}
                      onChange={(e) =>
                        onChangeAircraft(
                          aircraft.map((a) => (a.id === ac.id ? { ...a, note: e.target.value } : a))
                        )
                      }
                      placeholder={readOnly ? "-" : "Maintenance / snag note..."}
                      className="w-full rounded border border-red-200 bg-red-50/50 px-2 py-1 text-base text-red-900 sm:text-[11px]"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      </div>

      {/* Full 24-Aircraft Official EAA Fleet Weight & Balance Database */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-[#1B365D]">
              <Plane className="h-4 w-4" />
              EAA Fleet Weight &amp; Balance Database ({EAA_FLEET_WB_RECORDS.length} Weighed Aircraft)
            </h2>
            <p className="text-xs text-slate-500">
              Official Egyptian Aviation Academy Planning Department schedule — auto-populates Basic
              Empty Weight &amp; Arm whenever an aircraft is selected in Flight Release.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={fleetWbSearch}
              onChange={(e) => setFleetWbSearch(e.target.value)}
              placeholder="Filter reg (SU-...), class, date..."
              className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-base focus:border-[#1B365D] focus:outline-none sm:text-xs"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[680px] border-collapse text-xs">
            <thead>
              <tr className="bg-[#1B365D] text-white">
                <th className="px-3 py-2 text-left">A/C Reg</th>
                <th className="px-2 py-2 text-center">Class</th>
                <th className="px-2 py-2 text-center">Weighing Date</th>
                <th className="px-2 py-2 text-center">Due Date</th>
                <th className="px-2 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-right">Arm (in)</th>
                <th className="px-3 py-2 text-right">Basic Empty Wt (lb)</th>
                <th className="px-3 py-2 text-right">Moment / 1000</th>
                <th className="px-3 py-2 text-center">Detachment Fleet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFleetWb.map((rec) => {
                const live = lookupFleetWeightRecord(rec.registration, aircraft) || rec;
                const mom = computeEmptyMoment(live.basicEmptyWeightLb, live.emptyArmIn);
                const status = getWeighingDueStatus(live.weighingDueDate);
                const inFleet = aircraft.some(
                  (a) => a.registration.trim().toUpperCase() === rec.registration
                );
                return (
                  <tr key={rec.registration} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-extrabold text-[#1B365D]">
                      {rec.registration}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                          live.aircraftClass === "MULTI"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {live.aircraftClass}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center font-mono text-slate-700">
                      {live.weighingDate}
                    </td>
                    <td className="px-2 py-2 text-center font-mono font-semibold text-slate-800">
                      {live.weighingDueDate}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                          status === "ok"
                            ? "bg-emerald-100 text-emerald-800"
                            : status === "due-soon"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-red-100 text-[#C00000]"
                        }`}
                      >
                        {status === "ok" ? "Valid" : status === "due-soon" ? "Due Soon" : "Due"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">
                      {live.emptyArmIn}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-extrabold text-slate-900">
                      {live.basicEmptyWeightLb}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-[#1B365D]">
                      {mom.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {inFleet ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-[#1B365D]">
                          In Fleet
                        </span>
                      ) : !readOnly ? (
                        <button
                          type="button"
                          onClick={() =>
                            onChangeAircraft([...aircraft, buildAircraftWithWb(rec.registration)])
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#1B365D] hover:bg-[#1B365D] hover:text-white"
                        >
                          <Plus className="h-3 w-3" /> Add to Fleet
                        </button>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-400">Standby DB</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
