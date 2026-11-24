import React, { useMemo, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, UserX } from "lucide-react";
import { GroupData } from "../types";
import { calcRangeAnalytics, formatMinutes } from "../utils/calculations";

interface ReportsDashboardProps {
  group: GroupData;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (val: string | number) => {
    const s = String(val ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join(
    "\r\n"
  );
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ group }) => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const analytics = useMemo(
    () => calcRangeAnalytics(group, startDate || undefined, endDate || undefined),
    [group, startDate, endDate]
  );

  const applyPreset = (days: number | "month" | "all") => {
    if (days === "all") {
      setStartDate("");
      setEndDate("");
      return;
    }
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    if (days === "month") {
      setStartDate(`${end.slice(0, 8)}01`);
      setEndDate(end);
      return;
    }
    const startDt = new Date(now.getTime() - (days - 1) * 86400 * 1000);
    setStartDate(startDt.toISOString().slice(0, 10));
    setEndDate(end);
  };

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[#1B365D]" />
          <div>
            <h2 className="text-sm font-extrabold text-[#1B365D]">
              Hours, Progress &amp; NO SHOW Reports — {group.name}
            </h2>
            <p className="text-xs text-slate-500">
              Aggregated across {analytics.dayCount} recorded schedule day
              {analytics.dayCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => applyPreset("all")}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-100"
          >
            All Days
          </button>
          <button
            type="button"
            onClick={() => applyPreset(7)}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-100"
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => applyPreset("month")}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-100"
          >
            This Month
          </button>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 font-semibold"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 font-semibold"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase text-slate-400">Days Logged</div>
          <div className="mt-0.5 text-2xl font-extrabold text-[#1B365D]">{analytics.dayCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase text-slate-400">Total Sorties</div>
          <div className="mt-0.5 text-2xl font-extrabold text-slate-900">{analytics.totalSorties}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase text-[#C00000]">Solo Hours</div>
          <div className="mt-0.5 text-2xl font-extrabold text-[#C00000]">
            {formatMinutes(analytics.totalSoloMin, "0:00")}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase text-slate-400">Dual Hours</div>
          <div className="mt-0.5 text-2xl font-extrabold text-slate-900">
            {formatMinutes(analytics.totalDualMin, "0:00")}
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase text-amber-800">Recorded NO SHOWs</div>
          <div className="mt-0.5 text-2xl font-extrabold text-amber-900">
            {analytics.noShows.length}
          </div>
        </div>
      </div>

      {/* Student Progress Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Student Progress Report</h3>
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                `mfc-student-hours-${group.id}.csv`,
                ["#", "Student", "Program", "Sorties", "Dual", "Solo", "IR", "Total", "NO SHOWs"],
                analytics.studentRows.map((s, idx) => [
                  idx + 1,
                  s.name,
                  s.program,
                  s.sorties,
                  formatMinutes(s.dualMin, "0:00"),
                  formatMinutes(s.soloMin, "0:00"),
                  formatMinutes(s.irMin, "0:00"),
                  formatMinutes(s.dualMin + s.soloMin, "0:00"),
                  s.noShows,
                ])
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-[#1B365D] hover:bg-blue-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export CSV (Excel)
          </button>
        </div>

        <div className="max-h-96 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-100 text-left font-bold text-slate-700">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2">#</th>
                <th className="border-b border-slate-200 px-3 py-2">Student</th>
                <th className="border-b border-slate-200 px-3 py-2">Program</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Sorties</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Dual</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right text-[#C00000]">
                  Solo
                </th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">IR</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Total</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">NO SHOW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.studentRows.map((s, idx) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-mono text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-1.5 font-bold text-slate-900">{s.name}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        s.program === "IRCPL"
                          ? "bg-red-100 text-[#C00000]"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {s.program}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{s.sorties}</td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {formatMinutes(s.dualMin, "0:00")}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold text-[#C00000]">
                    {formatMinutes(s.soloMin, "0:00")}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {formatMinutes(s.irMin, "0:00")}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-extrabold text-[#1B365D]">
                    {formatMinutes(s.dualMin + s.soloMin, "0:00")}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {s.noShows > 0 ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-[#C00000]">
                        {s.noShows}
                      </span>
                    ) : (
                      "0"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instructor & Aircraft Tables */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Instructor Hours</h3>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `mfc-instructor-hours-${group.id}.csv`,
                  ["Instructor", "Dual Sorties", "Dual Hours"],
                  analytics.instructorRows.map((i) => [
                    i.name,
                    i.sorties,
                    formatMinutes(i.dualMin, "0:00"),
                  ])
                )
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-100 text-left font-bold text-slate-700">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2">Instructor</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Dual Sorties</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Dual Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.instructorRows.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2 font-bold text-slate-900">{i.name}</td>
                  <td className="px-3 py-2 text-right font-mono">{i.sorties}</td>
                  <td className="px-3 py-2 text-right font-mono font-extrabold text-[#1B365D]">
                    {formatMinutes(i.dualMin, "0:00")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Aircraft Utilization &amp; Inspections</h3>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `mfc-aircraft-utilization-${group.id}.csv`,
                  ["Aircraft", "Sorties", "Solo", "Dual", "Total", "Hours to Inspection"],
                  analytics.aircraftRows.map((a) => [
                    a.registration,
                    a.sorties,
                    formatMinutes(a.soloMin, "0:00"),
                    formatMinutes(a.dualMin, "0:00"),
                    formatMinutes(a.soloMin + a.dualMin, "0:00"),
                    a.hoursToInspection ?? "-",
                  ])
                )
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-100 text-left font-bold text-slate-700">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2">Aircraft</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Sorties</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right text-[#C00000]">Solo</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Dual</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Total</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Insp. Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.aircraftRows.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-mono font-bold text-slate-900">{a.registration}</td>
                  <td className="px-3 py-2 text-right font-mono">{a.sorties}</td>
                  <td className="px-3 py-2 text-right font-mono text-[#C00000]">
                    {formatMinutes(a.soloMin, "0:00")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatMinutes(a.dualMin, "0:00")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-extrabold text-[#1B365D]">
                    {formatMinutes(a.soloMin + a.dualMin, "0:00")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {a.hoursToInspection !== undefined ? `${a.hoursToInspection.toFixed(1)}h` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* NO SHOW Log */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <UserX className="h-4 w-4 text-[#C00000]" />
          <h3 className="text-sm font-bold text-slate-900">NO SHOW &amp; Standby Swap Log</h3>
        </div>
        {analytics.noShows.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500">
            No NO SHOWs logged in this period. When a student misses a sortie, open the slot and tap{" "}
            <strong>NO SHOW → Swap Standby</strong> to log and replace in one click.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {analytics.noShows.map((ns) => (
              <div key={ns.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div>
                  <span className="font-mono font-bold text-slate-500">{ns.date}</span> ·{" "}
                  <span className="font-bold text-[#C00000]">{ns.studentName}</span> missed{" "}
                  <span className="font-mono font-semibold">{ns.aircraftReg}</span> ({ns.slotLabel})
                </div>
                {ns.replacedByStudentName && (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                    Replaced by {ns.replacedByStudentName}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
