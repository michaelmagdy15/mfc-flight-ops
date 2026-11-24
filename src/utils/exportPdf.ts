import { jsPDF } from "jspdf";
import { Aircraft, DaySchedule, ExportLang, ExportStyle, Instructor, Student } from "../types";
import { translateOfficerToArabic } from "../data/seedData";
import {
  calcAircraftHours,
  calcScheduleTotals,
  formatMinutes,
  formatScheduleTitleDate,
  formatSortieDisplay,
} from "./calculations";
import {
  fetchLogoDataUrl,
  renderClassicScheduleCanvas,
  renderModernScheduleCanvas,
} from "./renderScheduleCanvas";

const RED: [number, number, number] = [192, 0, 0];
const BLACK: [number, number, number] = [0, 0, 0];
const BLUE_BAND: [number, number, number] = [189, 215, 238];

// unused import guard for translateOfficerToArabic when not using inline buildArabicPdfDoc: keep used via Classic/EN compatibility or omit if unused
void translateOfficerToArabic;

function fitTextSingleLine(doc: jsPDF, text: string, maxWidthMm: number): string {
  if (!text) return "";
  if (doc.getTextWidth(text) <= maxWidthMm) return text;
  let truncated = text;
  while (truncated.length > 1 && doc.getTextWidth(truncated + "…") > maxWidthMm) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "…";
}

