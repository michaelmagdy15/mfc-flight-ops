import { Aircraft, DaySchedule, ExportLang, Instructor, Student } from "../types";
import { translateOfficerToArabic } from "../data/seedData";
import {
  calcScheduleTotals,
  formatDurationCompact,
  formatMinutes,
  formatScheduleTitleDate,
  formatScheduleTitleDateArabic,
} from "./calculations";

export function buildWhatsAppBroadcast(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  lang: ExportLang = "EN"
): string {
  const isAr = lang === "AR";
  const totals = calcScheduleTotals(schedule, aircraft);
  const instMap = new Map(instructors.map((i) => [i.id, i]));
  const stuMap = new Map(students.map((s) => [s.id, s]));

  const lines: string[] = isAr
    ? [
        `*الكلية المصرية للطيران — يومية طيران ${schedule.airport === "Assiut Airport" ? "مطار أسيوط" : schedule.airport}*`,
        `📅 *${formatScheduleTitleDateArabic(schedule.date)}* (${schedule.issueLabel})`,
        `👨‍✈️ قائد المأمورية: ${translateOfficerToArabic(schedule.missionCommander) || "-"} | العمليات: ${translateOfficerToArabic(schedule.operationsOfficer) || "-"}`,
        `⏱️ إجمالي الساعات: *${formatMinutes(totals.grandTotalMin, "0:00")}* (منفرد: ${formatMinutes(totals.totalSoloMin, "0:00")} | مزدوج: ${formatMinutes(totals.totalDualMin, "0:00")})`,
      ]
    : [
        `*MFC — ${schedule.airport} Daily Flight Schedule*`,
        `📅 *${formatScheduleTitleDate(schedule.date)}* (${schedule.issueLabel})`,
        `👨‍✈️ Mission Cmd: ${schedule.missionCommander || "-"} | Ops: ${schedule.operationsOfficer || "-"}`,
        `⏱️ Total: *${formatMinutes(totals.grandTotalMin, "0:00")}* (Solo: ${formatMinutes(totals.totalSoloMin, "0:00")} | Dual: ${formatMinutes(totals.totalDualMin, "0:00")})`,
      ];

  const wxParts = schedule.weather
    .filter((w) => w.wind || w.temp)
    .map((w) => `${w.time}: ${w.wind ? w.wind.replace("\n", " ") : "-"} (${w.temp ? `${w.temp}°C` : "-"})`);
  if (wxParts.length > 0) {
    lines.push(`${isAr ? "🌤️ الطقس" : "🌤️ Weather"}: ${wxParts.join(" · ")}`);
  }

  lines.push("");

  for (const ac of aircraft) {
    const slots = schedule.grid[ac.id] || {};
    const entries = Object.entries(slots)
      .map(([k, v]) => ({ slotIdx: Number(k), sortie: v }))
      .filter((x) => Boolean(x.sortie))
      .sort((a, b) => a.slotIdx - b.slotIdx);

    if (entries.length === 0) continue;

    lines.push(`✈️ *${ac.registration}*${ac.serviceable ? "" : isAr ? " [غير صالحة]" : " [UNSVC]"}`);
    for (const { slotIdx, sortie } of entries) {
      const time = schedule.timeSlots[slotIdx] || `Slot ${slotIdx + 1}`;
      const st = sortie.studentId ? stuMap.get(sortie.studentId) : undefined;
      const stu = st
        ? isAr
          ? st.nameAr || st.name
          : st.name
        : isAr
        ? "غير محدد"
        : "Unassigned";
      const dur = formatDurationCompact(sortie.durationMin);
      const tag = sortie.tag ? ` [${sortie.tag}]` : "";
      if (sortie.type === "SOLO") {
        lines.push(`  • ${time}: *${stu}* (${dur}${tag}) — 🔴 *${isAr ? "منفرد Solo" : "SOLO"}*`);
      } else {
        const instObj = sortie.instructorId ? instMap.get(sortie.instructorId) : undefined;
        const inst = instObj
          ? isAr
            ? instObj.shortNameAr || instObj.nameAr || translateOfficerToArabic(instObj.name)
            : instObj.shortName || instObj.name
          : isAr
          ? "مدرب"
          : "Instructor";
        lines.push(`  • ${time}: ${stu} (${inst} · ${dur}${tag})`);
      }
    }
  }

  if (schedule.standby.length > 0) {
    const sbNames = schedule.standby
      .map((sb) => {
        const st = stuMap.get(sb.studentId);
        return st ? (isAr ? st.nameAr || st.name : st.name) : "";
      })
      .filter(Boolean)
      .join(isAr ? "، " : ", ");
    if (sbNames) {
      lines.push("");
      lines.push(`${isAr ? "⏳ *احتياطي:*" : "⏳ *Standby:*"} ${sbNames}`);
    }
  }

  lines.push("");
  lines.push(
    isAr
      ? "⚠️ _على كل طالب مراجعة موقفه على التالون قبل الطيران. طيران الـ IR بالنظارة + ساعة يد، والطيران بالرخصة + الـ LOG BOOK كامل حتى آخر طلعة._"
      : "⚠️ _Verify status on Talon prior to flying. IR flights require hood/foggles + wristwatch; all flights require License + updated LOG BOOK._"
  );
  return lines.join("\n");
}

export function buildWhatsAppStudentSummary(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  lang: ExportLang = "EN"
): string {
  const isAr = lang === "AR";
  const instMap = new Map(instructors.map((i) => [i.id, i]));
  const acMap = new Map(aircraft.map((a) => [a.id, a]));
  const byStudent = new Map<string, string[]>();

  for (const [acId, slots] of Object.entries(schedule.grid)) {
    const reg = acMap.get(acId)?.registration || acId;
    for (const [slotStr, sortie] of Object.entries(slots || {})) {
      if (!sortie?.studentId) continue;
      const slotIdx = Number(slotStr);
      const time = schedule.timeSlots[slotIdx] || `Slot ${slotIdx + 1}`;
      const dur = formatDurationCompact(sortie.durationMin);
      const instObj = sortie.instructorId ? instMap.get(sortie.instructorId) : undefined;
      const instLbl = instObj
        ? isAr
          ? instObj.shortNameAr || instObj.nameAr || translateOfficerToArabic(instObj.name)
          : instObj.shortName || instObj.name
        : isAr
        ? "مدرب"
        : "Instructor";

      const line =
        sortie.type === "SOLO"
          ? isAr
            ? `${time} على ${reg} (${dur} منفرد Solo)`
            : `${time} on ${reg} (${dur} SOLO)`
          : isAr
          ? `${time} على ${reg} مع ${instLbl} (${dur})`
          : `${time} on ${reg} w/ ${instLbl} (${dur})`;
      const arr = byStudent.get(sortie.studentId) || [];
      arr.push(line);
      byStudent.set(sortie.studentId, arr);
    }
  }

  const lines: string[] = [
    isAr
      ? `*توزيع طلعات الطلبة — ${formatScheduleTitleDateArabic(schedule.date)}*`
      : `*MFC Student Flight Calls — ${formatScheduleTitleDate(schedule.date)}*`,
    "",
  ];

  students.forEach((stu, idx) => {
    const flights = byStudent.get(stu.id);
    if (!flights || flights.length === 0) return;
    const stuName = isAr ? stu.nameAr || stu.name : stu.name;
    lines.push(`${idx + 1}. *${stuName}:* ${flights.join(" | ")}`);
  });

  return lines.join("\n");
}
