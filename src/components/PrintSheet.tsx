import React from "react";
import { Aircraft, DaySchedule, ExportLang, ExportStyle, Instructor, Student } from "../types";
import { ARABIC_DEFAULT_NOTES, translateOfficerToArabic } from "../data/seedData";
import {
  calcAircraftHours,
  calcScheduleTotals,
  formatMinutes,
  formatScheduleTitleDate,
  formatScheduleTitleDateArabic,
  formatSortieDisplay,
  getAircraftCoveredSlots,
} from "../utils/calculations";

interface PrintSheetProps {
  schedule: DaySchedule;
  instructors: Instructor[];
  students: Student[];
  aircraft: Aircraft[];
  lang?: ExportLang;
  style?: ExportStyle;
  groupName?: string;
  showInspectionHours?: boolean;
  domId?: string;
  offscreenExport?: boolean;
}

export const PrintSheet: React.FC<PrintSheetProps> = ({
  schedule,
  instructors,
  students,
  aircraft,
  lang = "EN",
  style = "modern",
  groupName,
  showInspectionHours = true,
  domId,
  offscreenExport = false,
}) => {
  const isAr = lang === "AR";
  const totals = calcScheduleTotals(schedule, aircraft);
  const ircpl = students.filter((s) => s.program === "IRCPL");
  const ppl = students.filter((s) => s.program === "PPL");
  const stuMap = new Map(students.map((s) => [s.id, s]));

  const fitInstructors = instructors.filter((i) => i.fit).length;
  const fitStudents = students.filter((s) => s.fit).length;
  const physicalAircraft = aircraft.filter((a) => a.registration.toUpperCase() !== "EXTRA");
  const svcAircraft = physicalAircraft.filter((a) => a.serviceable).length;
  const unsvcAircraft = physicalAircraft.length - svcAircraft;

  const displayAircraft: (Aircraft | null)[] = [...aircraft];
  while (displayAircraft.length < 8) displayAircraft.push(null);

  const lbl = isAr
    ? {
        ministry: "وزارة الطيران المدني",
        academy: "الأكاديمية المصرية لعلوم الطيران",
        college: "الكلية المصرية للطيران",
        commander: "قائد المأمورية",
        signature: "التوقيع:",
        title: `يومية طيران ${schedule.airport === "Assiut Airport" ? "مطار أسيوط" : schedule.airport} عن ${formatScheduleTitleDateArabic(schedule.date)} (${schedule.issueLabel || "DAY ISSUE 1"})`,
        mission: "المأمورية",
        pilot: "الطيار",
        student: "الطالب",
        aircraft: "الطائرة",
        timeFromTo: "التوقيت من و إلى",
        flightHours: "ساعات الطيران",
        solo: "منفرد",
        dual: "مزدوج",
        standby: "احتياطي",
        notes: "ملاحظات",
        totalHours: "إجمالي الساعات",
        operations: "العمليات",
        monitoring: "المراقبة",
        fitness: "اللياقة",
        total: "إجمالي",
        fit: "لائق",
        unfit: "غير لائق",
        instructors: "مدرسين",
        students: "طلبة",
        acServiceability: "صلاحية الطائرات",
        serviceable: "صالح",
        unserviceable: "غير صالح",
        opsManager: "مدير العمليات",
      }
    : {
        ministry: "Ministry of Civil Aviation",
        academy: "Egyptian Aviation Academy",
        college: "Misr Flying College",
        commander: "Mission Commander",
        signature: "Signature:",
        title: `${schedule.airport || "Assiut Airport"} Daily Flight Schedule — ${formatScheduleTitleDate(schedule.date)} (${schedule.issueLabel || "DAY ISSUE"})`,
        mission: "Mission",
        pilot: "Pilot",
        student: "Student",
        aircraft: "Aircraft",
        timeFromTo: "Time From & To",
        flightHours: "Flight\nHours",
        solo: "Solo",
        dual: "Dual",
        standby: "Standby",
        notes: "Notes",
        totalHours: "Total Hours",
        operations: "Operations",
        monitoring: "Monitoring",
        fitness: "Fitness",
        total: "Total",
        fit: "Fit",
        unfit: "Unfit",
        instructors: "Instructors",
        students: "Students",
        acServiceability: "Aircraft Serviceability",
        serviceable: "Serviceable",
        unserviceable: "Unserviceable",
        opsManager: "Operations Manager",
      };

  const notesToRender = isAr ? ARABIC_DEFAULT_NOTES : schedule.notes;
  const containerClass = offscreenExport
    ? "pointer-events-none fixed -left-[9999px] top-0 w-[285mm] bg-[#ffffff] p-2 text-[#000000]"
    : "hidden bg-[#ffffff] text-[#000000] print:block";

  if (style === "modern") {
    const perCol = Math.max(1, Math.ceil(students.length / 6));
    const studentCols = Array.from({ length: 6 }, (_, cIdx) =>
      students.slice(cIdx * perCol, (cIdx + 1) * perCol)
    );
    const modLbl = isAr
      ? {
          aircraft: "الطائرة",
          timeFromTo: "التوقيت من و إلى",
          flightHours: "ساعات الطيران",
          dailyTotals: `الإجمالي اليومي — إجمالي الساعات: ${formatMinutes(totals.grandTotalMin, "0:00")}`,
          briefingExams: "التلقين والاختبارات",
          serv: "صالح",
          us: "غير صالح",
          rosterTitle: `مرجع طاقم المدربين والطلبة — ${instructors.length} مدربين / ${students.length} طالب`,
          instructorsList: `المدربون — ${instructors.length}: ${instructors
            .map((i) => i.nameAr || translateOfficerToArabic(i.name))
            .join(" | ")}`,
        }
      : {
          aircraft: "AIRCRAFT",
          timeFromTo: "TIME FROM & TO",
          flightHours: "FLIGHT HOURS",
          dailyTotals: `DAILY TOTALS (GRAND TOTAL: ${formatMinutes(totals.grandTotalMin, "0:00")})`,
          briefingExams: "Briefing & Exams",
          serv: "Serv.",
          us: "U/S",
          rosterTitle: `PILOTS & STUDENTS ROSTER REFERENCE${
            groupName ? ` (${groupName.toUpperCase()})` : ""
          } — ${instructors.length} INSTRUCTORS / ${students.length} STUDENTS`,
          instructorsList: `Instructors (${instructors.length}): ${instructors.map((i) => i.name).join(" | ")}`,
        };

    return (
      <div
        id={domId}
        dir={isAr ? "rtl" : "ltr"}
        className={containerClass}
        style={{ fontFamily: isAr ? "Arial, Tahoma, sans-serif" : "'Segoe UI', Arial, sans-serif" }}
      >
        {/* Top Header */}
        <div
          className="grid items-center pb-0.5 text-[8.8pt] font-bold leading-tight text-[#1B365D]"
          style={{ gridTemplateColumns: "95mm 1fr 95mm" }}
        >
          <div style={{ textAlign: isAr ? "right" : "left" }}>
            <div>{lbl.ministry}</div>
            <div>{lbl.academy}</div>
            <div>{lbl.college}</div>
          </div>
          <div className="flex justify-center">
            <img src="/mfc-logo.png" alt="MFC Logo" style={{ height: "10.5mm", width: "auto", objectFit: "contain" }} />
          </div>
          <div className="text-[#0F172A]" style={{ textAlign: isAr ? "left" : "right" }}>
            <div>{lbl.commander}</div>
            <div className="mt-0.5">
              {lbl.signature}{" "}
              {isAr
                ? translateOfficerToArabic(schedule.missionCommander) || "ك/ ............"
                : schedule.missionCommander || "Capt. ___________"}
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="pb-1 text-center text-[11pt] font-bold text-[#1B365D] underline">
          {lbl.title}
        </div>

        {/* 13-Col Modern Schedule Grid */}
        <table
          className="w-full table-fixed border-collapse text-[7.5pt] font-bold"
          style={{ border: "1.5px solid #1B365D" }}
        >
          <thead>
            <tr className="bg-[#1B365D] text-white">
              <th rowSpan={2} className="w-[21mm] py-1 text-center text-[8.8pt]" style={{ border: "1px solid #1B365D" }}>
                {modLbl.aircraft}
              </th>
              <th colSpan={10} className="py-0.5 text-center text-[9.2pt]" style={{ border: "1px solid #FFFFFF" }}>
                {modLbl.timeFromTo}
              </th>
              <th colSpan={2} className="w-[28mm] py-0.5 text-center text-[8.5pt]" style={{ border: "1px solid #1B365D" }}>
                {modLbl.flightHours}
              </th>
            </tr>
            <tr className="bg-[#F1F5F9]">
              {schedule.timeSlots.map((t, idx) => (
                <th key={idx} className="py-0.5 text-center" style={{ border: "1px solid #CBD5E1" }}>
                  <div className="text-[8.5pt] font-extrabold text-[#1B365D]">{t}</div>
                  {t && <div className="text-[6.2pt] font-semibold text-[#475569]">00 15 30 45</div>}
                </th>
              ))}
              <th
                className="w-[14mm] text-center text-[8.5pt] text-[#C00000]"
                style={{ border: "1px solid #CBD5E1", borderInlineEnd: "1.5px solid #C00000" }}
              >
                {lbl.solo}
              </th>
              <th className="w-[14mm] text-center text-[8.5pt] text-[#0F172A]" style={{ border: "1px solid #CBD5E1" }}>
                {lbl.dual}
              </th>
            </tr>
          </thead>

          <tbody>
            {displayAircraft.map((ac, idx) => {
              const isEven = idx % 2 === 0;
              const hours = ac ? calcAircraftHours(ac.id, schedule.grid) : { soloMin: 0, dualMin: 0 };
              const soloStr = ac ? formatMinutes(hours.soloMin, "-") : "-";
              const dualStr = ac ? formatMinutes(hours.dualMin, "-") : "-";
              const covered = ac ? getAircraftCoveredSlots(schedule, ac.id) : new Map();
              const inspAfter =
                showInspectionHours && ac && ac.hoursToInspection !== undefined
                  ? ac.hoursToInspection - (hours.soloMin + hours.dualMin) / 60
                  : undefined;

              return (
                <tr key={ac ? ac.id : `m-empty-${idx}`} style={{ height: "10.0mm" }}>
                  <td
                    className="text-center leading-tight"
                    style={{
                      backgroundColor: isEven ? "#E9F2FB" : "#FFFFFF",
                      border: "1px solid #94A3B8",
                    }}
                  >
                    <div className="text-[8.8pt] font-extrabold text-[#1B365D]">{ac?.registration || ""}</div>
                    {inspAfter !== undefined && (
                      <div className="text-[6.8pt] font-semibold text-[#475569]">{inspAfter.toFixed(1)}h</div>
                    )}
                  </td>

                  {schedule.timeSlots.map((_, sIdx) => {
                    const sortie = ac ? schedule.grid[ac.id]?.[sIdx] : undefined;
                    const cov = !sortie ? covered.get(sIdx) : undefined;
                    const disp = sortie ? formatSortieDisplay(sortie, instructors, students, lang) : null;

                    return (
                      <td
                        key={sIdx}
                        className="px-0.5 text-center leading-tight"
                        style={{ backgroundColor: "#FFFFFF", border: "1px solid #CBD5E1" }}
                      >
                        {sortie && disp ? (
                          <>
                            <div
                              className="truncate text-[7.2pt] font-extrabold"
                              style={{ color: sortie.type === "SOLO" ? "#C00000" : "#0F172A" }}
                            >
                              {disp.topLine}
                            </div>
                            <div
                              className="truncate text-[7.2pt] font-bold"
                              style={{
                                fontWeight: 700,
                                color: sortie.type === "SOLO" ? "#C00000" : "#0F172A",
                              }}
                            >
                              {disp.bottomLine}
                            </div>
                          </>
                        ) : cov ? (
                          <div className="truncate text-[6.6pt] font-bold italic text-[#1D4ED8]">
                            {isAr ? `→ امتداد (${cov.fromLabel})` : `← Cont. (${cov.fromLabel})`}
                          </div>
                        ) : null}
                      </td>
                    );
                  })}

                  <td
                    className="text-center text-[8.5pt] font-extrabold"
                    style={{
                      backgroundColor: isEven ? "#E9F2FB" : "#FFFFFF",
                      color: soloStr !== "-" ? "#C00000" : "#64748B",
                      border: "1px solid #94A3B8",
                      borderInlineEnd: "1.5px solid #C00000",
                    }}
                  >
                    {soloStr}
                  </td>
                  <td
                    className="text-center text-[8.5pt] font-extrabold"
                    style={{
                      backgroundColor: isEven ? "#E9F2FB" : "#FFFFFF",
                      color: dualStr !== "-" ? "#0F172A" : "#64748B",
                      border: "1px solid #94A3B8",
                    }}
                  >
                    {dualStr}
                  </td>
                </tr>
              );
            })}

            {/* DAILY TOTALS */}
            <tr className="bg-[#F1F5F9]" style={{ height: "5.8mm" }}>
              <td
                colSpan={11}
                className="px-2 text-[8.2pt] font-extrabold text-[#1B365D]"
                style={{ border: "1px solid #1B365D", textAlign: isAr ? "left" : "right" }}
              >
                {modLbl.dailyTotals}
              </td>
              <td
                className="bg-[#F1F5F9] text-center text-[9pt] font-extrabold text-[#C00000]"
                style={{ border: "1px solid #1B365D", borderInlineEnd: "1.5px solid #C00000" }}
              >
                {formatMinutes(totals.totalSoloMin, "0:00")}
              </td>
              <td className="text-center text-[9pt] font-extrabold text-[#0F172A]" style={{ border: "1px solid #1B365D" }}>
                {formatMinutes(totals.totalDualMin, "0:00")}
              </td>
            </tr>

            {/* STANDBY */}
            <tr style={{ height: "5.8mm" }}>
              <td className="bg-[#F8FAFC] text-center text-[7.8pt] font-extrabold text-[#1B365D]" style={{ border: "1px solid #1B365D" }}>
                {lbl.standby.toUpperCase()}
              </td>
              {schedule.timeSlots.map((_, sIdx) => {
                const sb = schedule.standby[sIdx];
                const sbStu = sb ? stuMap.get(sb.studentId) : undefined;
                const sbName = sbStu ? (isAr ? sbStu.nameAr || sbStu.name : sbStu.name) : "";
                return (
                  <td
                    key={sIdx}
                    className="px-0.5 text-center text-[7.5pt] font-bold"
                    style={{
                      backgroundColor: "#FFFFFF",
                      border: "1px solid #CBD5E1",
                      color: sb?.highlight ? "#C00000" : "#0F172A",
                    }}
                  >
                    {sbName}
                  </td>
                );
              })}
              <td
                className="text-center text-[#64748B]"
                style={{ border: "1px solid #1B365D", borderInlineEnd: "1.5px solid #C00000" }}
              >
                -
              </td>
              <td className="text-center text-[#64748B]" style={{ border: "1px solid #1B365D" }}>
                -
              </td>
            </tr>

            {/* NOTES */}
            <tr style={{ height: "12.5mm" }}>
              <td className="bg-[#F1F5F9] text-center text-[7.8pt] font-extrabold text-[#1B365D]" style={{ border: "1px solid #1B365D" }}>
                {lbl.notes.toUpperCase()}
              </td>
              <td
                colSpan={12}
                className="bg-[#FFFDF7] px-2 py-0.5 text-center text-[7.2pt] leading-snug"
                style={{ border: "1px solid #1B365D" }}
              >
                {notesToRender.map((n, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontWeight: n.highlight ? 700 : 400,
                      color: n.highlight ? "#C00000" : "#0F172A",
                      textDecoration: n.highlight ? "underline" : "none",
                    }}
                  >
                    {n.text}
                  </div>
                ))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Bottom Operations Summary */}
        <div className="mt-1.5 grid items-center gap-2" style={{ gridTemplateColumns: "1fr 46mm" }}>
          <table className="w-full border-collapse text-center text-[7.2pt] font-bold" style={{ border: "1.5px solid #1B365D" }}>
            <thead>
              <tr className="bg-[#1B365D] text-white">
                <th className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>{lbl.operations}</th>
                <th className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>{lbl.monitoring}</th>
                <th colSpan={2} className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>{modLbl.briefingExams}</th>
                <th className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>W. Forecast</th>
                <th className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>{schedule.weather[0]?.time || "9 AM"}</th>
                <th className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>{schedule.weather[1]?.time || "12 PM"}</th>
                <th className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>{schedule.weather[2]?.time || "3 PM"}</th>
                <th className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>{lbl.fitness}</th>
                <th className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>Tot</th>
                <th className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>{lbl.fit}</th>
                <th className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>{lbl.unfit}</th>
                <th colSpan={2} className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>{lbl.acServiceability}</th>
                <th className="py-0.5" style={{ border: "1px solid #FFFFFF" }}>{lbl.totalHours}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td rowSpan={2} className="px-1 text-[8.2pt]" style={{ border: "1px solid #CBD5E1" }}>
                  {isAr ? translateOfficerToArabic(schedule.operationsOfficer) : schedule.operationsOfficer}
                </td>
                <td rowSpan={2} className="px-1 text-[8.2pt]" style={{ border: "1px solid #CBD5E1" }}>
                  {isAr ? translateOfficerToArabic(schedule.monitoringOfficer) : schedule.monitoringOfficer}
                </td>
                <td className="bg-[#F1F5F9] px-1 text-[#1B365D]" style={{ border: "1px solid #CBD5E1" }}>Mass Briefing</td>
                <td className="px-1" style={{ border: "1px solid #CBD5E1" }}>{schedule.massBriefing}</td>
                <td className="bg-[#F1F5F9] px-1 text-[#1B365D]" style={{ border: "1px solid #CBD5E1" }}>Wind (kt)</td>
                <td className="px-0.5 text-[6.6pt]" style={{ border: "1px solid #CBD5E1" }}>{schedule.weather[0]?.wind}</td>
                <td className="px-0.5 text-[6.6pt]" style={{ border: "1px solid #CBD5E1" }}>{schedule.weather[1]?.wind}</td>
                <td className="px-0.5 text-[6.6pt]" style={{ border: "1px solid #CBD5E1" }}>{schedule.weather[2]?.wind}</td>
                <td className="bg-[#F1F5F9] px-1 text-[#1B365D]" style={{ border: "1px solid #CBD5E1" }}>{lbl.instructors}</td>
                <td style={{ border: "1px solid #CBD5E1" }}>{instructors.length}</td>
                <td style={{ border: "1px solid #CBD5E1" }}>{fitInstructors}</td>
                <td style={{ border: "1px solid #CBD5E1" }}>{instructors.length - fitInstructors}</td>
                <td className="bg-[#F1F5F9] text-[#1B365D]" style={{ border: "1px solid #CBD5E1" }}>{modLbl.serv}</td>
                <td className="bg-[#F1F5F9] text-[#1B365D]" style={{ border: "1px solid #CBD5E1" }}>{modLbl.us}</td>
                <td className="bg-[#F1F5F9]" style={{ border: "1px solid #CBD5E1" }}>
                  <span className="text-[#C00000]">{lbl.solo}</span> + {lbl.dual}
                </td>
              </tr>
              <tr>
                <td className="bg-[#F1F5F9] px-1 text-[#1B365D]" style={{ border: "1px solid #CBD5E1" }}>Exams</td>
                <td className="px-1" style={{ border: "1px solid #CBD5E1" }}>{schedule.exams}</td>
                <td className="bg-[#F1F5F9] px-1 text-[#1B365D]" style={{ border: "1px solid #CBD5E1" }}>Temp (°C)</td>
                <td style={{ border: "1px solid #CBD5E1" }}>{schedule.weather[0]?.temp}</td>
                <td style={{ border: "1px solid #CBD5E1" }}>{schedule.weather[1]?.temp}</td>
                <td style={{ border: "1px solid #CBD5E1" }}>{schedule.weather[2]?.temp}</td>
                <td className="bg-[#F1F5F9] px-1 text-[#1B365D]" style={{ border: "1px solid #CBD5E1" }}>{lbl.students}</td>
                <td style={{ border: "1px solid #CBD5E1" }}>{students.length}</td>
                <td style={{ border: "1px solid #CBD5E1" }}>{fitStudents}</td>
                <td style={{ border: "1px solid #CBD5E1" }}>{students.length - fitStudents}</td>
                <td style={{ border: "1px solid #CBD5E1" }}>{svcAircraft}</td>
                <td style={{ border: "1px solid #CBD5E1" }}>{unsvcAircraft}</td>
                <td className="text-[8.8pt] font-extrabold text-[#1B365D]" style={{ border: "1px solid #CBD5E1" }}>
                  {formatMinutes(totals.grandTotalMin, "0:00")}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="text-[8.4pt] font-bold leading-tight text-[#0F172A]" style={{ textAlign: isAr ? "left" : "right" }}>
            <div>{lbl.opsManager}</div>
            <div className="mt-0.5">
              {lbl.signature}{" "}
              {isAr
                ? translateOfficerToArabic(schedule.operationsManager) || "ك/ ............"
                : schedule.operationsManager || "Capt. ___________"}
            </div>
          </div>
        </div>

        {/* Pilots & Students Roster Reference Box */}
        <table className="mt-1.5 w-full table-fixed border-collapse text-[7.4pt]" style={{ border: "1.5px solid #1B365D" }}>
          <thead>
            <tr className="bg-[#1B365D] text-white">
              <th colSpan={6} className="py-0.5 text-center text-[8.2pt] font-bold">
                {modLbl.rosterTitle}
              </th>
            </tr>
            <tr className="bg-[#E9F2FB] text-[#0F172A]">
              <th colSpan={6} className="py-0.5 text-center text-[7.8pt] font-bold" style={{ border: "1px solid #CBD5E1" }}>
                {modLbl.instructorsList}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {studentCols.map((slice, cIdx) => (
                <td
                  key={cIdx}
                  className="p-1 align-top leading-[1.18]"
                  style={{ border: "1px solid #CBD5E1", textAlign: isAr ? "right" : "left" }}
                >
                  {slice.map((s, off) => {
                    const num = cIdx * perCol + off + 1;
                    const nm = isAr ? s.nameAr || s.name : s.name;
                    const unfit = s.fit ? "" : isAr ? " (غير لائق)" : " (U)";
                    return (
                      <div
                        key={s.id}
                        style={{
                          color: s.program === "IRCPL" ? "#C00000" : "#0F172A",
                          fontWeight: s.program === "IRCPL" ? 700 : 600,
                        }}
                      >
                        {isAr ? `${num}- ${nm}${unfit}` : `${num}. ${nm}${unfit}`}
                      </div>
                    );
                  })}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div
      id={domId}
      dir={isAr ? "rtl" : "ltr"}
      className={containerClass}
      style={{ fontFamily: isAr ? "Arial, Tahoma, sans-serif" : "Calibri, Arial, sans-serif" }}
    >
      {/* Top Header */}
      <div
        className="grid items-start pb-1 text-[9.5pt] font-bold leading-tight"
        style={{ gridTemplateColumns: "85mm 1fr 85mm" }}
      >
        <div style={{ textAlign: isAr ? "right" : "left" }}>
          <div>{lbl.ministry}</div>
          <div>{lbl.academy}</div>
          <div>{lbl.college}</div>
        </div>
        <div className="flex justify-center">
          <img src="/mfc-logo.png" alt="MFC Logo" style={{ height: "12.8mm", width: "auto", objectFit: "contain" }} />
        </div>
        <div style={{ textAlign: isAr ? "left" : "right" }}>
          <div>{lbl.commander}</div>
          <div className="mt-0.5">
            {lbl.signature}{" "}
            {isAr
              ? translateOfficerToArabic(schedule.missionCommander) || "ك/ ............"
              : schedule.missionCommander || "Capt. ___________"}
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="pb-1 text-center text-[10.5pt] font-bold underline">{lbl.title}</div>

      {/* Main Schedule Table */}
      <table
        className="w-full table-fixed border-collapse text-[7pt] font-bold"
        style={{ border: "2px solid #000000" }}
      >
        <thead>
          <tr>
            <th colSpan={2} className="w-[48mm] py-0.5 text-center text-[8.5pt]" style={{ border: "1px solid #000000" }}>
              {lbl.mission}
            </th>
            <th rowSpan={3} className="w-[13mm] text-center text-[8pt]" style={{ border: "1px solid #000000" }}>
              {lbl.aircraft}
            </th>
            <th colSpan={10} className="py-0.5 text-center text-[9pt]" style={{ border: "1px solid #000000" }}>
              {lbl.timeFromTo}
            </th>
            <th
              colSpan={2}
              rowSpan={2}
              className="w-[20mm] text-center text-[8pt] leading-tight whitespace-pre-line"
              style={{ border: "1px solid #000000" }}
            >
              {lbl.flightHours}
            </th>
          </tr>
          <tr>
            <th rowSpan={2} className="w-[20.5mm] text-center text-[8pt]" style={{ border: "1px solid #000000" }}>
              {lbl.pilot}
            </th>
            <th rowSpan={2} className="w-[27.5mm] text-center text-[8pt]" style={{ border: "1px solid #000000" }}>
              {lbl.student}
            </th>
            {schedule.timeSlots.map((t, idx) => (
              <th
                key={idx}
                className="px-1 py-0.5 text-[7.5pt]"
                style={{ border: "1px solid #000000", textAlign: isAr ? "right" : "left" }}
              >
                {t}
              </th>
            ))}
          </tr>
          <tr>
            {schedule.timeSlots.map((_, idx) => (
              <th key={idx} className="p-0" style={{ border: "1px solid #000000" }}>
                <div className="grid grid-cols-4 text-center text-[6pt]">
                  <span>00</span>
                  <span style={{ borderInlineStart: "1px solid #000000" }}>15</span>
                  <span style={{ borderInlineStart: "1px solid #000000" }}>30</span>
                  <span style={{ borderInlineStart: "1px solid #000000" }}>45</span>
                </div>
              </th>
            ))}
            <th
              className="w-[10mm] text-center text-[7.5pt]"
              style={{ border: "1px solid #000000", borderInlineEnd: "1.5px solid #C00000", color: "#C00000" }}
            >
              {lbl.solo}
            </th>
            <th className="w-[10mm] text-center text-[7.5pt]" style={{ border: "1px solid #000000" }}>
              {lbl.dual}
            </th>
          </tr>
        </thead>

        <tbody>
          {displayAircraft.map((ac, acIdx) => {
            const isBand = acIdx % 2 === 0;
            const hours = ac ? calcAircraftHours(ac.id, schedule.grid) : { soloMin: 0, dualMin: 0 };
            const totalRows = displayAircraft.length + 2; // aircraft + standby + notes

            return (
              <tr key={ac ? ac.id : `empty-${acIdx}`} style={{ height: "11.2mm" }}>
                {acIdx === 0 && (
                  <>
                    <td
                      rowSpan={totalRows}
                      className="p-1 align-top text-[7pt] leading-snug"
                      style={{ border: "1px solid #000000", textAlign: isAr ? "right" : "left" }}
                    >
                      {instructors.map((inst) => (
                        <div key={inst.id}>
                          {isAr ? inst.nameAr || translateOfficerToArabic(inst.name) : inst.name}
                        </div>
                      ))}
                    </td>
                    <td
                      rowSpan={totalRows}
                      dir={isAr ? "rtl" : "ltr"}
                      className="p-1 align-top text-[5.8pt] leading-[1.12]"
                      style={{ border: "1px solid #000000", textAlign: isAr ? "right" : "left" }}
                    >
                      {ircpl.length > 0 && (
                        <>
                          <div className="text-center text-[7pt]" style={{ color: "#C00000" }}>
                            IRCPL
                          </div>
                          {ircpl.map((s, idx) => (
                            <div key={s.id} style={{ color: "#C00000" }}>
                              {idx + 1}. {isAr ? s.nameAr || s.name : s.name}
                            </div>
                          ))}
                          <div className="mt-0.5 text-center text-[7pt]" style={{ color: "#000000" }}>
                            PPL
                          </div>
                        </>
                      )}
                      {ppl.map((s, idx) => (
                        <div key={s.id}>
                          {ircpl.length + idx + 1}. {isAr ? s.nameAr || s.name : s.name}
                        </div>
                      ))}
                    </td>
                  </>
                )}

                <td className="text-center text-[8pt] leading-tight" style={{ border: "1px solid #000000" }}>
                  {ac?.registration || ""}
                </td>

                {schedule.timeSlots.map((_, sIdx) => {
                  const sortie = ac ? schedule.grid[ac.id]?.[sIdx] : undefined;
                  const disp = sortie ? formatSortieDisplay(sortie, instructors, students, lang) : null;
                  return (
                    <td
                      key={sIdx}
                      className="p-0 text-center align-middle"
                      style={{
                        backgroundColor: isBand ? "#BDD7EE" : "#FFFFFF",
                        borderTop: "1px solid #000000",
                        borderBottom: "1px solid #000000",
                        borderInlineStart: sIdx === 0 ? "1px solid #000000" : "1px solid #64748B",
                        borderInlineEnd: sIdx === 9 ? "1px solid #000000" : "none",
                      }}
                    >
                      <div
                        className="flex flex-col justify-between"
                        style={{
                          height: "11.2mm",
                          color: sortie?.type === "SOLO" ? "#C00000" : "#000000",
                        }}
                      >
                        <div
                          className="flex flex-1 items-center justify-center px-0.5 text-[5.5pt] leading-tight"
                          style={{ borderBottom: "1px solid #94A3B8" }}
                        >
                          <span className="truncate">{disp?.topLine || ""}</span>
                        </div>
                        <div className="flex flex-1 items-center justify-center px-0.5 text-[5.8pt] leading-tight">
                          <span className="truncate">{disp?.bottomLine || ""}</span>
                        </div>
                      </div>
                    </td>
                  );
                })}

                <td
                  className="text-center text-[7.5pt]"
                  style={{ border: "1px solid #000000", borderInlineEnd: "1.5px solid #C00000", color: "#C00000" }}
                >
                  {ac ? formatMinutes(hours.soloMin, "-") : "-"}
                </td>
                <td className="text-center text-[7.5pt]" style={{ border: "1px solid #000000" }}>
                  {ac ? formatMinutes(hours.dualMin, "-") : "-"}
                </td>
              </tr>
            );
          })}

          {/* Standby Row */}
          <tr style={{ height: "5.5mm" }}>
            <td className="text-center text-[7.5pt]" style={{ border: "1px solid #000000" }}>
              {lbl.standby}
            </td>
            {schedule.timeSlots.map((_, sIdx) => {
              const sb = schedule.standby[sIdx];
              const sbStu = sb ? stuMap.get(sb.studentId) : undefined;
              const sbName = sbStu ? (isAr ? sbStu.nameAr || sbStu.name : sbStu.name) : "";
              return (
                <td
                  key={sIdx}
                  className="px-0.5 text-center text-[6.2pt]"
                  style={{
                    backgroundColor: "#BDD7EE",
                    borderTop: "1px solid #000000",
                    borderBottom: "1px solid #000000",
                    borderInlineStart: sIdx === 0 ? "1px solid #000000" : "1px solid #64748B",
                    borderInlineEnd: sIdx === 9 ? "1px solid #000000" : "none",
                    color: sb?.highlight ? "#C00000" : "#000000",
                  }}
                >
                  {sbName}
                </td>
              );
            })}
            <td
              className="text-center text-[7pt]"
              style={{ border: "1px solid #000000", borderInlineEnd: "1.5px solid #C00000", color: "#C00000" }}
            >
              -
            </td>
            <td className="text-center text-[7pt]" style={{ border: "1px solid #000000" }}>
              -
            </td>
          </tr>

          {/* Notes & Total Hours Row */}
          <tr style={{ height: "13mm" }}>
            <td className="text-center text-[8pt]" style={{ border: "1px solid #000000" }}>
              {lbl.notes}
            </td>
            <td colSpan={10} className="px-2 py-0.5 text-center text-[7pt] leading-tight" style={{ border: "1px solid #000000" }}>
              {notesToRender.map((n, idx) => (
                <div
                  key={idx}
                  style={{
                    color: n.highlight ? "#C00000" : "#000000",
                    textDecoration: n.highlight ? "underline" : "none",
                  }}
                >
                  {n.text}
                </div>
              ))}
            </td>
            <td colSpan={2} className="p-0" style={{ border: "1px solid #000000" }}>
              <div className="py-0.5 text-center text-[6.8pt]" style={{ borderBottom: "1px solid #000000" }}>
                {lbl.totalHours}
              </div>
              <div className="grid grid-cols-2 py-1 text-center text-[7.5pt]">
                <span style={{ color: "#C00000", borderInlineEnd: "1.5px solid #C00000" }}>
                  {formatMinutes(totals.totalSoloMin, "0:00")}
                </span>
                <span>{formatMinutes(totals.totalDualMin, "0:00")}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bottom Summary Row */}
      <div className="mt-1.5 grid items-center gap-2" style={{ gridTemplateColumns: "1fr 47mm" }}>
        <table
          className="w-full border-collapse text-center text-[7pt] font-bold"
          style={{ border: "2px solid #000000" }}
        >
          <tbody>
            <tr>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.operations}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.monitoring}
              </td>
              <td rowSpan={2} className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                Mass Briefing{schedule.massBriefing ? `: ${schedule.massBriefing}` : ""}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                W. Forecast
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {schedule.weather[0]?.time || "9 AM"}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {schedule.weather[1]?.time || "12 PM"}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {schedule.weather[2]?.time || "3 PM"}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.fitness}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.total}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.fit}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.unfit}
              </td>
              <td colSpan={2} className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.acServiceability}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.totalHours}
              </td>
            </tr>
            <tr>
              <td rowSpan={2} className="px-1 py-0.5 text-[7.5pt]" style={{ border: "1px solid #000000" }}>
                {isAr ? translateOfficerToArabic(schedule.operationsOfficer) : schedule.operationsOfficer}
              </td>
              <td rowSpan={2} className="px-1 py-0.5 text-[7.5pt]" style={{ border: "1px solid #000000" }}>
                {isAr ? translateOfficerToArabic(schedule.monitoringOfficer) : schedule.monitoringOfficer}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                Wind (D/KTS)
              </td>
              <td className="px-1 py-0.5 text-[6.2pt]" style={{ border: "1px solid #000000" }}>
                {schedule.weather[0]?.wind}
              </td>
              <td className="px-1 py-0.5 text-[6.2pt]" style={{ border: "1px solid #000000" }}>
                {schedule.weather[1]?.wind}
              </td>
              <td className="px-1 py-0.5 text-[6.2pt]" style={{ border: "1px solid #000000" }}>
                {schedule.weather[2]?.wind}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.instructors}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {instructors.length}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {fitInstructors}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {instructors.length - fitInstructors}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.serviceable}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.unserviceable}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                <span style={{ color: "#C00000" }}>{lbl.solo}</span> + {lbl.dual}
              </td>
            </tr>
            <tr>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                Exams{schedule.exams ? `: ${schedule.exams}` : ""}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                TEMP (°C)
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {schedule.weather[0]?.temp}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {schedule.weather[1]?.temp}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {schedule.weather[2]?.temp}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {lbl.students}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {students.length}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {fitStudents}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {students.length - fitStudents}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {svcAircraft}
              </td>
              <td className="px-1 py-0.5" style={{ border: "1px solid #000000" }}>
                {unsvcAircraft}
              </td>
              <td className="px-1 py-0.5 text-[7.8pt]" style={{ border: "1px solid #000000" }}>
                {formatMinutes(totals.grandTotalMin, "0:00")}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="text-[8.5pt] font-bold leading-tight" style={{ textAlign: isAr ? "left" : "right" }}>
          <div>{lbl.opsManager}</div>
          <div className="mt-1">
            {lbl.signature}{" "}
            {isAr
              ? translateOfficerToArabic(schedule.operationsManager) || "ك/ ............"
              : schedule.operationsManager || "Capt. ___________"}
          </div>
        </div>
      </div>
    </div>
  );
};