export function buildSchedulePdfDoc(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  logoDataUrl: string | null
): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const totals = calcScheduleTotals(schedule, aircraft);
  const stuMap = new Map(students.map((s) => [s.id, s]));
  const fitInstructors = instructors.filter((i) => i.fit).length;
  const unfitInstructors = instructors.length - fitInstructors;
  const fitStudents = students.filter((s) => s.fit).length;
  const unfitStudents = students.length - fitStudents;
  const physicalAircraft = aircraft.filter((a) => a.registration.toUpperCase() !== "EXTRA");
  const svcAircraft = physicalAircraft.filter((a) => a.serviceable).length;
  const unsvcAircraft = physicalAircraft.length - svcAircraft;

  const x0 = 6.0;
  const W = 285.0;
  const xEnd = x0 + W; // 291.0

  // =========================================================================
  // A. TOP HEADER (y = 5 .. 19)
  // =========================================================================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...BLACK);
  doc.text("Ministry of Civil Aviation", x0, 8.2);
  doc.text("Egyptian Aviation Academy", x0, 12.2);
  doc.text("Misr Flying College", x0, 16.2);

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", 148.5 - 35.0, 5.2, 70.0, 12.87);
  } else {
    doc.setFontSize(11);
    doc.setTextColor(27, 54, 93);
    doc.text("EGYPTIAN AVIATION ACADEMY", 148.5, 11.5, { align: "center" });
    doc.setFontSize(9.5);
    doc.text("Misr Flying College", 148.5, 15.8, { align: "center" });
  }

  doc.setFontSize(9.5);
  doc.setTextColor(...BLACK);
  doc.text("Mission Commander", xEnd, 9.2, { align: "right" });
  doc.text(`Signature: ${schedule.missionCommander || "Capt. _____________"}`, xEnd, 14.0, {
    align: "right",
  });

  // =========================================================================
  // B. TITLE (y = 22.8)
  // =========================================================================
  const titleStr = `${schedule.airport || "Assiut Airport"} Daily Flight Schedule — ${formatScheduleTitleDate(schedule.date)} (${schedule.issueLabel || "DAY ISSUE"})`;
  doc.setFontSize(10.5);
  doc.text(titleStr, 148.5, 22.6, { align: "center" });
  const titleW = doc.getTextWidth(titleStr);
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.line(148.5 - titleW / 2, 23.3, 148.5 + titleW / 2, 23.3);

  // =========================================================================
  // C. MAIN SCHEDULE TABLE (y = 25.0 .. 176.4)
  // =========================================================================
  const yTbl = 25.0;
  const colPilot = 20.5;
  const colStudent = 27.5;
  const colAircraft = 13.0;
  const colSlot = 20.4;
  const colSolo = 10.0;
  const colDual = 10.0;

  const xPilot = x0;
  const xStudent = xPilot + colPilot;
  const xAircraft = xStudent + colStudent;
  const xTime = xAircraft + colAircraft;
  const xSolo = xTime + 10 * colSlot;
  const xDual = xSolo + colSolo;

  const hHdr0 = 5.2;
  const hHdr1 = 4.8;
  const hHdr2 = 4.4;
  const yHdr1 = yTbl + hHdr0;
  const yHdr2 = yHdr1 + hHdr1;
  const yBody = yHdr2 + hHdr2;

  const displayAircraft: (Aircraft | null)[] = [...aircraft];
  while (displayAircraft.length < 8) displayAircraft.push(null);
  const acCount = displayAircraft.length;
  const standbyH = 5.6;
  const notesH = 13.4;
  const bodyH = 118.0;
  const acRowH = bodyH / acCount;
  const yStandby = yBody + bodyH;
  const yNotes = yStandby + standbyH;
  const yTblEnd = yNotes + notesH;

  doc.setTextColor(...BLACK);
  doc.setFontSize(8.5);
  doc.text("Mission", xPilot + (colPilot + colStudent) / 2, yTbl + 3.6, { align: "center" });
  doc.text("Aircraft", xAircraft + colAircraft / 2, yTbl + (hHdr0 + hHdr1 + hHdr2) / 2 + 1.0, {
    align: "center",
  });
  doc.setFontSize(9.0);
  doc.text("Time From & To", xTime + (10 * colSlot) / 2, yTbl + 3.6, { align: "center" });
  doc.setFontSize(8.0);
  doc.text("Flight", xSolo + (colSolo + colDual) / 2, yTbl + 3.8, { align: "center" });
  doc.text("Hours", xSolo + (colSolo + colDual) / 2, yTbl + 7.2, { align: "center" });

  doc.setFontSize(8.2);
  doc.text("Pilot", xPilot + colPilot / 2, yHdr1 + (hHdr1 + hHdr2) / 2 + 1.0, { align: "center" });
  doc.text("Student", xStudent + colStudent / 2, yHdr1 + (hHdr1 + hHdr2) / 2 + 1.0, {
    align: "center",
  });

  for (let sIdx = 0; sIdx < 10; sIdx++) {
    const sx = xTime + sIdx * colSlot;
    const tLabel = schedule.timeSlots[sIdx] || "";
    doc.setFontSize(7.8);
    doc.setTextColor(...BLACK);
    if (tLabel) doc.text(tLabel, sx + 1.2, yHdr1 + 3.4);

    doc.setFontSize(6.2);
    const qW = colSlot / 4;
    (["00", "15", "30", "45"] as const).forEach((qTxt, qIdx) => {
      doc.text(qTxt, sx + qIdx * qW + qW / 2, yHdr2 + 3.1, { align: "center" });
    });
  }

  doc.setFontSize(7.8);
  doc.setTextColor(...RED);
  doc.text("Solo", xSolo + colSolo / 2, yHdr2 + 3.1, { align: "center" });
  doc.setTextColor(...BLACK);
  doc.text("Dual", xDual + colDual / 2, yHdr2 + 3.1, { align: "center" });

  displayAircraft.forEach((ac, acIdx) => {
    const ry = yBody + acIdx * acRowH;
    const isBand = acIdx % 2 === 0;
    if (isBand) {
      doc.setFillColor(...BLUE_BAND);
      doc.rect(xTime, ry, 10 * colSlot, acRowH, "F");
    }

    doc.setTextColor(...BLACK);
    doc.setFontSize(8.8);
    if (ac?.registration) {
      const parts = ac.registration.includes("-")
        ? [ac.registration.split("-")[0] + "-", ac.registration.split("-").slice(1).join("-")]
        : [ac.registration];
      if (parts.length === 2) {
        doc.text(parts[0], xAircraft + colAircraft / 2, ry + acRowH / 2 - 0.6, { align: "center" });
        doc.text(parts[1], xAircraft + colAircraft / 2, ry + acRowH / 2 + 2.8, { align: "center" });
      } else {
        doc.text(parts[0], xAircraft + colAircraft / 2, ry + acRowH / 2 + 1.0, { align: "center" });
      }
    }

    for (let sIdx = 0; sIdx < 10; sIdx++) {
      const sortie = ac ? schedule.grid[ac.id]?.[sIdx] : undefined;
      if (!sortie) continue;
      const disp = formatSortieDisplay(sortie, instructors, students, "EN");
      const sx = xTime + sIdx * colSlot;
      const clr = sortie.type === "SOLO" ? RED : BLACK;
      doc.setTextColor(...clr);
      doc.setFontSize(6.4);
      doc.text(fitTextSingleLine(doc, disp.topLine, colSlot - 0.6), sx + colSlot / 2, ry + acRowH / 2 - 1.2, {
        align: "center",
      });
      doc.setFontSize(6.8);
      doc.text(fitTextSingleLine(doc, disp.bottomLine, colSlot - 0.6), sx + colSlot / 2, ry + acRowH / 2 + 2.9, {
        align: "center",
      });
    }

    const hours = ac ? calcAircraftHours(ac.id, schedule.grid) : { soloMin: 0, dualMin: 0 };
    doc.setFontSize(8.4);
    doc.setTextColor(...RED);
    doc.text(ac ? formatMinutes(hours.soloMin, "-") : "-", xSolo + colSolo / 2, ry + acRowH / 2 + 1.0, {
      align: "center",
    });
    doc.setTextColor(...BLACK);
    doc.text(ac ? formatMinutes(hours.dualMin, "-") : "-", xDual + colDual / 2, ry + acRowH / 2 + 1.0, {
      align: "center",
    });
  });

  doc.setFillColor(...BLUE_BAND);
  doc.rect(xTime, yStandby, 10 * colSlot, standbyH, "F");
  doc.setFontSize(7.6);
  doc.setTextColor(...BLACK);
  doc.text("Standby", xAircraft + colAircraft / 2, yStandby + standbyH / 2 + 0.9, { align: "center" });

  for (let sIdx = 0; sIdx < 10; sIdx++) {
    const sb = schedule.standby[sIdx];
    if (!sb) continue;
    const sbName = stuMap.get(sb.studentId)?.name || "";
    if (!sbName) continue;
    const sx = xTime + sIdx * colSlot;
    doc.setFontSize(7.2);
    doc.setTextColor(...(sb.highlight ? RED : BLACK));
    doc.text(fitTextSingleLine(doc, sbName, colSlot - 0.8), sx + colSlot / 2, yStandby + standbyH / 2 + 0.9, {
      align: "center",
    });
  }
  doc.setFontSize(7.2);
  doc.setTextColor(...RED);
  doc.text("-", xSolo + colSolo / 2, yStandby + standbyH / 2 + 0.9, { align: "center" });
  doc.setTextColor(...BLACK);
  doc.text("-", xDual + colDual / 2, yStandby + standbyH / 2 + 0.9, { align: "center" });

  doc.setTextColor(...BLACK);
  doc.setFontSize(5.3);
  instructors.forEach((inst, idx) => {
    const py = yBody + 4.2 + idx * 4.2;
    if (py < yTblEnd - 2) {
      doc.text(fitTextSingleLine(doc, inst.name, colPilot - 1.0), xPilot + 0.6, py);
    }
  });

  const ircpl = students.filter((s) => s.program === "IRCPL");
  const ppl = students.filter((s) => s.program === "PPL");
  const showProgramHeaders = ircpl.length > 0;
  const totalLines = students.length + (showProgramHeaders ? 2 : 0);
  const lineH = Math.min(3.85, (bodyH + standbyH + notesH - 3.5) / Math.max(totalLines, 1));
  const stuFont = totalLines > 34 ? 5.6 : 6.4;
  let sy = yBody + 3.4;

  if (showProgramHeaders) {
    doc.setFontSize(7.0);
    doc.setTextColor(...RED);
    doc.text("IRCPL", xStudent + colStudent / 2, sy, { align: "center" });
    sy += lineH;

    doc.setFontSize(stuFont);
    ircpl.forEach((stu, i) => {
      if (sy < yTblEnd - 1.2) {
        doc.text(fitTextSingleLine(doc, `${i + 1}. ${stu.name}`, colStudent - 2.0), xStudent + 1.0, sy);
      }
      sy += lineH;
    });

    sy += 0.6;
    doc.setFontSize(7.0);
    doc.setTextColor(...BLACK);
    if (sy < yTblEnd - 1.2) doc.text("PPL", xStudent + colStudent / 2, sy, { align: "center" });
    sy += lineH;
  }

  doc.setFontSize(stuFont);
  doc.setTextColor(...BLACK);
  ppl.forEach((stu, i) => {
    if (sy < yTblEnd - 1.2) {
      doc.text(
        fitTextSingleLine(doc, `${ircpl.length + i + 1}. ${stu.name}`, colStudent - 2.0),
        xStudent + 1.0,
        sy
      );
    }
    sy += lineH;
  });

  doc.setTextColor(...BLACK);
  doc.setFontSize(8.2);
  doc.text("Notes", xAircraft + colAircraft / 2, yNotes + notesH / 2 + 1.0, { align: "center" });

  doc.setFontSize(7.0);
  const noteCenter = xTime + (10 * colSlot) / 2;
  schedule.notes.slice(0, 3).forEach((n, idx) => {
    const ny = yNotes + 4.1 + idx * 3.8;
    const textFit = fitTextSingleLine(doc, n.text, 10 * colSlot - 4.0);
    doc.setTextColor(...(n.highlight ? RED : BLACK));
    doc.text(textFit, noteCenter, ny, { align: "center" });
    if (n.highlight) {
      const nw = doc.getTextWidth(textFit);
      doc.setDrawColor(...RED);
      doc.setLineWidth(0.22);
      doc.line(noteCenter - nw / 2, ny + 0.5, noteCenter + nw / 2, ny + 0.5);
    }
  });

  const yTotSplit = yNotes + 4.8;
  doc.setTextColor(...BLACK);
  doc.setFontSize(7.4);
  doc.text("Total Hours", xSolo + (colSolo + colDual) / 2, yNotes + 3.4, { align: "center" });
  doc.setFontSize(7.8);
  doc.setTextColor(...RED);
  doc.text(formatMinutes(totals.totalSoloMin, "0:00"), xSolo + colSolo / 2, yTotSplit + 5.4, {
    align: "center",
  });
  doc.setTextColor(...BLACK);
  doc.text(formatMinutes(totals.totalDualMin, "0:00"), xDual + colDual / 2, yTotSplit + 5.4, {
    align: "center",
  });

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.32);
  doc.line(xStudent, yHdr1, xStudent, yTblEnd);
  doc.line(xAircraft, yTbl, xAircraft, yTblEnd);
  doc.line(xTime, yTbl, xTime, yTblEnd);
  doc.line(xSolo, yTbl, xSolo, yTblEnd);

  doc.line(xPilot, yHdr1, xAircraft, yHdr1);
  doc.line(xTime, yHdr1, xSolo, yHdr1);
  doc.line(xTime, yHdr2, xEnd, yHdr2);
  doc.line(xPilot, yBody, xEnd, yBody);

  doc.setLineWidth(0.18);
  for (let sIdx = 0; sIdx < 10; sIdx++) {
    const sx = xTime + sIdx * colSlot;
    if (sIdx > 0) doc.line(sx, yHdr1, sx, yBody);
    const qW = colSlot / 4;
    for (let q = 1; q < 4; q++) {
      doc.line(sx + q * qW, yHdr2, sx + q * qW, yBody);
    }
  }

  doc.setDrawColor(80, 90, 105);
  doc.setLineWidth(0.18);
  for (let sIdx = 1; sIdx < 10; sIdx++) {
    const sx = xTime + sIdx * colSlot;
    doc.line(sx, yBody, sx, yNotes);
  }

  doc.setDrawColor(140, 155, 170);
  doc.setLineWidth(0.12);
  for (let acIdx = 0; acIdx < acCount; acIdx++) {
    const midY = yBody + acIdx * acRowH + acRowH / 2;
    doc.line(xTime, midY, xSolo, midY);
  }

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.30);
  for (let acIdx = 1; acIdx < acCount; acIdx++) {
    const ry = yBody + acIdx * acRowH;
    doc.line(xAircraft, ry, xEnd, ry);
  }
  doc.line(xAircraft, yStandby, xEnd, yStandby);
  doc.line(xAircraft, yNotes, xEnd, yNotes);
  doc.setLineWidth(0.18);
  doc.line(xSolo, yTotSplit, xEnd, yTotSplit);

  doc.setDrawColor(...RED);
  doc.setLineWidth(0.35);
  doc.line(xDual, yHdr2, xDual, yNotes);
  doc.line(xDual, yTotSplit, xDual, yTblEnd);

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.6);
  doc.rect(x0, yTbl, W, yTblEnd - yTbl);

  // =========================================================================
  // D. BOTTOM SUMMARY TABLE
  // =========================================================================
  const yBot = 180.0;
  const bh0 = 5.4;
  const bh1 = 7.2;
  const bh2 = 5.4;
  const botH = bh0 + bh1 + bh2;

  const botCols = [21.5, 21.5, 24.0, 19.0, 12.5, 14.5, 14.5, 19.0, 11.0, 10.0, 10.0, 17.5, 18.5, 21.5];
  const botX: number[] = [x0];
  botCols.forEach((w) => botX.push(botX[botX.length - 1] + w));
  const botBoxW = botX[14] - x0;

  const w0 = schedule.weather[0] || { time: "9 AM", wind: "", temp: "" };
  const w1 = schedule.weather[1] || { time: "12 PM", wind: "", temp: "" };
  const w2 = schedule.weather[2] || { time: "3 PM", wind: "", temp: "" };

  const centerText = (txt: string, colIdx: number, rowY: number, rowH: number, size = 7.2, clr = BLACK) => {
    if (!txt) return;
    doc.setFontSize(size);
    doc.setTextColor(...clr);
    const cx = botX[colIdx] + botCols[colIdx] / 2;
    const lines = txt.split("\n");
    if (lines.length === 1) {
      doc.text(fitTextSingleLine(doc, lines[0], botCols[colIdx] - 1.5), cx, rowY + rowH / 2 + 1.0, {
        align: "center",
      });
    } else {
      doc.text(fitTextSingleLine(doc, lines[0], botCols[colIdx] - 1.5), cx, rowY + rowH / 2 - 0.6, {
        align: "center",
      });
      doc.text(fitTextSingleLine(doc, lines[1], botCols[colIdx] - 1.5), cx, rowY + rowH / 2 + 2.4, {
        align: "center",
      });
    }
  };

  centerText("Operations", 0, yBot, bh0, 7.4);
  centerText("Monitoring", 1, yBot, bh0, 7.4);
  centerText(
    schedule.massBriefing ? `Mass Briefing\n${schedule.massBriefing}` : "Mass Briefing",
    2,
    yBot,
    bh0 + bh1,
    7.4
  );
  centerText("W. Forecast", 3, yBot, bh0, 7.2);
  centerText(w0.time || "9 AM", 4, yBot, bh0, 7.2);
  centerText(w1.time || "12 PM", 5, yBot, bh0, 7.2);
  centerText(w2.time || "3 PM", 6, yBot, bh0, 7.2);
  centerText("Fitness", 7, yBot, bh0, 7.2);
  centerText("Total", 8, yBot, bh0, 7.2);
  centerText("Fit", 9, yBot, bh0, 7.2);
  centerText("Unfit", 10, yBot, bh0, 7.2);
  doc.setFontSize(7.1);
  doc.setTextColor(...BLACK);
  doc.text("Aircraft Serviceability", (botX[11] + botX[13]) / 2, yBot + bh0 / 2 + 1.0, {
    align: "center",
  });
  centerText("Total Hours", 13, yBot, bh0, 7.2);

  const yB1 = yBot + bh0;
  centerText(schedule.operationsOfficer || "", 0, yB1, bh1 + bh2, 7.8);
  centerText(schedule.monitoringOfficer || "", 1, yB1, bh1 + bh2, 7.8);
  centerText("Wind (D/KTS)", 3, yB1, bh1, 6.8);
  centerText(w0.wind || "", 4, yB1, bh1, 6.4);
  centerText(w1.wind || "", 5, yB1, bh1, 6.2);
  centerText(w2.wind || "", 6, yB1, bh1, 6.2);
  centerText("Instructors", 7, yB1, bh1, 7.0);
  centerText(String(instructors.length), 8, yB1, bh1, 7.4);
  centerText(String(fitInstructors), 9, yB1, bh1, 7.4);
  centerText(String(unfitInstructors), 10, yB1, bh1, 7.4);
  centerText("Serviceable", 11, yB1, bh1, 6.8);
  centerText("Unserviceable", 12, yB1, bh1, 6.4);

  doc.setFontSize(7.2);
  const sdX = botX[13] + botCols[13] / 2;
  const sdY = yB1 + bh1 / 2 + 1.0;
  const wSolo = doc.getTextWidth("Solo");
  const wDual = doc.getTextWidth("Dual");
  const wPlus = doc.getTextWidth(" + ");
  const sdStart = sdX - (wSolo + wPlus + wDual) / 2;
  doc.setTextColor(...RED);
  doc.text("Solo", sdStart, sdY);
  doc.setTextColor(...BLACK);
  doc.text(" + Dual", sdStart + wSolo, sdY);

  const yB2 = yB1 + bh1;
  centerText(schedule.exams ? `Exams: ${schedule.exams}` : "Exams", 2, yB2, bh2, 7.2);
  centerText("TEMP (°C)", 3, yB2, bh2, 6.8);
  centerText(w0.temp || "", 4, yB2, bh2, 7.4);
  centerText(w1.temp || "", 5, yB2, bh2, 7.4);
  centerText(w2.temp || "", 6, yB2, bh2, 7.4);
  centerText("Students", 7, yB2, bh2, 7.0);
  centerText(String(students.length), 8, yB2, bh2, 7.4);
  centerText(String(fitStudents), 9, yB2, bh2, 7.4);
  centerText(String(unfitStudents), 10, yB2, bh2, 7.4);
  centerText(String(svcAircraft), 11, yB2, bh2, 7.4);
  centerText(String(unsvcAircraft), 12, yB2, bh2, 7.4);
  centerText(formatMinutes(totals.grandTotalMin, "0:00"), 13, yB2, bh2, 7.8);

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.22);
  for (let c = 1; c <= 13; c++) {
    const startY = c === 12 ? yB1 : yBot;
    doc.line(botX[c], startY, botX[c], yBot + botH);
  }
  doc.line(botX[0], yB1, botX[2], yB1);
  doc.line(botX[3], yB1, botX[14], yB1);
  doc.line(botX[2], yB2, botX[14], yB2);

  doc.setLineWidth(0.6);
  doc.rect(x0, yBot, botBoxW, botH);

  doc.setFontSize(8.8);
  doc.setTextColor(...BLACK);
  doc.text("Operations Manager", xEnd, yBot + 6.5, { align: "right" });
  doc.text(`Signature: ${schedule.operationsManager || "Capt. _____________"}`, xEnd, yBot + 12.2, {
    align: "right",
  });

  return doc;
}

