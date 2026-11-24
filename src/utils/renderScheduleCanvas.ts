import { saveAs } from "file-saver";
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
} from "./calculations";

export async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/mfc-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadImageElement(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return null;
  return await new Promise<HTMLImageElement | null>((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

function createA4Canvas() {
  const S = 10; // 1 mm = 10 px -> 2970 x 2100 px (~254 DPI)
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(297 * S);
  canvas.height = Math.round(210 * S);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx, S };
}

function makeFontStr(pt: number, S: number, bold = true, italic = false, family = "Segoe UI, Arial, Tahoma, sans-serif"): string {
  return `${italic ? "italic " : ""}${bold ? "bold " : ""}${((pt * S) / 2.8346).toFixed(1)}px ${family}`;
}

export async function renderModernScheduleCanvas(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  lang: ExportLang = "EN",
  groupName?: string,
  logoDataUrlOverride?: string | null,
  showInspectionHours = true
): Promise<HTMLCanvasElement> {
  const isAr = lang === "AR";
  const fontFamily = isAr ? "Arial, Tahoma, sans-serif" : "'Segoe UI', Arial, sans-serif";
  const { canvas, ctx, S } = createA4Canvas();

  const logoSrc = logoDataUrlOverride !== undefined ? logoDataUrlOverride : await fetchLogoDataUrl();
  const logoImg = await loadImageElement(logoSrc);

  const bx = (xLeftMm: number, wMm: number) => (isAr ? 297 - xLeftMm - wMm : xLeftMm);
  const cx = (xLeftMm: number, wMm: number) => bx(xLeftMm, wMm) + wMm / 2;
  const edgeX = (xLeftMm: number) => (isAr ? 297 - xLeftMm : xLeftMm);

  const fillBox = (xLeftMm: number, yMm: number, wMm: number, hMm: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(bx(xLeftMm, wMm) * S, yMm * S, wMm * S, hMm * S);
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: string, wMm: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = wMm * S;
    ctx.beginPath();
    ctx.moveTo(x1 * S, y1 * S);
    ctx.lineTo(x2 * S, y2 * S);
    ctx.stroke();
  };

  const strokeBox = (xLeftMm: number, yMm: number, wMm: number, hMm: number, color: string, wMmLine: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = wMmLine * S;
    ctx.strokeRect(bx(xLeftMm, wMm) * S, yMm * S, wMm * S, hMm * S);
  };

  const drawText = (
    text: string,
    xMm: number,
    yMm: number,
    opts: {
      pt?: number;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
      align?: CanvasTextAlign;
      rtl?: boolean;
      maxW?: number;
    } = {}
  ) => {
    if (!text) return;
    const {
      pt = 7.0,
      bold = true,
      italic = false,
      underline = false,
      color = "#0F172A",
      align = "center",
      rtl = isAr,
      maxW,
    } = opts;
    ctx.save();
    ctx.font = makeFontStr(pt, S, bold, italic, fontFamily);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.direction = rtl ? "rtl" : "ltr";
    if (maxW) {
      ctx.fillText(text, xMm * S, yMm * S, maxW * S);
    } else {
      ctx.fillText(text, xMm * S, yMm * S);
    }
    if (underline) {
      const measured = ctx.measureText(text).width / S;
      const wUnderline = maxW ? Math.min(measured, maxW) : measured;
      const uy = yMm + pt * 0.22;
      let xStart = xMm - wUnderline / 2;
      if (align === "left") xStart = xMm;
      else if (align === "right") xStart = xMm - wUnderline;
      drawLine(xStart, uy, xStart + wUnderline, uy, color, 0.22);
    }
    ctx.restore();
  };

  const totals = calcScheduleTotals(schedule, aircraft);
  const stuMap = new Map(students.map((s) => [s.id, s]));
  const fitInstructors = instructors.filter((i) => i.fit).length;
  const fitStudents = students.filter((s) => s.fit).length;
  const physicalAircraft = aircraft.filter((a) => a.registration.toUpperCase() !== "EXTRA");
  const svcAircraft = physicalAircraft.filter((a) => a.serviceable).length;
  const unsvcAircraft = physicalAircraft.length - svcAircraft;

  const lbl = isAr
    ? {
        ministry: "وزارة الطيران المدني",
        academy: "الأكاديمية المصرية لعلوم الطيران",
        college: "الكلية المصرية للطيران",
        commander: "قائد المأمورية",
        signature: "التوقيع:",
        title: `يومية طيران ${schedule.airport === "Assiut Airport" ? "مطار أسيوط" : schedule.airport} عن ${formatScheduleTitleDateArabic(schedule.date)} (${schedule.issueLabel || "DAY ISSUE 1"})`,
        aircraft: "الطائرة",
        timeFromTo: "التوقيت من و إلى",
        flightHours: "ساعات الطيران",
        solo: "منفرد",
        dual: "مزدوج",
        dailyTotals: `الإجمالي اليومي — إجمالي الساعات: ${formatMinutes(totals.grandTotalMin, "0:00")}`,
        standby: "احتياطي",
        notes: "ملاحظات",
        operations: "العمليات",
        monitoring: "المراقبة",
        briefingExams: "التلقين والاختبارات",
        massBriefing: "Mass Briefing",
        exams: "Exams",
        wForecast: "W. Forecast",
        wind: "الرياح (kt)",
        temp: "الحرارة (°C)",
        fitness: "اللياقة",
        tot: "إجمالي",
        fit: "لائق",
        unfit: "غير لائق",
        instructors: "مدرسين",
        students: "طلبة",
        acServ: "صلاحية الطائرات",
        serv: "صالح",
        us: "غير صالح",
        totalHours: "إجمالي الساعات",
        opsManager: "مدير العمليات",
        rosterTitle: `مرجع طاقم المدربين والطلبة — ${instructors.length} مدربين / ${students.length} طالب`,
        instructorsLabel: `المدربون — ${instructors.length}:`,
      }
    : {
        ministry: "Ministry of Civil Aviation",
        academy: "Egyptian Aviation Academy",
        college: "Misr Flying College",
        commander: "Mission Commander",
        signature: "Signature:",
        title: `${schedule.airport || "Assiut Airport"} Daily Flight Schedule — ${formatScheduleTitleDate(schedule.date)} (${schedule.issueLabel || "DAY ISSUE 1"})`,
        aircraft: "AIRCRAFT",
        timeFromTo: "TIME FROM & TO",
        flightHours: "FLIGHT HOURS",
        solo: "Solo",
        dual: "Dual",
        dailyTotals: `DAILY TOTALS (GRAND TOTAL: ${formatMinutes(totals.grandTotalMin, "0:00")})`,
        standby: "STANDBY",
        notes: "NOTES",
        operations: "Operations",
        monitoring: "Monitoring",
        briefingExams: "Briefing & Exams",
        massBriefing: "Mass Briefing",
        exams: "Exams",
        wForecast: "W. Forecast",
        wind: "Wind (kt)",
        temp: "Temp (°C)",
        fitness: "Fitness",
        tot: "Tot",
        fit: "Fit",
        unfit: "Unfit",
        instructors: "Instructors",
        students: "Students",
        acServ: "Aircraft Serv.",
        serv: "Serv.",
        us: "U/S",
        totalHours: "Total Hours",
        opsManager: "Operations Manager",
        rosterTitle: `PILOTS & STUDENTS ROSTER REFERENCE${groupName ? ` (${groupName.toUpperCase()})` : ""} — ${instructors.length} INSTRUCTORS / ${students.length} STUDENTS`,
        instructorsLabel: `Instructors (${instructors.length}):`,
      };

  // =========================================================================
  // 1. HEADER
  // =========================================================================
  const authAlign: CanvasTextAlign = isAr ? "right" : "left";
  const authX = isAr ? 293 : 4;
  drawText(lbl.ministry, authX, 5.4, { pt: 8.8, color: "#1B365D", align: authAlign });
  drawText(lbl.academy, authX, 9.0, { pt: 8.8, color: "#1B365D", align: authAlign });
  drawText(lbl.college, authX, 12.6, { pt: 8.8, color: "#1B365D", align: authAlign });

  if (logoImg) {
    ctx.drawImage(logoImg, (148.5 - 26.0) * S, 3.8 * S, 52.0 * S, 9.56 * S);
  } else {
    drawText("EGYPTIAN AVIATION ACADEMY — Misr Flying College", 148.5, 9.0, {
      pt: 10.0,
      color: "#1B365D",
      rtl: false,
    });
  }

  const cmdAlign: CanvasTextAlign = isAr ? "left" : "right";
  const cmdX = isAr ? 4 : 293;
  drawText(lbl.commander, cmdX, 6.4, { pt: 8.8, color: "#0F172A", align: cmdAlign });
  const cmdName = isAr
    ? translateOfficerToArabic(schedule.missionCommander) || "ك/ ..............."
    : schedule.missionCommander || "Capt. _____________";
  drawText(`${isAr ? "\u200F" : ""}${lbl.signature} ${cmdName}`, cmdX, 11.0, {
    pt: 8.8,
    color: "#0F172A",
    align: cmdAlign,
  });

  // 2. TITLE
  drawText(lbl.title, 148.5, 17.0, { pt: 11.0, color: "#1B365D", underline: true });

  // =========================================================================
  // 3. 13-COLUMN SCHEDULE TABLE (289.0 mm)
  // =========================================================================
  const yTbl = 20.0;
  const colAcW = 19.5;
  const colSlotW = 24.35;
  const colSoloW = 13.0;
  const colDualW = 13.0;

  const xAc = 4.0;
  const xSlotsStart = xAc + colAcW; // 23.5
  const xSolo = xSlotsStart + 10 * colSlotW; // 267.0
  const xDual = xSolo + colSoloW; // 280.0

  const hHdr0 = 5.2;
  const hHdr1 = 6.8;
  const yHdr1 = yTbl + hHdr0; // 25.2
  const yBody = yHdr1 + hHdr1; // 32.0

  const displayAircraft: (Aircraft | null)[] = [...aircraft];
  while (displayAircraft.length < 8) displayAircraft.push(null);
  const acCount = displayAircraft.length;
  const bodyH = 86.4;
  const acRowH = bodyH / acCount;
  const yTotals = yBody + bodyH; // 118.4
  const hTotals = 5.8;
  const yStandby = yTotals + hTotals; // 124.2
  const hStandby = 6.4;
  const yNotes = yStandby + hStandby; // 130.6
  const hNotes = 13.0;
  const yTblEnd = yNotes + hNotes; // 143.6

  // Header row 0 (navy)
  fillBox(4.0, yTbl, 289.0, hHdr0, "#1B365D");
  fillBox(xAc, yHdr1, colAcW, hHdr1, "#1B365D");
  drawText(lbl.aircraft, cx(xAc, colAcW), yTbl + (hHdr0 + hHdr1) / 2, { pt: 8.5, color: "#FFFFFF" });
  drawText(lbl.timeFromTo, cx(xSlotsStart, 10 * colSlotW), yTbl + hHdr0 / 2, { pt: 9.4, color: "#FFFFFF" });
  drawText(lbl.flightHours, cx(xSolo, colSoloW + colDualW), yTbl + hHdr0 / 2, { pt: 8.0, color: "#FFFFFF" });

  // Header row 1 (slate)
  fillBox(xSlotsStart, yHdr1, 10 * colSlotW + colSoloW + colDualW, hHdr1, "#F1F5F9");
  for (let i = 0; i < 10; i++) {
    const sx = xSlotsStart + i * colSlotW;
    const slotLbl = schedule.timeSlots[i] || "";
    if (slotLbl) {
      drawText(slotLbl, cx(sx, colSlotW), yHdr1 + 2.3, { pt: 8.6, color: "#1B365D", rtl: false });
      drawText("00   15   30   45", cx(sx, colSlotW), yHdr1 + 5.1, {
        pt: 5.8,
        bold: false,
        color: "#64748B",
        rtl: false,
      });
    }
  }
  drawText(lbl.solo, cx(xSolo, colSoloW), yHdr1 + hHdr1 / 2, { pt: 8.8, color: "#C00000" });
  drawText(lbl.dual, cx(xDual, colDualW), yHdr1 + hHdr1 / 2, { pt: 8.8, color: "#0F172A" });

  // Aircraft body rows
  displayAircraft.forEach((ac, idx) => {
    const ry = yBody + idx * acRowH;
    const isEven = idx % 2 === 0;
    const bandBg = isEven ? "#E9F2FB" : "#FFFFFF";
    const hours = ac ? calcAircraftHours(ac.id, schedule.grid) : { soloMin: 0, dualMin: 0 };
    const soloText = ac ? formatMinutes(hours.soloMin, "-") : "-";
    const dualText = ac ? formatMinutes(hours.dualMin, "-") : "-";
    const covered = ac ? getAircraftCoveredSlots(schedule, ac.id) : new Map();

    // Aircraft col & Flight Hours cols background
    fillBox(xAc, ry, colAcW, acRowH, bandBg);
    fillBox(xSolo, ry, colSoloW, acRowH, bandBg);
    fillBox(xDual, ry, colDualW, acRowH, bandBg);

    const inspAfter =
      showInspectionHours && ac && ac.hoursToInspection !== undefined
        ? ac.hoursToInspection - (hours.soloMin + hours.dualMin) / 60
        : undefined;

    if (ac?.registration) {
      const midY = ry + acRowH / 2;
      if (inspAfter !== undefined) {
        drawText(ac.registration, cx(xAc, colAcW), midY - 1.7, {
          pt: 8.6,
          color: "#1B365D",
          rtl: false,
          maxW: colAcW - 1.2,
        });
        drawText(`${inspAfter.toFixed(1)}h`, cx(xAc, colAcW), midY + 2.1, {
          pt: 7.0,
          bold: false,
          color: "#64748B",
          rtl: false,
        });
      } else {
        drawText(ac.registration, cx(xAc, colAcW), midY, {
          pt: 9.0,
          color: "#1B365D",
          rtl: false,
          maxW: colAcW - 1.2,
        });
      }
    }

    for (let sIdx = 0; sIdx < 10; sIdx++) {
      const sx = xSlotsStart + sIdx * colSlotW;
      const sortie = ac ? schedule.grid[ac.id]?.[sIdx] : undefined;
      const cov = !sortie ? covered.get(sIdx) : undefined;
      const midY = ry + acRowH / 2;

      fillBox(sx, ry, colSlotW, acRowH, "#FFFFFF");
      if (sortie) {
        const isSolo = sortie.type === "SOLO";
        const disp = formatSortieDisplay(sortie, instructors, students, lang);
        drawText(disp.topLine, cx(sx, colSlotW), midY - 2.15, {
          pt: 7.6,
          bold: true,
          color: isSolo ? "#C00000" : "#0F172A",
          maxW: colSlotW - 0.9,
        });
        drawText(disp.bottomLine, cx(sx, colSlotW), midY + 2.15, {
          pt: 7.6,
          bold: true,
          color: isSolo ? "#C00000" : "#0F172A",
          maxW: colSlotW - 0.9,
        });
      } else if (cov) {
        const contLabel = isAr ? `→ امتداد (${cov.fromLabel})` : `← Cont. (${cov.fromLabel})`;
        drawText(contLabel, cx(sx, colSlotW), midY, {
          pt: 7.0,
          bold: true,
          italic: true,
          color: "#1D4ED8",
          maxW: colSlotW - 0.9,
        });
      }
    }

    drawText(soloText, cx(xSolo, colSoloW), ry + acRowH / 2, {
      pt: 8.8,
      color: soloText !== "-" ? "#C00000" : "#64748B",
      rtl: false,
    });
    drawText(dualText, cx(xDual, colDualW), ry + acRowH / 2, {
      pt: 8.8,
      color: dualText !== "-" ? "#0F172A" : "#64748B",
      rtl: false,
    });
  });

  // Totals row
  fillBox(xAc, yTotals, colAcW + 10 * colSlotW, hTotals, "#F1F5F9");
  fillBox(xSolo, yTotals, colSoloW, hTotals, "#F1F5F9");
  fillBox(xDual, yTotals, colDualW, hTotals, "#F1F5F9");
  drawText(lbl.dailyTotals, isAr ? edgeX(xSolo) + 2.0 : edgeX(xSolo) - 2.0, yTotals + hTotals / 2, {
    pt: 8.4,
    color: "#1B365D",
    align: isAr ? "left" : "right",
  });
  drawText(formatMinutes(totals.totalSoloMin, "0:00"), cx(xSolo, colSoloW), yTotals + hTotals / 2, {
    pt: 9.2,
    color: "#C00000",
    rtl: false,
  });
  drawText(formatMinutes(totals.totalDualMin, "0:00"), cx(xDual, colDualW), yTotals + hTotals / 2, {
    pt: 9.2,
    color: "#0F172A",
    rtl: false,
  });

  // Standby row
  fillBox(xAc, yStandby, colAcW, hStandby, "#F8FAFC");
  fillBox(xSlotsStart, yStandby, 10 * colSlotW + colSoloW + colDualW, hStandby, "#FFFFFF");
  drawText(lbl.standby, cx(xAc, colAcW), yStandby + hStandby / 2, { pt: 7.8, color: "#1B365D" });
  const standbyList = schedule.standby || [];
  for (let i = 0; i < 10; i++) {
    const sb = standbyList[i];
    const stu = sb ? stuMap.get(sb.studentId) : undefined;
    const nm = stu ? (isAr ? stu.nameAr || stu.name : stu.name) : "";
    if (nm) {
      drawText(nm, cx(xSlotsStart + i * colSlotW, colSlotW), yStandby + hStandby / 2, {
        pt: 7.8,
        color: sb.highlight ? "#C00000" : "#0F172A",
        maxW: colSlotW - 0.8,
      });
    }
  }
  drawText("-", cx(xSolo, colSoloW), yStandby + hStandby / 2, { pt: 7.6, bold: false, color: "#64748B", rtl: false });
  drawText("-", cx(xDual, colDualW), yStandby + hStandby / 2, { pt: 7.6, bold: false, color: "#64748B", rtl: false });

  // Notes row
  fillBox(xAc, yNotes, colAcW, hNotes, "#F1F5F9");
  fillBox(xSlotsStart, yNotes, 10 * colSlotW + colSoloW + colDualW, hNotes, "#FFFDF7");
  drawText(lbl.notes, cx(xAc, colAcW), yNotes + hNotes / 2, { pt: 7.8, color: "#1B365D" });
  const notesToRender = (isAr ? ARABIC_DEFAULT_NOTES : schedule.notes).slice(0, 3);
  const noteAreaW = 10 * colSlotW + colSoloW + colDualW - 3.0;
  notesToRender.forEach((n, idx) => {
    const ny = yNotes + 2.6 + idx * 3.8;
    drawText(n.text, cx(xSlotsStart, 10 * colSlotW + colSoloW + colDualW), ny, {
      pt: 7.4,
      bold: Boolean(n.highlight),
      underline: Boolean(n.highlight),
      color: n.highlight ? "#C00000" : "#0F172A",
      maxW: noteAreaW,
    });
  });

  // Main table borders
  for (let i = 1; i < 10; i++) {
    const lx = edgeX(xSlotsStart + i * colSlotW);
    drawLine(lx, yHdr1, lx, yTotals, "#CBD5E1", 0.16);
    drawLine(lx, yStandby, lx, yNotes, "#CBD5E1", 0.16);
  }
  // White vertical hairlines on row 0 navy bar
  drawLine(edgeX(xSlotsStart), yTbl, edgeX(xSlotsStart), yHdr1, "#FFFFFF", 0.25);
  drawLine(edgeX(xSolo), yTbl, edgeX(xSolo), yHdr1, "#FFFFFF", 0.25);

  // Horizontal row dividers
  for (let r = 1; r < acCount; r++) {
    const ry = yBody + r * acRowH;
    drawLine(6.0, ry, 291.0, ry, "#94A3B8", 0.22);
  }
  drawLine(edgeX(xSlotsStart), yHdr1, edgeX(xDual + colDualW), yHdr1, "#1B365D", 0.2);
  drawLine(6.0, yBody, 291.0, yBody, "#1B365D", 0.35);
  drawLine(6.0, yTotals, 291.0, yTotals, "#1B365D", 0.35);
  drawLine(6.0, yStandby, 291.0, yStandby, "#1B365D", 0.35);
  drawLine(6.0, yNotes, 291.0, yNotes, "#1B365D", 0.35);

  // Key vertical dividers & thick red Solo/Dual divider
  drawLine(edgeX(xSlotsStart), yHdr1, edgeX(xSlotsStart), yTblEnd, "#1B365D", 0.35);
  drawLine(edgeX(xSolo), yHdr1, edgeX(xSolo), yTblEnd, "#1B365D", 0.35);
  drawLine(edgeX(xDual), yHdr1, edgeX(xDual), yNotes, "#C00000", 0.5);

  // Outer Navy Box
  strokeBox(6.0, yTbl, 285.0, yTblEnd - yTbl, "#1B365D", 0.55);

  // =========================================================================
  // 4. OPERATIONS SUMMARY TABLE (16 cols = 285.0 mm)
  // =========================================================================
  const yOps = yTblEnd + 2.6; // 134.0
  const opsWidths = [21.0, 21.0, 22.0, 16.0, 19.0, 13.0, 13.0, 13.0, 19.0, 10.0, 10.0, 10.0, 14.0, 14.0, 24.0, 46.0];
  const opsX: number[] = [6.0];
  opsWidths.forEach((w) => opsX.push(opsX[opsX.length - 1] + w));
  const oh0 = 4.6;
  const oh1 = 5.0;
  const oh2 = 5.0;
  const opsTotalH = oh0 + oh1 + oh2; // 14.6
  const yOps1 = yOps + oh0;
  const yOps2 = yOps1 + oh1;

  const w0 = schedule.weather[0] || { time: "9 AM", wind: "", temp: "" };
  const w1 = schedule.weather[1] || { time: "12 PM", wind: "", temp: "" };
  const w2 = schedule.weather[2] || { time: "3 PM", wind: "", temp: "" };

  // Navy header strip cols 0..14 (239 mm)
  fillBox(opsX[0], yOps, opsX[15] - opsX[0], oh0, "#1B365D");
  fillBox(opsX[0], yOps1, opsX[15] - opsX[0], oh1 + oh2, "#FFFFFF");
  // Label shaded cells
  [2, 4, 8].forEach((cIdx) => fillBox(opsX[cIdx], yOps1, opsWidths[cIdx], oh1 + oh2, "#F1F5F9"));
  [12, 13, 14].forEach((cIdx) => fillBox(opsX[cIdx], yOps1, opsWidths[cIdx], oh1, "#F1F5F9"));

  // Header titles
  drawText(lbl.operations, cx(opsX[0], opsWidths[0]), yOps + oh0 / 2, { pt: 6.4, color: "#FFFFFF" });
  drawText(lbl.monitoring, cx(opsX[1], opsWidths[1]), yOps + oh0 / 2, { pt: 6.4, color: "#FFFFFF" });
  drawText(lbl.briefingExams, cx(opsX[2], opsWidths[2] + opsWidths[3]), yOps + oh0 / 2, { pt: 6.4, color: "#FFFFFF" });
  drawText(lbl.wForecast, cx(opsX[4], opsWidths[4]), yOps + oh0 / 2, { pt: 6.3, color: "#FFFFFF", rtl: false });
  drawText(w0.time || "9 AM", cx(opsX[5], opsWidths[5]), yOps + oh0 / 2, { pt: 6.2, color: "#FFFFFF", rtl: false });
  drawText(w1.time || "12 PM", cx(opsX[6], opsWidths[6]), yOps + oh0 / 2, { pt: 6.2, color: "#FFFFFF", rtl: false });
  drawText(w2.time || "3 PM", cx(opsX[7], opsWidths[7]), yOps + oh0 / 2, { pt: 6.2, color: "#FFFFFF", rtl: false });
  drawText(lbl.fitness, cx(opsX[8], opsWidths[8]), yOps + oh0 / 2, { pt: 6.4, color: "#FFFFFF" });
  drawText(lbl.tot, cx(opsX[9], opsWidths[9]), yOps + oh0 / 2, { pt: 6.4, color: "#FFFFFF" });
  drawText(lbl.fit, cx(opsX[10], opsWidths[10]), yOps + oh0 / 2, { pt: 6.4, color: "#FFFFFF" });
  drawText(lbl.unfit, cx(opsX[11], opsWidths[11]), yOps + oh0 / 2, { pt: 6.2, color: "#FFFFFF" });
  drawText(lbl.acServ, cx(opsX[12], opsWidths[12] + opsWidths[13]), yOps + oh0 / 2, { pt: 6.4, color: "#FFFFFF" });
  drawText(lbl.totalHours, cx(opsX[14], opsWidths[14]), yOps + oh0 / 2, { pt: 6.4, color: "#FFFFFF" });

  // Values row 1+2
  const opsOff = isAr ? translateOfficerToArabic(schedule.operationsOfficer) : schedule.operationsOfficer || "";
  const monOff = isAr ? translateOfficerToArabic(schedule.monitoringOfficer) : schedule.monitoringOfficer || "";
  drawText(opsOff, cx(opsX[0], opsWidths[0]), yOps1 + (oh1 + oh2) / 2, {
    pt: 6.8,
    color: "#0F172A",
    maxW: opsWidths[0] - 1.2,
  });
  drawText(monOff, cx(opsX[1], opsWidths[1]), yOps1 + (oh1 + oh2) / 2, {
    pt: 6.8,
    color: "#0F172A",
    maxW: opsWidths[1] - 1.2,
  });

  drawText(lbl.massBriefing, cx(opsX[2], opsWidths[2]), yOps1 + oh1 / 2, { pt: 6.2, color: "#1B365D", rtl: false });
  drawText(schedule.massBriefing || "", cx(opsX[3], opsWidths[3]), yOps1 + oh1 / 2, {
    pt: 6.0,
    color: "#0F172A",
    maxW: opsWidths[3] - 1.0,
  });
  drawText(lbl.exams, cx(opsX[2], opsWidths[2]), yOps2 + oh2 / 2, { pt: 6.2, color: "#1B365D", rtl: false });
  drawText(schedule.exams || "", cx(opsX[3], opsWidths[3]), yOps2 + oh2 / 2, {
    pt: 6.0,
    color: "#0F172A",
    maxW: opsWidths[3] - 1.0,
  });

  drawText(lbl.wind, cx(opsX[4], opsWidths[4]), yOps1 + oh1 / 2, { pt: 6.0, color: "#1B365D" });
  drawText(lbl.temp, cx(opsX[4], opsWidths[4]), yOps2 + oh2 / 2, { pt: 6.0, color: "#1B365D" });

  [w0, w1, w2].forEach((ws, wi) => {
    const colI = 5 + wi;
    const wLines = (ws.wind || "").split("\n");
    if (wLines.length === 1) {
      drawText(wLines[0], cx(opsX[colI], opsWidths[colI]), yOps1 + oh1 / 2, {
        pt: 5.5,
        color: "#0F172A",
        rtl: false,
        maxW: opsWidths[colI] - 1.0,
      });
    } else {
      drawText(wLines[0], cx(opsX[colI], opsWidths[colI]), yOps1 + oh1 / 2 - 1.1, {
        pt: 5.2,
        color: "#0F172A",
        rtl: false,
        maxW: opsWidths[colI] - 1.0,
      });
      drawText(wLines[1], cx(opsX[colI], opsWidths[colI]), yOps1 + oh1 / 2 + 1.1, {
        pt: 5.2,
        color: "#0F172A",
        rtl: false,
        maxW: opsWidths[colI] - 1.0,
      });
    }
    drawText(ws.temp || "", cx(opsX[colI], opsWidths[colI]), yOps2 + oh2 / 2, {
      pt: 6.2,
      color: "#0F172A",
      rtl: false,
    });
  });

  drawText(lbl.instructors, cx(opsX[8], opsWidths[8]), yOps1 + oh1 / 2, { pt: 6.2, color: "#1B365D" });
  drawText(String(instructors.length), cx(opsX[9], opsWidths[9]), yOps1 + oh1 / 2, { pt: 6.5, rtl: false });
  drawText(String(fitInstructors), cx(opsX[10], opsWidths[10]), yOps1 + oh1 / 2, { pt: 6.5, rtl: false });
  drawText(String(instructors.length - fitInstructors), cx(opsX[11], opsWidths[11]), yOps1 + oh1 / 2, { pt: 6.5, rtl: false });

  drawText(lbl.students, cx(opsX[8], opsWidths[8]), yOps2 + oh2 / 2, { pt: 6.2, color: "#1B365D" });
  drawText(String(students.length), cx(opsX[9], opsWidths[9]), yOps2 + oh2 / 2, { pt: 6.5, rtl: false });
  drawText(String(fitStudents), cx(opsX[10], opsWidths[10]), yOps2 + oh2 / 2, { pt: 6.5, rtl: false });
  drawText(String(students.length - fitStudents), cx(opsX[11], opsWidths[11]), yOps2 + oh2 / 2, { pt: 6.5, rtl: false });

  drawText(lbl.serv, cx(opsX[12], opsWidths[12]), yOps1 + oh1 / 2, { pt: 6.1, color: "#1B365D" });
  drawText(lbl.us, cx(opsX[13], opsWidths[13]), yOps1 + oh1 / 2, { pt: 6.1, color: "#1B365D" });
  drawText(String(svcAircraft), cx(opsX[12], opsWidths[12]), yOps2 + oh2 / 2, { pt: 7.0, rtl: false });
  drawText(String(unsvcAircraft), cx(opsX[13], opsWidths[13]), yOps2 + oh2 / 2, { pt: 7.0, rtl: false });

  drawText(`${lbl.solo} + ${lbl.dual}`, cx(opsX[14], opsWidths[14]), yOps1 + oh1 / 2, {
    pt: 6.2,
    color: "#C00000",
  });
  drawText(formatMinutes(totals.grandTotalMin, "0:00"), cx(opsX[14], opsWidths[14]), yOps2 + oh2 / 2, {
    pt: 7.6,
    color: "#1B365D",
    rtl: false,
  });

  // Gridlines inside Ops box
  drawLine(edgeX(opsX[0]), yOps1, edgeX(opsX[15]), yOps1, "#1B365D", 0.3);
  drawLine(edgeX(opsX[2]), yOps2, edgeX(opsX[15]), yOps2, "#CBD5E1", 0.16);
  for (let c = 1; c < 15; c++) {
    const gx = edgeX(opsX[c]);
    const isHdr = c === 3 || c === 13;
    const isMajor = c === 1 || c === 2 || c === 4 || c === 8 || c === 12 || c === 14;
    if (!isHdr) {
      drawLine(gx, yOps, gx, yOps1, "#FFFFFF", 0.18);
    }
    drawLine(gx, yOps1, gx, yOps + opsTotalH, isMajor ? "#94A3B8" : "#CBD5E1", isMajor ? 0.24 : 0.16);
  }
  strokeBox(opsX[0], yOps, opsX[15] - opsX[0], opsTotalH, "#1B365D", 0.45);

  // Ops Manager signature block (borderless right side)
  const mgrAlign: CanvasTextAlign = isAr ? "left" : "right";
  const mgrX = isAr ? 6.0 : 291.0;
  drawText(lbl.opsManager, mgrX, yOps + 4.8, { pt: 7.6, color: "#0F172A", align: mgrAlign });
  const mgrName = isAr
    ? translateOfficerToArabic(schedule.operationsManager) || "ك/ ..............."
    : schedule.operationsManager || "Capt. _____________";
  drawText(`${isAr ? "\u200F" : ""}${lbl.signature} ${mgrName}`, mgrX, yOps + 9.8, {
    pt: 7.6,
    color: "#0F172A",
    align: mgrAlign,
  });

  // =========================================================================
  // 5. PILOTS & STUDENTS ROSTER REFERENCE BOX (6 cols x 47.5 mm = 285.0 mm)
  // =========================================================================
  const yRos = yOps + opsTotalH + 2.8; // 151.4
  const rHdrH = 4.6;
  const rInstH = 5.0;
  const perCol = Math.max(1, Math.ceil(students.length / 6));
  const stuLineStep = perCol <= 6 ? 3.8 : Math.min(3.8, 36.0 / perCol);
  const stuPt = perCol <= 6 ? 6.2 : Math.max(5.0, Math.min(6.0, stuLineStep * 1.65));
  const rBodyH = Math.max(24.0, perCol * stuLineStep + 4.2);

  fillBox(6.0, yRos, 285.0, rHdrH, "#1B365D");
  fillBox(6.0, yRos + rHdrH, 285.0, rInstH, "#E9F2FB");
  fillBox(6.0, yRos + rHdrH + rInstH, 285.0, rBodyH, "#FFFFFF");

  drawText(lbl.rosterTitle, 148.5, yRos + rHdrH / 2, { pt: 6.6, color: "#FFFFFF" });
  const instLine = instructors
    .map((i) => (isAr ? i.nameAr || translateOfficerToArabic(i.name) : i.name))
    .join("   |   ");
  drawText(`${lbl.instructorsLabel}   ${instLine || "-"}`, 148.5, yRos + rHdrH + rInstH / 2, {
    pt: 6.3,
    color: "#0F172A",
    maxW: 280.0,
  });

  const colW = 47.5;
  for (let cIdx = 0; cIdx < 6; cIdx++) {
    const xLeft = 6.0 + cIdx * colW;
    if (cIdx > 0) {
      drawLine(edgeX(xLeft), yRos + rHdrH + rInstH, edgeX(xLeft), yRos + rHdrH + rInstH + rBodyH, "#CBD5E1", 0.16);
    }
    const slice = students.slice(cIdx * perCol, (cIdx + 1) * perCol);
    slice.forEach((s, off) => {
      const num = cIdx * perCol + off + 1;
      const nm = isAr ? s.nameAr || s.name : s.name;
      const unfitTag = s.fit ? "" : isAr ? " (غير لائق)" : " (U)";
      const entry = isAr ? `\u200F${num}- ${nm}${unfitTag}` : `${num}. ${nm}${unfitTag}`;
      const ty = yRos + rHdrH + rInstH + 2.6 + off * stuLineStep;
      const tx = isAr ? edgeX(xLeft) - 2.2 : xLeft + 2.2;
      drawText(entry, tx, ty, {
        pt: stuPt,
        bold: s.program === "IRCPL",
        color: s.program === "IRCPL" ? "#C00000" : "#0F172A",
        align: isAr ? "right" : "left",
        maxW: colW - 4.0,
      });
    });
  }

  drawLine(6.0, yRos + rHdrH, 291.0, yRos + rHdrH, "#CBD5E1", 0.18);
  drawLine(6.0, yRos + rHdrH + rInstH, 291.0, yRos + rHdrH + rInstH, "#94A3B8", 0.25);
  strokeBox(6.0, yRos, 285.0, rHdrH + rInstH + rBodyH, "#1B365D", 0.45);

  return canvas;
}

export async function renderClassicScheduleCanvas(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  lang: ExportLang = "AR",
  logoDataUrlOverride?: string | null
): Promise<HTMLCanvasElement> {
  const isAr = lang === "AR";
  const fontFamily = isAr ? "Arial, Tahoma, sans-serif" : "Calibri, Arial, sans-serif";
  const { canvas, ctx, S } = createA4Canvas();

  const logoSrc = logoDataUrlOverride !== undefined ? logoDataUrlOverride : await fetchLogoDataUrl();
  const logoImg = await loadImageElement(logoSrc);

  const bx = (xLeftMm: number, wMm: number) => (isAr ? 297 - xLeftMm - wMm : xLeftMm);
  const cx = (xLeftMm: number, wMm: number) => bx(xLeftMm, wMm) + wMm / 2;
  const edgeX = (xLeftMm: number) => (isAr ? 297 - xLeftMm : xLeftMm);

  const line = (x1: number, y1: number, x2: number, y2: number, color = "#000000", wMm = 0.25) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = wMm * S;
    ctx.beginPath();
    ctx.moveTo(x1 * S, y1 * S);
    ctx.lineTo(x2 * S, y2 * S);
    ctx.stroke();
  };

  const txt = (
    text: string,
    xMm: number,
    yMm: number,
    opts: { pt?: number; color?: string; align?: CanvasTextAlign; rtl?: boolean; maxW?: number } = {}
  ) => {
    if (!text) return;
    const { pt = 7.5, color = "#000000", align = "center", rtl = isAr, maxW } = opts;
    ctx.save();
    ctx.font = makeFontStr(pt, S, true, false, fontFamily);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.direction = rtl ? "rtl" : "ltr";
    if (maxW) ctx.fillText(text, xMm * S, yMm * S, maxW * S);
    else ctx.fillText(text, xMm * S, yMm * S);
    ctx.restore();
  };

  const totals = calcScheduleTotals(schedule, aircraft);
  const stuMap = new Map(students.map((s) => [s.id, s]));
  const fitInstructors = instructors.filter((i) => i.fit).length;
  const fitStudents = students.filter((s) => s.fit).length;
  const physicalAircraft = aircraft.filter((a) => a.registration.toUpperCase() !== "EXTRA");
  const svcAircraft = physicalAircraft.filter((a) => a.serviceable).length;
  const unsvcAircraft = physicalAircraft.length - svcAircraft;

  // Header
  txt(isAr ? "وزارة الطيران المدني" : "Ministry of Civil Aviation", isAr ? 291 : 6, 8, {
    pt: 9,
    align: isAr ? "right" : "left",
  });
  txt(isAr ? "الأكاديمية المصرية لعلوم الطيران" : "Egyptian Aviation Academy", isAr ? 291 : 6, 12, {
    pt: 9,
    align: isAr ? "right" : "left",
  });
  txt(isAr ? "الكلية المصرية للطيران" : "Misr Flying College", isAr ? 291 : 6, 16, {
    pt: 9,
    align: isAr ? "right" : "left",
  });

  if (logoImg) {
    ctx.drawImage(logoImg, (148.5 - 35) * S, 5.2 * S, 70 * S, 12.87 * S);
  } else {
    txt("EGYPTIAN AVIATION ACADEMY — Misr Flying College", 148.5, 11.5, { pt: 10, color: "#1B365D", rtl: false });
  }

  txt(isAr ? "قائد المأمورية" : "Mission Commander", isAr ? 6 : 291, 9, {
    pt: 9,
    align: isAr ? "left" : "right",
  });
  const cmdName = isAr
    ? translateOfficerToArabic(schedule.missionCommander) || "ك/ ............"
    : schedule.missionCommander || "Capt. _____________";
  txt(`${isAr ? "\u200Fالتوقيع:" : "Signature:"} ${cmdName}`, isAr ? 6 : 291, 14, {
    pt: 9,
    align: isAr ? "left" : "right",
  });

  const airportTitle = isAr
    ? `يومية طيران ${schedule.airport === "Assiut Airport" ? "مطار أسيوط" : schedule.airport} عن ${formatScheduleTitleDateArabic(schedule.date)} (${schedule.issueLabel || "DAY ISSUE 1"})`
    : `${schedule.airport || "Assiut Airport"} Daily Flight Schedule — ${formatScheduleTitleDate(schedule.date)} (${schedule.issueLabel || "DAY ISSUE 1"})`;
  txt(airportTitle, 148.5, 22, { pt: 10 });
  ctx.font = makeFontStr(10, S, true, false, fontFamily);
  const titleWmm = Math.min(280, ctx.measureText(airportTitle).width / S);
  line(148.5 - titleWmm / 2, 24.0, 148.5 + titleWmm / 2, 24.0, "#000000", 0.3);

  // Main Table Geometry (logical left -> right, mirrored via bx/cx/edgeX)
  const yTbl = 25.5;
  const colPilot = 20.5;
  const colStudent = 27.5;
  const colAircraft = 13.0;
  const colSlot = 20.4;
  const colSolo = 10.0;
  const colDual = 10.0;

  const xPilot = 6.0;
  const xStudent = xPilot + colPilot; // 26.5
  const xAircraft = xStudent + colStudent; // 54.0
  const xTime = xAircraft + colAircraft; // 67.0
  const xSolo = xTime + 10 * colSlot; // 271.0
  const xDual = xSolo + colSolo; // 281.0

  const yHdr1 = yTbl + 5.2;
  const yHdr2 = yHdr1 + 4.8;
  const yBody = yHdr2 + 4.4;

  const displayAircraft: (Aircraft | null)[] = [...aircraft];
  while (displayAircraft.length < 8) displayAircraft.push(null);
  const acCount = displayAircraft.length;
  const bodyH = 117.5;
  const acRowH = bodyH / acCount;
  const standbyH = 5.6;
  const notesH = 13.4;
  const yStandby = yBody + bodyH;
  const yNotes = yStandby + standbyH;
  const yTblEnd = yNotes + notesH;

  txt(isAr ? "المأمورية" : "Mission", cx(xPilot, colPilot + colStudent), yTbl + 2.7, { pt: 8.5 });
  txt(isAr ? "الطائرة" : "Aircraft", cx(xAircraft, colAircraft), yTbl + (yBody - yTbl) / 2, { pt: 8 });
  txt(isAr ? "التوقيت من و إلى" : "Time From & To", cx(xTime, 10 * colSlot), yTbl + 2.7, { pt: 9 });
  txt(isAr ? "ساعات" : "Flight", cx(xSolo, colSolo + colDual), yTbl + 3.2, { pt: 7.8 });
  txt(isAr ? "الطيران" : "Hours", cx(xSolo, colSolo + colDual), yTbl + 6.6, { pt: 7.8 });
  txt(isAr ? "الطيار" : "Pilot", cx(xPilot, colPilot), yHdr1 + (yBody - yHdr1) / 2, { pt: 8 });
  txt(isAr ? "الطالب" : "Student", cx(xStudent, colStudent), yHdr1 + (yBody - yHdr1) / 2, { pt: 8 });

  for (let sIdx = 0; sIdx < 10; sIdx++) {
    const sx = xTime + sIdx * colSlot;
    const tLbl = schedule.timeSlots[sIdx] || "";
    if (tLbl) {
      txt(tLbl, isAr ? edgeX(sx) - 1.2 : edgeX(sx) + 1.2, yHdr1 + 2.4, {
        pt: 7.5,
        align: isAr ? "right" : "left",
        rtl: false,
      });
    }
    const qW = colSlot / 4;
    (["00", "15", "30", "45"] as const).forEach((qTxt, qIdx) => {
      txt(qTxt, cx(sx + qIdx * qW, qW), yHdr2 + 2.2, { pt: 6, rtl: false });
      if (qIdx > 0) {
        const lx = edgeX(sx + qIdx * qW);
        line(lx, yHdr2, lx, yBody, "#000000", 0.18);
      }
    });
    if (sIdx > 0) line(edgeX(sx), yHdr1, edgeX(sx), yBody, "#000000", 0.18);
  }
  txt(isAr ? "منفرد" : "Solo", cx(xSolo, colSolo), yHdr2 + 2.2, { pt: 7.5, color: "#C00000" });
  txt(isAr ? "مزدوج" : "Dual", cx(xDual, colDual), yHdr2 + 2.2, { pt: 7.5 });

  displayAircraft.forEach((ac, acIdx) => {
    const ry = yBody + acIdx * acRowH;
    if (acIdx % 2 === 0) {
      ctx.fillStyle = "#BDD7EE";
      ctx.fillRect(bx(xTime, 10 * colSlot) * S, ry * S, (10 * colSlot) * S, acRowH * S);
    }
    const rawReg = ac?.registration || "";
    const reg = isAr && rawReg.toUpperCase() === "EXTRA" ? "" : rawReg;
    if (reg) {
      const parts = reg.includes("-")
        ? [reg.split("-")[0] + "-", reg.split("-").slice(1).join("-")]
        : [reg];
      if (parts.length === 2) {
        txt(parts[0], cx(xAircraft, colAircraft), ry + acRowH / 2 - 1.9, { pt: 8.8, rtl: false });
        txt(parts[1], cx(xAircraft, colAircraft), ry + acRowH / 2 + 2.0, { pt: 8.8, rtl: false });
      } else {
        txt(parts[0], cx(xAircraft, colAircraft), ry + acRowH / 2, { pt: 8.8, rtl: false });
      }
    }

    for (let sIdx = 0; sIdx < 10; sIdx++) {
      const sortie = ac ? schedule.grid[ac.id]?.[sIdx] : undefined;
      if (!sortie) continue;
      const sxCenter = cx(xTime + sIdx * colSlot, colSlot);
      const disp = formatSortieDisplay(sortie, instructors, students, lang);
      const clr = sortie.type === "SOLO" ? "#C00000" : "#000000";
      txt(disp.topLine, sxCenter, ry + acRowH / 2 - 2.5, { pt: 7.0, color: clr, maxW: colSlot - 0.8 });
      txt(disp.bottomLine, sxCenter, ry + acRowH / 2 + 2.5, { pt: 7.2, color: clr, maxW: colSlot - 0.8 });
    }

    const hours = ac ? calcAircraftHours(ac.id, schedule.grid) : { soloMin: 0, dualMin: 0 };
    txt(ac ? formatMinutes(hours.soloMin, "-") : "-", cx(xSolo, colSolo), ry + acRowH / 2, {
      pt: 8.4,
      color: "#C00000",
      rtl: false,
    });
    txt(ac ? formatMinutes(hours.dualMin, "-") : "-", cx(xDual, colDual), ry + acRowH / 2, {
      pt: 8.4,
      rtl: false,
    });
  });

  // Standby row
  ctx.fillStyle = "#BDD7EE";
  ctx.fillRect(bx(xTime, 10 * colSlot) * S, yStandby * S, (10 * colSlot) * S, standbyH * S);
  txt(isAr ? "احتياطي" : "Standby", cx(xAircraft, colAircraft), yStandby + standbyH / 2, { pt: 7.6 });
  for (let sIdx = 0; sIdx < 10; sIdx++) {
    const sb = schedule.standby[sIdx];
    if (!sb) continue;
    const st = stuMap.get(sb.studentId);
    const sbName = st ? (isAr ? st.nameAr || st.name : st.name) : "";
    if (!sbName) continue;
    txt(sbName, cx(xTime + sIdx * colSlot, colSlot), yStandby + standbyH / 2, {
      pt: 7.2,
      color: sb.highlight ? "#C00000" : "#000000",
      maxW: colSlot - 0.8,
    });
  }
  txt("-", cx(xSolo, colSolo), yStandby + standbyH / 2, { pt: 8.2, color: "#C00000", rtl: false });
  txt("-", cx(xDual, colDual), yStandby + standbyH / 2, { pt: 8.2, rtl: false });

  // Pilots
  instructors.forEach((inst, idx) => {
    const nm = isAr ? inst.nameAr || translateOfficerToArabic(inst.name) : inst.name;
    txt(nm, isAr ? edgeX(xPilot) - 1.0 : edgeX(xPilot) + 1.0, yBody + 3.6 + idx * 4.5, {
      pt: 7.0,
      align: isAr ? "right" : "left",
      maxW: colPilot - 1.6,
    });
  });

  // Students
  const ircpl = students.filter((s) => s.program === "IRCPL");
  const ppl = students.filter((s) => s.program === "PPL");
  const showProgramHeaders = ircpl.length > 0;
  const totalLines = students.length + (showProgramHeaders ? 2 : 0);
  const lineH = Math.min(3.85, (bodyH + standbyH + notesH - 3.5) / Math.max(totalLines, 1));
  const stuPt = totalLines > 34 ? 6.4 : 7.0;
  let sy = yBody + 2.8;
  const stuTextX = isAr ? edgeX(xStudent) - 1.0 : edgeX(xStudent) + 1.0;
  const stuAlign: CanvasTextAlign = isAr ? "right" : "left";

  if (showProgramHeaders) {
    txt("IRCPL", cx(xStudent, colStudent), sy, { pt: 6.8, color: "#C00000", rtl: false });
    sy += lineH;
    ircpl.forEach((s, i) => {
      if (sy < yTblEnd - 1.2) {
        const label = isAr ? `${i + 1}- ${s.nameAr || s.name}` : `${i + 1}. ${s.name}`;
        txt(label, stuTextX, sy, { pt: stuPt, color: "#C00000", align: stuAlign, maxW: colStudent - 2.0 });
      }
      sy += lineH;
    });
    sy += 0.5;
    txt("PPL", cx(xStudent, colStudent), sy, { pt: 6.8, rtl: false });
    sy += lineH;
  }

  ppl.forEach((s, i) => {
    if (sy < yTblEnd - 1.2) {
      const idxNum = ircpl.length + i + 1;
      const label = isAr ? `${idxNum}- ${s.nameAr || s.name}` : `${idxNum}. ${s.name}`;
      txt(label, stuTextX, sy, { pt: stuPt, align: stuAlign, maxW: colStudent - 2.0 });
    }
    sy += lineH;
  });

  // Notes & Totals
  txt(isAr ? "ملاحظات" : "Notes", cx(xAircraft, colAircraft), yNotes + notesH / 2, { pt: 8.6 });
  const notesArr = (isAr ? ARABIC_DEFAULT_NOTES : schedule.notes).slice(0, 3);
  const noteCenter = cx(xTime, 10 * colSlot);
  notesArr.forEach((n, idx) => {
    const ny = yNotes + 3.0 + idx * 3.8;
    const clr = n.highlight ? "#C00000" : "#000000";
    txt(n.text, noteCenter, ny, { pt: 7.4, color: clr, maxW: 10 * colSlot - 4 });
    if (n.highlight) {
      ctx.font = makeFontStr(7.4, S, true, false, fontFamily);
      const nw = Math.min(ctx.measureText(n.text).width / S, 10 * colSlot - 4);
      line(noteCenter - nw / 2, ny + 1.4, noteCenter + nw / 2, ny + 1.4, "#C00000", 0.22);
    }
  });

  const yTotSplit = yNotes + 4.8;
  txt(isAr ? "إجمالي الساعات" : "Total Hours", cx(xSolo, colSolo + colDual), yNotes + 2.5, { pt: 7.4 });
  txt(formatMinutes(totals.totalSoloMin, "0:00"), cx(xSolo, colSolo), yTotSplit + 4.2, {
    pt: 8.4,
    color: "#C00000",
    rtl: false,
  });
  txt(formatMinutes(totals.totalDualMin, "0:00"), cx(xDual, colDual), yTotSplit + 4.2, {
    pt: 8.4,
    rtl: false,
  });

  // Grid lines
  line(edgeX(xStudent), yHdr1, edgeX(xStudent), yTblEnd, "#000000", 0.28);
  line(edgeX(xAircraft), yTbl, edgeX(xAircraft), yTblEnd, "#000000", 0.32);
  line(edgeX(xTime), yTbl, edgeX(xTime), yTblEnd, "#000000", 0.32);
  line(edgeX(xSolo), yTbl, edgeX(xSolo), yTblEnd, "#000000", 0.32);

  line(edgeX(xPilot), yHdr1, edgeX(xAircraft), yHdr1, "#000000", 0.32);
  line(edgeX(xTime), yHdr1, edgeX(xSolo), yHdr1, "#000000", 0.32);
  line(edgeX(xTime), yHdr2, edgeX(xDual + colDual), yHdr2, "#000000", 0.32);
  line(edgeX(xPilot), yBody, edgeX(xDual + colDual), yBody, "#000000", 0.32);

  for (let sIdx = 1; sIdx < 10; sIdx++) {
    const lx = edgeX(xTime + sIdx * colSlot);
    line(lx, yBody, lx, yNotes, "#505A69", 0.18);
  }
  for (let acIdx = 0; acIdx < acCount; acIdx++) {
    line(edgeX(xTime), yBody + acIdx * acRowH + acRowH / 2, edgeX(xSolo), yBody + acIdx * acRowH + acRowH / 2, "#8C9BAA", 0.12);
    if (acIdx > 0) line(edgeX(xAircraft), yBody + acIdx * acRowH, edgeX(xDual + colDual), yBody + acIdx * acRowH, "#000000", 0.3);
  }
  line(edgeX(xAircraft), yStandby, edgeX(xDual + colDual), yStandby, "#000000", 0.3);
  line(edgeX(xAircraft), yNotes, edgeX(xDual + colDual), yNotes, "#000000", 0.32);
  line(edgeX(xSolo), yTotSplit, edgeX(xDual + colDual), yTotSplit, "#000000", 0.2);

  line(edgeX(xDual), yHdr2, edgeX(xDual), yNotes, "#C00000", 0.35);
  line(edgeX(xDual), yTotSplit, edgeX(xDual), yTblEnd, "#C00000", 0.35);

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 0.6 * S;
  ctx.strokeRect(6.0 * S, yTbl * S, 285 * S, (yTblEnd - yTbl) * S);

  // Bottom Summary Bar
  const yBot = 180.0;
  const bh0 = 5.4;
  const bh1 = 7.2;
  const bh2 = 5.4;
  const botH = bh0 + bh1 + bh2;
  const botCols = [21.5, 21.5, 24.0, 19.0, 12.5, 14.5, 14.5, 19.0, 11.0, 10.0, 10.0, 17.5, 18.5, 21.5];
  const botX: number[] = [6.0];
  botCols.forEach((w) => botX.push(botX[botX.length - 1] + w));

  const botCenter = (s: string, colIdx: number, ry: number, rh: number, pt = 7.0, clr = "#000000", rtl = isAr) => {
    if (!s) return;
    const xCenter = cx(botX[colIdx], botCols[colIdx]);
    const lines = s.split("\n");
    if (lines.length === 1) {
      txt(lines[0], xCenter, ry + rh / 2, { pt, color: clr, rtl, maxW: botCols[colIdx] - 1.5 });
    } else {
      txt(lines[0], xCenter, ry + rh / 2 - 1.6, { pt, color: clr, rtl, maxW: botCols[colIdx] - 1.5 });
      txt(lines[1], xCenter, ry + rh / 2 + 1.6, { pt, color: clr, rtl, maxW: botCols[colIdx] - 1.5 });
    }
  };

  const w0 = schedule.weather[0] || { time: "9 AM", wind: "", temp: "" };
  const w1 = schedule.weather[1] || { time: "12 PM", wind: "", temp: "" };
  const w2 = schedule.weather[2] || { time: "3 PM", wind: "", temp: "" };

  botCenter(isAr ? "العمليات" : "Operations", 0, yBot, bh0, 7.2);
  botCenter(isAr ? "المراقبة" : "Monitoring", 1, yBot, bh0, 7.2);
  botCenter(schedule.massBriefing ? `Mass Briefing\n${schedule.massBriefing}` : "Mass Briefing", 2, yBot, bh0 + bh1, 7.2, "#000000", false);
  botCenter("W. Forecast", 3, yBot, bh0, 6.8, "#000000", false);
  botCenter(w0.time || "9 AM", 4, yBot, bh0, 6.8, "#000000", false);
  botCenter(w1.time || "12 PM", 5, yBot, bh0, 6.8, "#000000", false);
  botCenter(w2.time || "3 PM", 6, yBot, bh0, 6.8, "#000000", false);
  botCenter(isAr ? "اللياقة" : "Fitness", 7, yBot, bh0, 7.2);
  botCenter(isAr ? "إجمالي" : "Total", 8, yBot, bh0, 7.2);
  botCenter(isAr ? "لائق" : "Fit", 9, yBot, bh0, 7.2);
  botCenter(isAr ? "غير لائق" : "Unfit", 10, yBot, bh0, 6.8);
  txt(isAr ? "صلاحية الطائرات" : "Aircraft Serviceability", cx(botX[11], botCols[11] + botCols[12]), yBot + bh0 / 2, { pt: 6.9 });
  botCenter(isAr ? "إجمالي الساعات" : "Total Hours", 13, yBot, bh0, 7.0);

  const yB1 = yBot + bh0;
  botCenter(isAr ? translateOfficerToArabic(schedule.operationsOfficer) : schedule.operationsOfficer || "", 0, yB1, bh1 + bh2, 7.6);
  botCenter(isAr ? translateOfficerToArabic(schedule.monitoringOfficer) : schedule.monitoringOfficer || "", 1, yB1, bh1 + bh2, 7.6);
  botCenter("Wind (D/KTS)", 3, yB1, bh1, 6.5, "#000000", false);
  botCenter(w0.wind || "", 4, yB1, bh1, 6.0, "#000000", false);
  botCenter(w1.wind || "", 5, yB1, bh1, 5.8, "#000000", false);
  botCenter(w2.wind || "", 6, yB1, bh1, 5.8, "#000000", false);
  botCenter(isAr ? "مدرسين" : "Instructors", 7, yB1, bh1, 7.0);
  botCenter(String(instructors.length), 8, yB1, bh1, 7.2, "#000000", false);
  botCenter(String(fitInstructors), 9, yB1, bh1, 7.2, "#000000", false);
  botCenter(String(instructors.length - fitInstructors), 10, yB1, bh1, 7.2, "#000000", false);
  botCenter(isAr ? "صالح" : "Serviceable", 11, yB1, bh1, 6.8);
  botCenter(isAr ? "غير صالح" : "Unserviceable", 12, yB1, bh1, 6.5);
  txt(isAr ? "منفرد + مزدوج" : "Solo + Dual", cx(botX[13], botCols[13]), yB1 + bh1 / 2, {
    pt: 6.8,
    color: "#C00000",
  });

  const yB2 = yB1 + bh1;
  botCenter(schedule.exams ? `Exams: ${schedule.exams}` : "Exams", 2, yB2, bh2, 7.0, "#000000", false);
  botCenter("TEMP (°C)", 3, yB2, bh2, 6.5, "#000000", false);
  botCenter(w0.temp || "", 4, yB2, bh2, 7.2, "#000000", false);
  botCenter(w1.temp || "", 5, yB2, bh2, 7.2, "#000000", false);
  botCenter(w2.temp || "", 6, yB2, bh2, 7.2, "#000000", false);
  botCenter(isAr ? "طلبة" : "Students", 7, yB2, bh2, 7.0);
  botCenter(String(students.length), 8, yB2, bh2, 7.2, "#000000", false);
  botCenter(String(fitStudents), 9, yB2, bh2, 7.2, "#000000", false);
  botCenter(String(students.length - fitStudents), 10, yB2, bh2, 7.2, "#000000", false);
  botCenter(String(svcAircraft), 11, yB2, bh2, 7.2, "#000000", false);
  botCenter(String(unsvcAircraft), 12, yB2, bh2, 7.2, "#000000", false);
  botCenter(formatMinutes(totals.grandTotalMin, "0:00"), 13, yB2, bh2, 7.6, "#000000", false);

  for (let c = 1; c <= 13; c++) {
    const startY = c === 12 ? yB1 : yBot;
    line(edgeX(botX[c]), startY, edgeX(botX[c]), yBot + botH, "#000000", 0.22);
  }
  line(edgeX(botX[0]), yB1, edgeX(botX[2]), yB1, "#000000", 0.22);
  line(edgeX(botX[3]), yB1, edgeX(botX[14]), yB1, "#000000", 0.22);
  line(edgeX(botX[2]), yB2, edgeX(botX[14]), yB2, "#000000", 0.22);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 0.6 * S;
  ctx.strokeRect(bx(botX[0], botX[14] - botX[0]) * S, yBot * S, (botX[14] - botX[0]) * S, botH * S);

  txt(isAr ? "مدير العمليات" : "Operations Manager", isAr ? 6 : 291, yBot + 5.8, {
    pt: 8.8,
    align: isAr ? "left" : "right",
  });
  const mgrName = isAr
    ? translateOfficerToArabic(schedule.operationsManager) || "ك/ ............"
    : schedule.operationsManager || "Capt. _____________";
  txt(`${isAr ? "\u200Fالتوقيع:" : "Signature:"} ${mgrName}`, isAr ? 6 : 291, yBot + 11.8, {
    pt: 8.8,
    align: isAr ? "left" : "right",
  });

  return canvas;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [hdr, b64] = dataUrl.split(",");
  const mimeMatch = hdr.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function exportScheduleToImage(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  lang: ExportLang = "EN",
  style: ExportStyle = "modern",
  groupName?: string,
  showInspectionHours = true
): Promise<void> {
  const canvas =
    style === "modern"
      ? await renderModernScheduleCanvas(
          schedule,
          instructors,
          students,
          aircraft,
          lang,
          groupName,
          undefined,
          showInspectionHours
        )
      : await renderClassicScheduleCanvas(schedule, instructors, students, aircraft, lang);

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else resolve(dataUrlToBlob(canvas.toDataURL("image/png")));
    }, "image/png");
  });

  const tag = style === "modern" ? "Modern" : "Classic";
  saveAs(blob, `MFC_Daily_Flight_Schedule_${schedule.date}_${lang}_${tag}.png`);
}