async function canvasToA4Pdf(canvas: HTMLCanvasElement): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const dataUrl = canvas.toDataURL("image/png");
  doc.addImage(dataUrl, "PNG", 0, 0, 297, 210);
  return doc;
}

export async function exportScheduleToPdf(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  lang: ExportLang = "EN",
  style: ExportStyle = "modern",
  groupName?: string,
  showInspectionHours = true
): Promise<void> {
  const logoDataUrl = await fetchLogoDataUrl();
  let doc: jsPDF;
  if (style === "modern") {
    const canvas = await renderModernScheduleCanvas(
      schedule,
      instructors,
      students,
      aircraft,
      lang,
      groupName,
      logoDataUrl,
      showInspectionHours
    );
    doc = await canvasToA4Pdf(canvas);
    doc.save(`MFC_Daily_Flight_Schedule_${schedule.date}_${lang}_Modern.pdf`);
    return;
  }

  if (lang === "AR") {
    const canvas = await renderClassicScheduleCanvas(
      schedule,
      instructors,
      students,
      aircraft,
      "AR",
      logoDataUrl
    );
    doc = await canvasToA4Pdf(canvas);
  } else {
    doc = buildSchedulePdfDoc(schedule, instructors, students, aircraft, logoDataUrl);
  }
  doc.save(`MFC_Daily_Flight_Schedule_${schedule.date}_${lang}.pdf`);
}
