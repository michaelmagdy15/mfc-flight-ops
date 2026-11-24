import jsPDF from "jspdf";
import {
  ATC_LIGHT_SIGNALS,
  C172R_NORMAL_ENVELOPE,
  C172_CREW_DESIGNATION_LEGEND,
  C172_QUICK_REF,
  computeC172RWb,
  computeLegMetrics,
  formatDeg3,
  SQUAWK_CODES,
} from "../data/opsReferenceData";
import {
  CommsReferenceData,
  FlightReleaseData,
  IcaoFlightPlanData,
} from "../types";

async function loadLogoDataUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = "/mfc-logo.png";
  });
}

function drawCheckBox(
  pdf: jsPDF,
  x: number,
  y: number,
  size: number,
  checked: boolean
) {
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.25);
  pdf.rect(x, y, size, size);
  if (checked) {
    pdf.setDrawColor(192, 0, 0);
    pdf.setLineWidth(0.42);
    pdf.line(x + 0.5, y + size * 0.52, x + size * 0.4, y + size - 0.5);
    pdf.line(x + size * 0.4, y + size - 0.5, x + size - 0.4, y + 0.5);
  }
  pdf.setDrawColor(15, 23, 42);
}

const LB_IN_TO_KG_MM = 11.521246;
const KG_TO_LB = 2.2046226;

function renderArabicFplHeaderDataUrl(aerodromeText: string): string | null {
  try {
    const scale = 4;
    const w = 260;
    const h = 112;
    const c = document.createElement("canvas");
    c.width = w * scale;
    c.height = h * scale;
    const ctx = c.getContext("2d");
    if (!ctx) return null;

    ctx.scale(scale, scale);
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#1E293B";

    const fontStack = "'Segoe UI', 'Tahoma', 'Arial', sans-serif";
    ctx.font = `600 13.5px ${fontStack}`;
    ctx.fillText("جمهورية مصر العربية", 254, 4);

    ctx.font = `700 13.5px ${fontStack}`;
    ctx.fillText("وزارة الطيران المدني", 254, 25);

    ctx.font = `600 13px ${fontStack}`;
    ctx.fillText("الشركة الوطنية لخدمات الملاحة الجوية", 254, 46);

    // Bottom right Arabic Aerodrome label + dashed line extending left
    ctx.font = `700 13px ${fontStack}`;
    ctx.fillText("مطار", 254, 84);

    ctx.save();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(8, 97);
    ctx.lineTo(222, 97);
    ctx.stroke();
    ctx.restore();

    const ad = (aerodromeText || "").trim();
    if (ad) {
      ctx.save();
      ctx.direction = "ltr";
      ctx.textAlign = "center";
      ctx.fillStyle = "#1B365D";
      ctx.font = `700 12.5px ${fontStack}`;
      ctx.fillText(ad, 115, 81);
      ctx.restore();
    }

    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

function drawCombBox(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  cells: number,
  value: string,
  opts?: { midTallIndex?: number; fontSize?: number }
) {
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.28);
  pdf.rect(x, y, w, h);

  const cellW = w / cells;
  for (let i = 1; i < cells; i++) {
    const cx = x + i * cellW;
    const isMidTall = opts?.midTallIndex === i;
    const tickTop = isMidTall ? y + h * 0.22 : y + h * 0.56;
    pdf.line(cx, tickTop, cx, y + h);
  }

  const chars = (value || "").toUpperCase().slice(0, cells).split("");
  pdf.setFont("courier", "bold");
  pdf.setFontSize(opts?.fontSize ?? 9.2);
  pdf.setTextColor(27, 54, 93);
  chars.forEach((ch, idx) => {
    pdf.text(ch, x + (idx + 0.5) * cellW, y + h - 1.35, { align: "center" });
  });
}

function drawCrossableLetterBox(
  pdf: jsPDF,
  x: number,
  y: number,
  size: number,
  letter: string,
  active: boolean
) {
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.28);
  pdf.rect(x, y, size, size);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.4);
  if (active) {
    pdf.setTextColor(27, 54, 93);
  } else {
    pdf.setTextColor(148, 163, 184);
  }
  pdf.text(letter, x + size / 2, y + size * 0.72, { align: "center" });

  if (!active) {
    pdf.setDrawColor(192, 0, 0);
    pdf.setLineWidth(0.45);
    pdf.line(x + 0.45, y + size - 0.45, x + size - 0.45, y + 0.45);
    pdf.setDrawColor(15, 23, 42);
    pdf.setLineWidth(0.28);
  }
}

function drawRotatedHaloText(
  pdf: jsPDF,
  text: string,
  cx: number,
  cy: number,
  angleDeg: number,
  fontSize: number,
  color: [number, number, number],
  centerOnPoint = true
) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(fontSize);
  const tw = pdf.getTextWidth(text);
  const rad = (angleDeg * Math.PI) / 180;
  const sx = centerOnPoint ? cx - Math.cos(rad) * (tw / 2) : cx;
  const sy = centerOnPoint ? cy + Math.sin(rad) * (tw / 2) : cy;

  // White stroke halo so text remains crisp over dense grids
  pdf.setDrawColor(255, 255, 255);
  pdf.setLineWidth(Math.max(0.85, fontSize * 0.2));
  pdf.text(text, sx, sy, { angle: angleDeg, renderingMode: "stroke" });

  // Solid foreground fill
  pdf.setTextColor(...color);
  pdf.text(text, sx, sy, { angle: angleDeg, renderingMode: "fill" });
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.3);
}

// ============================================================================
// 1. OFFICIAL MFC C172R FLIGHT RELEASE + FIG 6-6 / 6-7 W&B CHARTS
// ============================================================================
export async function exportFlightReleasePdf(data: FlightReleaseData): Promise<void> {
  const logoUrl = await loadLogoDataUrl();
  const wb = computeC172RWb(data);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Outer Double Frame (matches official MFC C172R Flight Release sheet)
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.6);
  pdf.rect(10, 10, 190, 258);
  pdf.setLineWidth(0.25);
  pdf.rect(11, 11, 188, 256);

  // Header Band (y = 11..34)
  if (logoUrl) {
    pdf.addImage(logoUrl, "PNG", 17, 13.5, 36, 9);
  }
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(27, 54, 93);
  pdf.setFontSize(6.2);
  pdf.text("EGYPTIAN AVIATION ACADEMY", 35, 25.5, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.text("Misr Flying College", 35, 28.5, { align: "center" });

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(10.5);
  pdf.text(data.aircraftModel || "C172R", 105, 17, { align: "center" });
  pdf.setFontSize(11.5);
  pdf.text("FLIGHT RELEASE", 105, 22.8, { align: "center" });
  pdf.setFontSize(11);
  pdf.setTextColor(27, 54, 93);
  pdf.text(data.aircraftReg || "SU-___", 105, 28.8, { align: "center" });

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(9.5);
  pdf.text("MFC", 172, 16.5, { align: "center" });
  pdf.setFontSize(8.2);
  pdf.text("OPERATIONS DEPT.", 172, 22, { align: "center" });
  pdf.text("FLIGHT OPERATION", 172, 27, { align: "center" });

  // Top Metadata Grid (y = 33..49)
  const x0 = 11;
  const xCrewEnd = 74;
  const xDateEnd = 113;
  const xLessEnd = 152;
  const xEnd = 199;
  const yMetaTop = 33;
  const yMetaMid = 41;
  const yMetaBot = 49;

  pdf.setLineWidth(0.3);
  pdf.setDrawColor(15, 23, 42);
  pdf.rect(x0, yMetaTop, xEnd - x0, yMetaBot - yMetaTop);
  pdf.line(xCrewEnd, yMetaTop, xCrewEnd, yMetaBot);
  pdf.line(xDateEnd, yMetaTop, xDateEnd, yMetaBot);
  pdf.line(xLessEnd, yMetaTop, xLessEnd, yMetaBot);
  pdf.line(xCrewEnd, yMetaMid, xEnd, yMetaMid);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.2);
  pdf.text("NAME AND DESIGNATION OF EACH", (x0 + xCrewEnd) / 2, 39.5, { align: "center" });
  pdf.text("FLIGHT CREWMEMBER", (x0 + xCrewEnd) / 2, 44, { align: "center" });

  pdf.setFontSize(7.2);
  pdf.text(`DATE :  ${data.date || "__/__/____"}`, xCrewEnd + 1.8, 38);
  pdf.text(`FLT. LESSON No : ${data.lessonNo || ""}`, xDateEnd + 1.8, 38);
  pdf.setFontSize(6.5);
  pdf.text(`FLT: ${data.fltCategory} (LCL/XC/INST/SIM)`, xLessEnd + 1.5, 38);

  pdf.setFontSize(7.2);
  pdf.text(`UTC :  ${data.utcTime || "__:__"}`, xCrewEnd + 1.8, 46);

  drawCheckBox(pdf, xDateEnd + 12, 43.2, 3.0, data.isDual);
  pdf.text("DUAL", xDateEnd + 2.2, 45.8);
  drawCheckBox(pdf, xDateEnd + 31.5, 43.2, 3.0, data.isSolo);
  pdf.text("SOLO", xDateEnd + 21.5, 45.8);

  pdf.setFontSize(6.8);
  pdf.text("NT", xLessEnd + 2, 45.8);
  drawCheckBox(pdf, xLessEnd + 7, 43.2, 2.8, data.isNight);
  pdf.text("IFR", xLessEnd + 15.5, 45.8);
  drawCheckBox(pdf, xLessEnd + 21.5, 43.2, 2.8, data.isIfr);
  pdf.text("VFR", xLessEnd + 29.5, 45.8);
  drawCheckBox(pdf, xLessEnd + 36.5, 43.2, 2.8, data.isVfr);

  // Crew 4 Rows (y = 49..77)
  const crewRowH = 7;
  const xDesigEnd = 90;
  const xLicEnd = 148;
  for (let i = 0; i < 4; i++) {
    const ry = yMetaBot + i * crewRowH;
    const row = data.crew[i] || { name: "", designation: "", licenceNo: "", expDate: "" };
    pdf.setLineWidth(0.25);
    pdf.rect(x0, ry, xEnd - x0, crewRowH);
    pdf.line(xCrewEnd, ry, xCrewEnd, ry + crewRowH);
    pdf.line(xDesigEnd, ry, xDesigEnd, ry + crewRowH);
    pdf.line(xLicEnd, ry, xLicEnd, ry + crewRowH);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.0);
    pdf.setTextColor(71, 85, 105);
    pdf.text("NAME :", x0 + 1.8, ry + 4.7);
    pdf.setTextColor(15, 23, 42);
    pdf.text((row.name || "").slice(0, 26), x0 + 12.5, ry + 4.7);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.8);
    pdf.text(`(${row.designation || " , "})*`, (xCrewEnd + xDesigEnd) / 2, ry + 4.7, {
      align: "center",
    });

    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(71, 85, 105);
    pdf.text("LICENCE No :", xDesigEnd + 1.5, ry + 4.7);
    pdf.setTextColor(15, 23, 42);
    pdf.text((row.licenceNo || "").slice(0, 18), xDesigEnd + 19.5, ry + 4.7);

    pdf.setTextColor(71, 85, 105);
    pdf.text("EXP. DATE :", xLicEnd + 1.5, ry + 4.7);
    pdf.setTextColor(15, 23, 42);
    pdf.text((row.expDate || "").slice(0, 14), xLicEnd + 17.5, ry + 4.7);
  }

  // DEP.AD / ARR.AD / ALT.AD + WX CONDITIONS (y = 77..99)
  const yAdTop = 77;
  const yAdBot = 99;
  const xAdEnd = 74;
  pdf.rect(x0, yAdTop, xAdEnd - x0, yAdBot - yAdTop);
  const adColW = (xAdEnd - x0) / 3;
  pdf.line(x0 + adColW, yAdTop, x0 + adColW, yAdBot);
  pdf.line(x0 + 2 * adColW, yAdTop, x0 + 2 * adColW, yAdBot);
  pdf.line(x0, yAdTop + 8.5, xAdEnd, yAdTop + 8.5);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text("DEP.AD", x0 + adColW / 2, yAdTop + 5.7, { align: "center" });
  pdf.text("ARR.AD", x0 + 1.5 * adColW, yAdTop + 5.7, { align: "center" });
  pdf.text("ALT.AD", x0 + 2.5 * adColW, yAdTop + 5.7, { align: "center" });

  pdf.setFontSize(9.5);
  pdf.setTextColor(27, 54, 93);
  pdf.text(data.depAd || "HEAT", x0 + adColW / 2, yAdTop + 16.8, { align: "center" });
  pdf.text(data.arrAd || "HEAT", x0 + 1.5 * adColW, yAdTop + 16.8, { align: "center" });
  pdf.text(data.altAd || "HESG", x0 + 2.5 * adColW, yAdTop + 16.8, { align: "center" });

  // WX CONDITIONS right side
  pdf.setTextColor(15, 23, 42);
  pdf.rect(xAdEnd, yAdTop, xEnd - xAdEnd, yAdBot - yAdTop);
  pdf.line(xAdEnd, yAdTop + 5.5, xEnd, yAdTop + 5.5);
  pdf.setFontSize(7.8);
  pdf.text("WX CONDITIONS", (xAdEnd + xEnd) / 2, yAdTop + 4, { align: "center" });

  const wxMidX = (xAdEnd + xEnd) / 2;
  pdf.line(wxMidX, yAdTop + 5.5, wxMidX, yAdBot);
  const wxRowH = (yAdBot - (yAdTop + 5.5)) / 3;
  pdf.line(xAdEnd, yAdTop + 5.5 + wxRowH, xEnd, yAdTop + 5.5 + wxRowH);
  pdf.line(xAdEnd, yAdTop + 5.5 + 2 * wxRowH, xEnd, yAdTop + 5.5 + 2 * wxRowH);

  const drawWxField = (lbl: string, val: string, x: number, y: number) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(71, 85, 105);
    pdf.text(lbl, x + 1.8, y);
    pdf.setTextColor(15, 23, 42);
    pdf.text((val || "").slice(0, 24), x + 13.5, y);
  };
  drawWxField("WIND :", data.wxWind, xAdEnd, yAdTop + 9.4);
  drawWxField("RWY :", data.wxRwy, wxMidX, yAdTop + 9.4);
  drawWxField("TEMP :", data.wxTemp, xAdEnd, yAdTop + 14.9);
  drawWxField("DP :", data.wxDp, wxMidX, yAdTop + 14.9);
  drawWxField("QNH :", data.wxQnh, xAdEnd, yAdTop + 20.4);
  drawWxField("VIS :", data.wxVis, wxMidX, yAdTop + 20.4);

  // DOCUMENTS Strip (y = 99..121)
  const yDocTop = 99;
  const yDocHdr = 104.5;
  const docRowH = 5.5;
  pdf.rect(x0, yDocTop, xEnd - x0, 22);
  pdf.line(x0, yDocHdr, xEnd, yDocHdr);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.8);
  pdf.text("DOCUMENTS", 105, yDocTop + 4, { align: "center" });

  const docsRows = [
    { lbl: "NOTAM:", val: data.notam },
    { lbl: "TAF:", val: data.taf },
    { lbl: "METAR:", val: data.metar },
  ];
  docsRows.forEach((dr, idx) => {
    const ry = yDocHdr + idx * docRowH;
    if (idx > 0) pdf.line(x0, ry, xEnd, ry);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    pdf.setTextColor(71, 85, 105);
    pdf.text(dr.lbl, x0 + 1.8, ry + 4);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(15, 23, 42);
    pdf.text((dr.val || "").slice(0, 105), x0 + 15.5, ry + 4);
  });

  // WEIGHT AND BALANCE FOR C172R (y = 121..244)
  const yWbTitle = 121;
  const yWbHdr1 = 126.5;
  const yWbHdr2 = 132.5;
  const yWbHdr3 = 140;
  const xItemEnd = 90;
  const xSampleW = 117.25;
  const xSampleM = 144.5;
  const xYourW = 171.75;

  pdf.setFillColor(241, 245, 249);
  pdf.rect(x0, yWbTitle, xEnd - x0, 5.5, "F");
  pdf.rect(x0, yWbTitle, xEnd - x0, 5.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.2);
  pdf.setTextColor(27, 54, 93);
  pdf.text("WEIGHT AND BALANCE FOR C172R", 105, yWbTitle + 4, { align: "center" });

  pdf.setTextColor(15, 23, 42);
  pdf.rect(x0, yWbHdr1, xEnd - x0, yWbHdr3 - yWbHdr1);
  pdf.line(xItemEnd, yWbHdr1, xItemEnd, yWbHdr3);
  pdf.line(xItemEnd, yWbHdr2, xEnd, yWbHdr2);
  pdf.line(xSampleM, yWbHdr2, xSampleM, yWbHdr3);

  pdf.setFontSize(8.0);
  pdf.text("ITEM DESCRIPTION", (x0 + xItemEnd) / 2, yWbHdr1 + 8.2, { align: "center" });
  pdf.text("WEIGHT AND MOMENT TABULATION", (xItemEnd + xEnd) / 2, yWbHdr1 + 4.3, {
    align: "center",
  });
  pdf.setFontSize(7.4);
  pdf.text("SAMPLE AIRPLANE", (xItemEnd + xSampleM) / 2, yWbHdr2 + 4.5, { align: "center" });
  pdf.text("YOUR AIRPLANE", (xSampleM + xEnd) / 2, yWbHdr2 + 4.5, { align: "center" });

  // Sub-sub-headers row
  const ySubHdr = 140;
  const ySubBot = 147;
  pdf.rect(x0, ySubHdr, xEnd - x0, ySubBot - ySubHdr);
  pdf.line(xItemEnd, ySubHdr, xItemEnd, ySubBot);
  pdf.line(xSampleW, ySubHdr, xSampleW, ySubBot);
  pdf.line(xSampleM, ySubHdr, xSampleM, ySubBot);
  pdf.line(xYourW, ySubHdr, xYourW, ySubBot);

  pdf.setFontSize(6.6);
  pdf.text("Weight (lbs)", (xItemEnd + xSampleW) / 2, ySubHdr + 4.6, { align: "center" });
  pdf.text("Moment (lb-ins/1000)", (xSampleW + xSampleM) / 2, ySubHdr + 4.6, { align: "center" });
  pdf.text("Weight (lbs)", (xSampleM + xYourW) / 2, ySubHdr + 4.6, { align: "center" });
  pdf.text("Moment (lb-ins/1000)", (xYourW + xEnd) / 2, ySubHdr + 4.6, { align: "center" });

  const wbRows: Array<{
    lines: string[];
    h: number;
    sw: string;
    sm: string;
    yw: string;
    ym: string;
    bold?: boolean;
    shade?: boolean;
    status?: string;
  }> = [
    {
      lines: [
        "1- Basic Empty Weight",
        wb.bewArmIn > 0
          ? `   Arm: ${wb.bewArmIn.toFixed(3)}" | Weighed: ${data.weighingDate || "-"} (Due: ${
              data.weighingDueDate || "-"
            })`
          : "   (Includes unusable fuel & full oil)",
      ],
      h: 11,
      sw: "1639",
      sm: "64.4",
      yw: String(wb.bewLb),
      ym: wb.bewMom.toFixed(1),
    },
    {
      lines: [
        "2- Usable Fuel (At 6 Lbs / Gal).",
        "   -Standard Fuel – 53 Gal Max / -Reduced – 35 Gal",
      ],
      h: 12.5,
      sw: "210",
      sm: "10.1",
      yw: `${wb.fuelLb.toFixed(0)} (${wb.fuelGal}g)`,
      ym: wb.fuelMom.toFixed(1),
    },
    {
      lines: ["3- Pilot and Front Passenger (FS 34 to 46)"],
      h: 9,
      sw: "340",
      sm: "12.6",
      yw: wb.frontPaxLb.toFixed(0),
      ym: wb.frontPaxMom.toFixed(1),
    },
    {
      lines: ["4- Rear Passenger (FS 73)"],
      h: 8.5,
      sw: "220",
      sm: "16.0",
      yw: wb.rearPaxLb.toFixed(0),
      ym: wb.rearPaxMom.toFixed(1),
    },
    {
      lines: ["5- *Baggage \"A\" (FS 82 to 108) 120 Lbs Max"],
      h: 9.5,
      sw: "48",
      sm: "4.6",
      yw: wb.bagALb.toFixed(0),
      ym: wb.bagAMom.toFixed(1),
    },
    {
      lines: ["6- *Baggage \"B\" (FS 108 to 142) 50 Lbs Max"],
      h: 9,
      sw: "-",
      sm: "-",
      yw: wb.bagBLb.toFixed(0),
      ym: wb.bagBMom.toFixed(1),
    },
    {
      lines: ["7- RAMP WEIGHT AND MOMENT (Max 2,457 lb)"],
      h: 10,
      sw: "2457",
      sm: "107.7",
      yw: wb.rampLb.toFixed(1),
      ym: wb.rampMom.toFixed(1),
      bold: true,
      shade: true,
    },
    {
      lines: ["8- Fuel allowance for engine start, taxi and run-up."],
      h: 9.5,
      sw: "-7.0",
      sm: "-0.3",
      yw: wb.taxiLb.toFixed(1),
      ym: wb.taxiMom.toFixed(1),
    },
    {
      lines: [
        "9- TAKEOFF WT & MOMENT (Step 7 - Step 8)",
        `   CG Arm: ${wb.towCgArmIn}" | Endurance: ${wb.enduranceStr} | ${wb.category}`,
      ],
      h: 13.5,
      sw: "2450",
      sm: "107.4",
      yw: wb.towLb.toFixed(1),
      ym: wb.towMom.toFixed(1),
      bold: true,
      shade: true,
      status: wb.category,
    },
  ];

  let curY = ySubBot;
  for (const r of wbRows) {
    if (r.shade) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(x0, curY, xEnd - x0, r.h, "F");
    }
    pdf.setDrawColor(15, 23, 42);
    pdf.rect(x0, curY, xEnd - x0, r.h);
    pdf.line(xItemEnd, curY, xItemEnd, curY + r.h);
    pdf.line(xSampleW, curY, xSampleW, curY + r.h);
    pdf.line(xSampleM, curY, xSampleM, curY + r.h);
    pdf.line(xYourW, curY, xYourW, curY + r.h);

    pdf.setFont("helvetica", r.bold ? "bold" : "normal");
    pdf.setFontSize(r.lines.length > 1 ? 6.6 : 7.0);
    pdf.setTextColor(15, 23, 42);
    const startTextY = curY + (r.lines.length > 1 ? 4.3 : r.h / 2 + 1.1);
    r.lines.forEach((ln, li) => {
      if (li === 1 && r.status) {
        if (r.status === "OVERWEIGHT" || r.status === "OUT_OF_CG") {
          pdf.setTextColor(192, 0, 0);
        } else {
          pdf.setTextColor(5, 122, 85);
        }
      } else {
        pdf.setTextColor(15, 23, 42);
      }
      pdf.text(ln, x0 + 2, startTextY + li * 4.2);
    });

    pdf.setTextColor(100, 116, 139);
    pdf.setFont("helvetica", r.bold ? "bold" : "normal");
    pdf.setFontSize(7.6);
    const valY = curY + r.h / 2 + 1.2;
    pdf.text(r.sw, (xItemEnd + xSampleW) / 2, valY, { align: "center" });
    pdf.text(r.sm, (xSampleW + xSampleM) / 2, valY, { align: "center" });

    if (r.status === "OVERWEIGHT" || r.status === "OUT_OF_CG") {
      pdf.setTextColor(192, 0, 0);
    } else {
      pdf.setTextColor(27, 54, 93);
    }
    pdf.setFont("helvetica", "bold");
    pdf.text(r.yw, (xSampleM + xYourW) / 2, valY, { align: "center" });
    pdf.text(r.ym, (xYourW + xEnd) / 2, valY, { align: "center" });

    curY += r.h;
  }

  // Signature Strip (y = 239.5..267)
  const ySigTop = curY;
  const ySigBot = 267;
  pdf.setDrawColor(15, 23, 42);
  pdf.rect(x0, ySigTop, xEnd - x0, ySigBot - ySigTop);
  const sigW = (xEnd - x0) / 3;
  const sigCols = [
    { name: data.opsSupervisor, role: "FLIGHT OPERATION SUPERVISOR" },
    { name: data.cfiName, role: "CERTIFIED FLIGHT INSTRUCTOR" },
    { name: data.picName, role: "PILOT IN COMMAND" },
  ];
  sigCols.forEach((sc, idx) => {
    const sxCenter = x0 + (idx + 0.5) * sigW;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.0);
    pdf.setTextColor(27, 54, 93);
    pdf.text(`(  ${(sc.name || "                    ").slice(0, 24)}  )`, sxCenter, ySigTop + 9, {
      align: "center",
    });
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(6.8);
    pdf.text(sc.role, sxCenter, ySigTop + 17.5, { align: "center" });
  });

  // Designation Legend & Revision Footer (outside frame, y = 272..286)
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.0);
  pdf.setTextColor(51, 65, 85);
  const legendLines = pdf.splitTextToSize(C172_CREW_DESIGNATION_LEGEND, 188) as string[];
  pdf.text(legendLines, 105, 273, { align: "center" });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.6);
  pdf.text(`Issue No: ${data.issueNo || "01"}`, 14, 284);
  pdf.text(`Issue date: ${data.issueDate || "19 July 2019"}`, 64, 284);
  pdf.text(`Revision No: ${data.revisionNo || "0"}`, 124, 284);
  pdf.text(`Revision date: ${data.revisionDate || "Feb 2021"}`, 164, 284);

  // Page 2: Official C172R Section 6 Loading Graph & CG Moment Envelope (Landscape)
  if (data.includeWbCharts) {
    pdf.addPage("a4", "landscape");

    // Top POH Headers matching Section 6 Figure 6-6 / 6-7 Sheet
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    pdf.setTextColor(15, 23, 42);
    pdf.text("SECTION 6", 14, 10.5);
    pdf.text("WEIGHT & BALANCE / EQUIPMENT LIST", 14, 14.5);
    pdf.text("CESSNA", 141, 10.5, { align: "right" });
    pdf.text("MODEL 172R", 141, 14.5, { align: "right" });

    pdf.text("CESSNA", 156, 10.5);
    pdf.text("MODEL 172R", 156, 14.5);
    pdf.text("SECTION 6", 285, 10.5, { align: "right" });
    pdf.text("WEIGHT & BALANCE / EQUIPMENT LIST", 285, 14.5, { align: "right" });

    // =========================================================================
    // LEFT: Figure 6-6. Loading Graph (dense grid + dual Imperial & Metric axes)
    // =========================================================================
    const gx = 28;
    const gy = 30;
    const gw = 98;
    const gh = 110;
    const mapLoadX = (mom: number) => gx + (mom / 35) * gw;
    const mapLoadY = (wt: number) => gy + gh - (wt / 450) * gh;

    // Fine vertical grid (every 1 unit 0..35, major every 5)
    for (let m = 0; m <= 35; m++) {
      const lx = mapLoadX(m);
      const major = m % 5 === 0;
      pdf.setDrawColor(major ? 100 : 206, major ? 116 : 215, major ? 139 : 226);
      pdf.setLineWidth(major ? 0.22 : 0.08);
      pdf.line(lx, gy, lx, gy + gh);
    }

    // Fine horizontal grid (every 10 lb 0..450, major every 50)
    for (let w = 0; w <= 450; w += 10) {
      const ly = mapLoadY(w);
      const major = w % 50 === 0;
      pdf.setDrawColor(major ? 100 : 206, major ? 116 : 215, major ? 139 : 226);
      pdf.setLineWidth(major ? 0.22 : 0.08);
      pdf.line(gx, ly, gx + gw, ly);
    }

    // Solid plot border
    pdf.setDrawColor(15, 23, 42);
    pdf.setLineWidth(0.45);
    pdf.rect(gx, gy, gw, gh);

    // Bottom Imperial axis ticks + numbers
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.2);
    pdf.setTextColor(15, 23, 42);
    for (let m = 0; m <= 35; m++) {
      const lx = mapLoadX(m);
      const major = m % 5 === 0;
      pdf.setLineWidth(major ? 0.35 : 0.15);
      pdf.line(lx, gy + gh, lx, gy + gh + (major ? 1.8 : 0.9));
      if (major) {
        pdf.text(String(m), lx, gy + gh + 4.3, { align: "center" });
      }
    }
    pdf.setFontSize(6.4);
    pdf.text("LOAD MOMENT/1000 (POUNDS - INCHES)", gx + gw / 2, gy + gh + 9.2, { align: "center" });

    // Left Imperial axis ticks + numbers
    pdf.setFontSize(6.0);
    for (let w = 0; w <= 400; w += 50) {
      const ly = mapLoadY(w);
      pdf.setLineWidth(0.32);
      pdf.line(gx - 1.6, ly, gx, ly);
      pdf.text(String(w), gx - 2.3, ly + 1.2, { align: "right" });
    }
    drawRotatedHaloText(pdf, "WEIGHT (POUNDS)", 16.5, gy + gh / 2, 90, 6.4, [15, 23, 42]);

    // Top Metric axis (0..400 kg-mm/1000)
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.4);
    pdf.setTextColor(15, 23, 42);
    pdf.text("LOAD MOMENT/1000 (KILOGRAM - MILLIMETERS)", gx + gw / 2, 22.3, { align: "center" });
    pdf.setFontSize(5.8);
    for (let km = 0; km <= 400; km += 10) {
      const mLb = km / LB_IN_TO_KG_MM;
      if (mLb > 35) continue;
      const lx = mapLoadX(mLb);
      const major = km % 50 === 0;
      pdf.setLineWidth(major ? 0.35 : 0.16);
      pdf.line(lx, gy - (major ? 2.0 : 1.0), lx, gy);
      if (major) {
        pdf.text(String(km), lx, gy - 2.7, { align: "center" });
      }
    }

    // Right Metric axis (0..200 kg)
    pdf.setFontSize(5.8);
    for (let kg = 0; kg <= 200; kg += 5) {
      const wLb = kg * KG_TO_LB;
      if (wLb > 450) continue;
      const ly = mapLoadY(wLb);
      const major = kg % 25 === 0;
      pdf.setLineWidth(major ? 0.35 : 0.16);
      pdf.line(gx + gw, ly, gx + gw + (major ? 2.0 : 1.0), ly);
      if (major) {
        pdf.text(String(kg), gx + gw + 2.6, ly + 1.1);
      }
    }
    drawRotatedHaloText(pdf, "WEIGHT (KILOGRAMS)", gx + gw + 13.5, gy + gh / 2, 90, 6.4, [15, 23, 42]);

    // 5 Official Diagonal Station Rays + Rotated Halo Labels
    const loadRays = [
      { maxW: 400, arm: 37, label: "PILOT & FRONT PASSENGER", lx: 8.2, ly: 278, above: true },
      { maxW: 318, arm: 48, label: "FUEL (6 LBS/GAL)", lx: 13.0, ly: 256, above: false },
      { maxW: 400, arm: 73, label: "REAR PASSENGERS", lx: 22.6, ly: 325, above: true },
      { maxW: 120, arm: 95, label: "BAGGAGE AREA 1", lx: 12.2, ly: 100, above: false },
      { maxW: 50, arm: 123, label: "BAGGAGE AREA 2", lx: 7.4, ly: 35, above: false },
    ];
    loadRays.forEach((ray) => {
      const clampedM = (Math.min(ray.maxW, (35 * 1000) / ray.arm) * ray.arm) / 1000;
      const clampedW = (clampedM * 1000) / ray.arm;
      const x2 = mapLoadX(clampedM);
      const y2 = mapLoadY(clampedW);
      pdf.setDrawColor(27, 54, 93);
      pdf.setLineWidth(0.55);
      pdf.line(gx, gy + gh, x2, y2);

      // Exact screen angle of the drawn vector in PDF mm space
      const dxMm = x2 - gx;
      const dyUpMm = gy + gh - y2;
      const angleDeg = (Math.atan2(dyUpMm, dxMm) * 180) / Math.PI;
      drawRotatedHaloText(
        pdf,
        ray.label,
        mapLoadX(ray.lx),
        mapLoadY(ray.ly),
        angleDeg,
        5.0,
        [27, 54, 93]
      );
    });

    // Framed white LOADING GRAPH callout box
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(15, 23, 42);
    pdf.setLineWidth(0.32);
    const lgBoxX = mapLoadX(22);
    const lgBoxY = mapLoadY(205);
    const lgBoxW = mapLoadX(32) - lgBoxX;
    const lgBoxH = mapLoadY(152) - lgBoxY;
    pdf.rect(lgBoxX, lgBoxY, lgBoxW, lgBoxH, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.2);
    pdf.setTextColor(15, 23, 42);
    pdf.text("LOADING", lgBoxX + lgBoxW / 2, lgBoxY + 5.0, { align: "center" });
    pdf.text("GRAPH", lgBoxX + lgBoxW / 2, lgBoxY + 9.2, { align: "center" });

    // Live plotted aircraft station dots
    const plotStation = (w: number, m: number, tag: string) => {
      if (w <= 0 || m <= 0 || m > 35 || w > 450) return;
      const px = mapLoadX(m);
      const py = mapLoadY(w);
      pdf.setFillColor(192, 0, 0);
      pdf.setDrawColor(255, 255, 255);
      pdf.setLineWidth(0.3);
      pdf.circle(px, py, 1.4, "FD");
      const tagStr = `${tag} (${w.toFixed(0)}lb)`;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(5.0);
      const tw = pdf.getTextWidth(tagStr);
      pdf.setFillColor(255, 255, 255);
      pdf.rect(px + 1.8, py - 2.1, tw + 1.4, 3.6, "F");
      pdf.setTextColor(192, 0, 0);
      pdf.text(tagStr, px + 2.5, py + 0.7);
    };
    plotStation(wb.frontPaxLb, wb.frontPaxMom, "Front");
    plotStation(wb.fuelLb, wb.fuelMom, "Fuel");
    plotStation(wb.rearPaxLb, wb.rearPaxMom, "Rear");
    plotStation(wb.bagALb, wb.bagAMom, "BagA");
    plotStation(wb.bagBLb, wb.bagBMom, "BagB");

    // Note + Part number + Figure caption
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(
      "NOTE: LINE REPRESENTING ADJUSTABLE SEATS SHOWS THE PILOT OR PASSENGER CENTER OF GRAVITY ON ADJUSTABLE SEATS POSITIONED FOR AN AVERAGE OCCUPANT. REFER TO THE LOADING ARRANGEMENTS DIAGRAM FOR FORWARD AND AFT LIMITS OF OCCUPANT C.G. RANGE.",
      gx,
      gy + gh + 14.5,
      { maxWidth: gw }
    );
    pdf.setFontSize(5.0);
    pdf.setTextColor(71, 85, 105);
    pdf.text("0585C1006", gx + gw, gy + gh + 32, { align: "right" });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    pdf.setTextColor(15, 23, 42);
    pdf.text("Figure 6-6. Loading Graph", gx + gw / 2, gy + gh + 38, { align: "center" });

    // =========================================================================
    // RIGHT: Figure 6-7. Center of Gravity Moment Envelope (Full Dense Grid)
    // =========================================================================
    const cx = 169;
    const cy = 30;
    const cw = 102;
    const ch = 128;
    const mapX = (mom: number) => cx + ((mom - 50) / (120 - 50)) * cw;
    const mapY = (wt: number) => cy + ch - ((wt - 1500) / (2500 - 1500)) * ch;

    // Dense Vertical Grid: every 1 lb-in/1000 from 50..120
    for (let m = 50; m <= 120; m++) {
      const lx = mapX(m);
      const isMajor = m % 10 === 0;
      const isMed = !isMajor && m % 5 === 0;
      pdf.setDrawColor(isMajor ? 100 : isMed ? 148 : 210, isMajor ? 116 : isMed ? 163 : 218, isMajor ? 139 : isMed ? 184 : 228);
      pdf.setLineWidth(isMajor ? 0.22 : isMed ? 0.12 : 0.06);
      pdf.line(lx, cy, lx, cy + ch);
    }

    // Dense Horizontal Grid: every 10 lb from 1500..2500
    for (let w = 1500; w <= 2500; w += 10) {
      const ly = mapY(w);
      const isMajor = w % 100 === 0;
      const isMed = !isMajor && w % 50 === 0;
      pdf.setDrawColor(isMajor ? 100 : isMed ? 148 : 210, isMajor ? 116 : isMed ? 163 : 218, isMajor ? 139 : isMed ? 184 : 228);
      pdf.setLineWidth(isMajor ? 0.22 : isMed ? 0.12 : 0.06);
      pdf.line(cx, ly, cx + cw, ly);
    }

    // Solid Plot Border
    pdf.setDrawColor(15, 23, 42);
    pdf.setLineWidth(0.45);
    pdf.rect(cx, cy, cw, ch);

    // Bottom Imperial axis ticks + numbers
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.2);
    pdf.setTextColor(15, 23, 42);
    for (let m = 50; m <= 120; m += 10) {
      const lx = mapX(m);
      pdf.setLineWidth(0.32);
      pdf.line(lx, cy + ch, lx, cy + ch + 1.8);
      pdf.text(String(m), lx, cy + ch + 4.3, { align: "center" });
    }
    pdf.setFontSize(6.4);
    pdf.text("LOADED AIRPLANE MOMENT/1000 (POUND-INCHES)", cx + cw / 2, cy + ch + 9.2, {
      align: "center",
    });

    // Left Imperial axis ticks + numbers
    pdf.setFontSize(6.0);
    for (let w = 1500; w <= 2500; w += 100) {
      const ly = mapY(w);
      pdf.setLineWidth(0.32);
      pdf.line(cx - 1.6, ly, cx, ly);
      pdf.text(String(w), cx - 2.3, ly + 1.2, { align: "right" });
    }
    drawRotatedHaloText(
      pdf,
      "LOADED AIRPLANE WEIGHT (POUNDS)",
      cx - 13.5,
      cy + ch / 2,
      90,
      6.4,
      [15, 23, 42]
    );

    // Top Metric axis (600..1300 kg-mm/1000)
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.4);
    pdf.setTextColor(15, 23, 42);
    pdf.text("LOADED AIRPLANE MOMENT/1000 (KILOGRAM-MILLIMETERS)", cx + cw / 2, 22.3, {
      align: "center",
    });
    pdf.setFontSize(5.8);
    for (let km = 580; km <= 1380; km += 20) {
      const mLb = km / LB_IN_TO_KG_MM;
      if (mLb < 50 || mLb > 120) continue;
      const lx = mapX(mLb);
      const major = km % 100 === 0;
      pdf.setLineWidth(major ? 0.35 : 0.16);
      pdf.line(lx, cy - (major ? 2.0 : 1.0), lx, cy);
      if (major) {
        pdf.text(String(km), lx, cy - 2.7, { align: "center" });
      }
    }

    // Right Metric axis (700..1100 kg)
    pdf.setFontSize(5.8);
    for (let kg = 690; kg <= 1130; kg += 10) {
      const wLb = kg * KG_TO_LB;
      if (wLb < 1500 || wLb > 2500) continue;
      const ly = mapY(wLb);
      const major = kg % 50 === 0;
      pdf.setLineWidth(major ? 0.35 : 0.16);
      pdf.line(cx + cw, ly, cx + cw + (major ? 2.0 : 1.0), ly);
      if (major) {
        pdf.text(String(kg), cx + cw + 2.6, ly + 1.1);
      }
    }
    drawRotatedHaloText(
      pdf,
      "LOADED AIRPLANE WEIGHT (KILOGRAMS)",
      cx + cw + 14.5,
      cy + ch / 2,
      90,
      6.4,
      [15, 23, 42]
    );

    // Draw Normal Envelope Polygon (Solid)
    pdf.setDrawColor(27, 54, 93);
    pdf.setLineWidth(0.7);
    for (let i = 0; i < C172R_NORMAL_ENVELOPE.length; i++) {
      const p1 = C172R_NORMAL_ENVELOPE[i];
      const p2 = C172R_NORMAL_ENVELOPE[(i + 1) % C172R_NORMAL_ENVELOPE.length];
      pdf.line(mapX(p1[0]), mapY(p1[1]), mapX(p2[0]), mapY(p2[1]));
    }

    // Draw Utility Envelope Divider (Dashed)
    pdf.setDrawColor(5, 122, 85);
    pdf.setLineWidth(0.55);
    pdf.setLineDashPattern([1.8, 1.3], 0);
    pdf.line(mapX(60.75), mapY(1500), mapX(85.05), mapY(2100));
    pdf.line(mapX(85.05), mapY(2100), mapX(76.65), mapY(2100));
    pdf.setLineDashPattern([], 0);

    // White framed CENTER OF GRAVITY MOMENT ENVELOPE box
    const envBoxX = mapX(52);
    const envBoxY = mapY(2405);
    const envBoxW = mapX(82) - envBoxX;
    const envBoxH = mapY(2320) - envBoxY;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(15, 23, 42);
    pdf.setLineWidth(0.32);
    pdf.rect(envBoxX, envBoxY, envBoxW, envBoxH, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.2);
    pdf.setTextColor(15, 23, 42);
    pdf.text("CENTER OF GRAVITY", envBoxX + envBoxW / 2, envBoxY + 4.4, { align: "center" });
    pdf.text("MOMENT ENVELOPE", envBoxX + envBoxW / 2, envBoxY + 8.6, { align: "center" });

    // NORMAL CATEGORY white-backed badge (placed cleanly in wide upper Normal area)
    const normX = mapX(98);
    const normY = mapY(2385);
    const normW = mapX(113) - normX;
    const normH = mapY(2310) - normY;
    pdf.setFillColor(255, 255, 255);
    pdf.rect(normX, normY, normW, normH, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.2);
    pdf.setTextColor(27, 54, 93);
    pdf.text("NORMAL", normX + normW / 2, normY + 4.0, { align: "center" });
    pdf.text("CATEGORY", normX + normW / 2, normY + 7.8, { align: "center" });

    // UTILITY CATEGORY rotated halo label along Utility slope
    const uDx = mapX(85.05) - mapX(60.75);
    const uDyUp = mapY(1500) - mapY(2100);
    const uAngle = (Math.atan2(uDyUp, uDx) * 180) / Math.PI;
    drawRotatedHaloText(pdf, "UTILITY", mapX(70.5), mapY(1910), uAngle, 5.6, [5, 122, 85]);
    drawRotatedHaloText(pdf, "CATEGORY", mapX(73.6), mapY(1880), uAngle, 5.6, [5, 122, 85]);

    // Plot Ramp & Takeoff points
    const clampM = (m: number) => Math.max(50, Math.min(120, m));
    const clampW = (w: number) => Math.max(1500, Math.min(2500, w));
    const towPxX = mapX(clampM(wb.towMom));
    const towPxY = mapY(clampW(wb.towLb));
    const rampPxX = mapX(clampM(wb.rampMom));
    const rampPxY = mapY(clampW(wb.rampLb));

    pdf.setDrawColor(192, 0, 0);
    pdf.setLineWidth(0.5);
    pdf.line(rampPxX, rampPxY, towPxX, towPxY);
    pdf.setFillColor(71, 85, 105);
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.25);
    pdf.circle(rampPxX, rampPxY, 1.3, "FD");
    pdf.setFillColor(192, 0, 0);
    pdf.circle(towPxX, towPxY, 2.0, "FD");

    // White-backed TOW badge
    const towLbl = `TOW ${wb.towLb.toFixed(0)}lb / ${wb.towMom.toFixed(1)}`;
    const towOnLeft = wb.towMom > 94;
    const pillW = 31;
    const pillH = 5.4;
    const pillX = towOnLeft ? towPxX - pillW - 2.2 : towPxX + 2.2;
    const pillY = Math.max(cy + 2, towPxY - 6.2);
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(192, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.rect(pillX, pillY, pillW, pillH, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.2);
    pdf.setTextColor(192, 0, 0);
    pdf.text(towLbl, pillX + pillW / 2, pillY + 3.8, { align: "center" });

    // Part number & Figure 6-7 caption
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.0);
    pdf.setTextColor(71, 85, 105);
    pdf.text("0585C1007", cx + cw, cy + ch + 14.5, { align: "right" });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    pdf.setTextColor(15, 23, 42);
    pdf.text("Figure 6-7. Center of Gravity Moment Envelope", cx + cw / 2, cy + ch + 20, {
      align: "center",
    });

    // Live Summary Box bottom
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(27, 54, 93);
    pdf.setLineWidth(0.35);
    pdf.rect(14, 187, 269, 15.5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.2);
    pdf.setTextColor(27, 54, 93);
    pdf.text(
      `YOUR AIRPLANE (${data.aircraftReg || "SU-BQT"}) - Ramp: ${wb.rampLb.toFixed(1)} lb (${wb.rampMom.toFixed(
        1
      )})   |   Takeoff: ${wb.towLb.toFixed(1)} lb (${wb.towMom.toFixed(1)})   |   CG Arm: ${
        wb.towCgArmIn
      }"   |   Endurance: ${wb.enduranceStr}   |   Status: ${wb.category}`,
      148.5,
      193.5,
      { align: "center" }
    );
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.0);
    pdf.setTextColor(
      wb.warnings.length > 0 ? 192 : 5,
      wb.warnings.length > 0 ? 0 : 122,
      wb.warnings.length > 0 ? 0 : 85
    );
    pdf.text(
      wb.warnings.length > 0
        ? `WARNINGS: ${wb.warnings.join(" ")}`
        : "WITHIN CESSNA 172R NORMAL / UTILITY LIMITS - CLEARED FOR FLIGHT.",
      148.5,
      199.5,
      { align: "center" }
    );
  }

  const safeReg = (data.aircraftReg || "SUBQT").replace(/[^A-Z0-9-]/gi, "");
  const safeDate = (data.date || "date").replace(/[^0-9-]/g, "_");
  pdf.save(`MFC_C172R_Flight_Release_${safeReg}_${safeDate}.pdf`);
}

// ============================================================================
// 2. OFFICIAL EGYPT NANSC / EAA / MFC INTERNATIONAL FLIGHT PLAN (1 PAGE A4)
// ============================================================================
export async function exportFlightPlanPdf(data: IcaoFlightPlanData): Promise<void> {
  const logoUrl = await loadLogoDataUrl();
  const arabicHdrUrl = renderArabicFplHeaderDataUrl(data.aerodrome || "");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Top 3-Column Header (matches physical Egypt NANSC / EAA / MFC form paper)
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.6);
  pdf.setTextColor(30, 41, 59);
  pdf.text("Arab Republic of Egypt", 39, 10.5, { align: "center" });
  pdf.text("Ministry of Civil Aviation", 39, 14.5, { align: "center" });
  pdf.text("National Air Navigation services Company", 39, 18.5, { align: "center" });

  // Dashed English Aerodrome line
  pdf.setDrawColor(51, 65, 85);
  pdf.setLineWidth(0.32);
  pdf.setLineDashPattern([1.2, 0.9], 0);
  pdf.line(12, 29.5, 53.5, 29.5);
  pdf.setLineDashPattern([], 0);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.6);
  pdf.setTextColor(30, 41, 59);
  pdf.text("Aerodrome", 55, 29.5);
  if (data.aerodrome) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.4);
    pdf.setTextColor(27, 54, 93);
    pdf.text((data.aerodrome || "").slice(0, 26), 32.5, 28.0, { align: "center" });
  }

  // Center Logo + EAA / MFC subtitle
  if (logoUrl) pdf.addImage(logoUrl, "PNG", 87, 8, 36, 9);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.3);
  pdf.setTextColor(27, 54, 93);
  pdf.text("EGYPTIAN AVIATION ACADEMY", 105, 20.5, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.0);
  pdf.text("Misr Flying College", 105, 23.8, { align: "center" });

  // Right Arabic NANSC header image
  if (arabicHdrUrl) {
    pdf.addImage(arabicHdrUrl, "PNG", 136, 7.5, 62, 26.7);
  }

  // Outer Frame Border (x=12..198, y=36..286)
  const fx = 12;
  const fxEnd = 198;
  const fw = 186;
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.35);
  pdf.rect(fx, 36, fw, 250);

  // Title Row (y=36..45)
  pdf.line(fx, 45, fxEnd, 45);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text("International Flight Plan", 105, 42.1, { align: "center" });

  // AFTN Section (y=45..85)
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("PRIORITY", 22, 49.2);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.text("<=", 14.2, 56.5);
  pdf.setFont("courier", "bold");
  pdf.setFontSize(10.5);
  pdf.setTextColor(27, 54, 93);
  pdf.text((data.priority || "FF").toUpperCase(), 20.5, 56.5);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("ADDRESSEE(S)", 41, 49.2);

  // 3 Addressee horizontal writing rules
  pdf.setLineWidth(0.26);
  pdf.line(58.5, 50.5, 190, 50.5);
  pdf.line(41, 56.2, 190, 56.2);
  pdf.line(41, 61.8, 190, 61.8);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("<=", 191.2, 65.5);

  pdf.setFont("courier", "bold");
  pdf.setFontSize(8.4);
  pdf.setTextColor(27, 54, 93);
  const addrLines = pdf.splitTextToSize((data.addressees || "").toUpperCase(), 130) as string[];
  if (addrLines[0]) pdf.text(addrLines[0], 60, 49.8);
  if (addrLines[1]) pdf.text(addrLines[1], 42, 55.5);
  if (addrLines[2]) pdf.text(addrLines[2], 42, 61.1);

  // Filing Time + Originator comb boxes (y=67..78)
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("FILING TIME", 17, 69.8);
  drawCombBox(pdf, 15, 71, 29, 5.2, 6, data.filingTimeUtc, { fontSize: 8.8 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("ORIGINATOR", 58, 69.8);
  drawCombBox(pdf, 49, 71, 38, 5.2, 8, data.originator, { fontSize: 8.6 });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text("<=", 89, 75.5);

  // Specific Identification line (y=78..85.5)
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.text("SPECIFIC IDENTIFICATION OF ADDRESSEE(S) AND / OR ORIGINATOR", 15, 81);
  if (data.specificId) {
    pdf.setFont("courier", "bold");
    pdf.setFontSize(7.6);
    pdf.setTextColor(27, 54, 93);
    pdf.text(data.specificId.toUpperCase().slice(0, 42), 110, 81);
  }
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.32);
  pdf.line(fx, 83.8, fxEnd, 83.8);
  pdf.line(fx, 85.2, fxEnd, 85.2);

  // Body Section (y=85.2..189)
  // Item 3, 7, 8
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("3  MESSAGE TYPE", 15, 89.2);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text(`<=(${(data.item3MsgType || "FPL").toUpperCase()}`, 14.5, 94.5);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.text("7  AIRCRAFT IDENTIFICATION", 55, 89.2);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("-", 52.2, 94.5);
  drawCombBox(pdf, 55, 90.2, 37, 5.2, 7, data.item7AircraftId, { fontSize: 9.2 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("8  FLIGHT RULES", 110, 89.2);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("-", 116.5, 94.5);
  drawCombBox(pdf, 119.5, 90.2, 6.2, 5.2, 1, data.item8FlightRules, { fontSize: 9.2 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("TYPE OF FLIGHT", 148, 89.2);
  drawCombBox(pdf, 155, 90.2, 6.2, 5.2, 1, data.item8FlightType, { fontSize: 9.2 });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text("<=", 189.5, 94.5);

  // Item 9, 10
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.text("9  NUMBER", 15, 99.8);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("-", 13.0, 105.0);
  drawCombBox(pdf, 15, 100.8, 11, 5.2, 2, data.item9Number || "1", { fontSize: 9.0 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("TYPE OF AIRCRAFT", 42, 99.8);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("-", 39.2, 105.0);
  drawCombBox(pdf, 42, 100.8, 22, 5.2, 4, data.item9AircraftType || "C172", { fontSize: 9.0 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("WAKE TURBULENCE CAT.", 83, 99.8);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("/", 93.5, 105.0);
  drawCombBox(pdf, 96.5, 100.8, 6.2, 5.2, 1, data.item9WakeCat || "L", { fontSize: 9.0 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("10  EQUIPMENT", 136, 99.8);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("-", 127.5, 105.0);
  pdf.setLineWidth(0.28);
  pdf.rect(130.5, 100.8, 49, 5.2);
  pdf.setFontSize(9.5);
  pdf.text("/", 160, 104.8, { align: "center" });
  pdf.setFont("courier", "bold");
  pdf.setFontSize(9.0);
  pdf.setTextColor(27, 54, 93);
  pdf.text((data.item10Equipment || "SDG").toUpperCase(), 157.5, 104.6, { align: "right" });
  pdf.text((data.item10Surveillance || "S").toUpperCase(), 162.5, 104.6);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text("<=", 189.5, 105.0);

  // Item 13 Departure & Time
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.text("13  DEPARTURE AERODROME", 24, 111.0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("-", 21.2, 116.2);
  drawCombBox(pdf, 24, 112.0, 26, 5.2, 4, data.item13DepIcao, { fontSize: 9.2 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("TIME", 78, 111.0);
  drawCombBox(pdf, 69, 112.0, 25, 5.2, 4, data.item13EobtUtc, { fontSize: 9.2 });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text("<=", 98.5, 116.2);

  // Item 15 Speed / Level / Route (4-line Route area matching paper)
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.text("15  CRUISING SPEED", 15, 122.2);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("-", 13.0, 127.4);
  drawCombBox(pdf, 15, 123.2, 24, 5.2, 5, data.item15Speed, { fontSize: 8.6 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("LEVEL", 53, 122.2);
  drawCombBox(pdf, 45, 123.2, 26, 5.2, 5, data.item15Level, { fontSize: 8.6 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("ROUTE", 77, 122.2);
  pdf.setLineWidth(0.26);
  pdf.rect(77, 123.2, 116, 5.2);
  pdf.line(15, 134.0, 193, 134.0);
  pdf.line(15, 139.8, 193, 139.8);
  pdf.line(15, 145.6, 187.5, 145.6);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("<=", 189.5, 145.6);

  pdf.setFont("courier", "bold");
  pdf.setFontSize(8.8);
  pdf.setTextColor(27, 54, 93);
  const routeLines = pdf.splitTextToSize((data.item15Route || "").toUpperCase(), 112) as string[];
  if (routeLines[0]) pdf.text(routeLines[0], 79, 127.0);
  if (routeLines[1]) pdf.text(routeLines[1], 16, 133.2);
  if (routeLines[2]) pdf.text(routeLines[2], 16, 139.0);
  if (routeLines[3]) pdf.text(routeLines[3], 16, 144.8);

  // Item 16 Destination, Total EET, 1st & 2nd Alternates
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.0);
  pdf.setTextColor(15, 23, 42);
  pdf.text("TOTAL EET", 81.5, 149.2, { align: "center" });
  pdf.text("16  DESTINATION AERODROME", 15, 152.2);
  pdf.text("HR     MIN", 75.5, 152.2);
  pdf.text("ALTN AERODROME", 107, 152.2);
  pdf.text("2ND ALTN AERODROME", 145, 152.2);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("-", 13.0, 157.5);
  drawCombBox(pdf, 15, 153.2, 26, 5.2, 4, data.item16DestIcao, { fontSize: 9.0 });
  drawCombBox(pdf, 69.5, 153.2, 24, 5.2, 4, data.item16TotalEet, {
    midTallIndex: 2,
    fontSize: 9.0,
  });
  drawCombBox(pdf, 107, 153.2, 25, 5.2, 4, data.item16Altn1, { fontSize: 9.0 });
  drawCombBox(pdf, 146, 153.2, 25, 5.2, 4, data.item16Altn2, { fontSize: 9.0 });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text("<=", 189.5, 157.5);

  // Item 18 Other Information (3 writing rules)
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.text("18  OTHER INFORMATION", 15, 163.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("-", 13.0, 169.0);
  pdf.setLineWidth(0.26);
  pdf.line(15, 169.8, 193, 169.8);
  pdf.line(15, 177.2, 193, 177.2);
  pdf.line(15, 184.6, 187.5, 184.6);
  pdf.text("<=", 189.5, 184.6);

  pdf.setFont("courier", "bold");
  pdf.setFontSize(8.2);
  pdf.setTextColor(27, 54, 93);
  const otherLines = pdf.splitTextToSize((data.item18Other || "").toUpperCase(), 172) as string[];
  if (otherLines[0]) pdf.text(otherLines[0], 16, 169.0);
  if (otherLines[1]) pdf.text(otherLines[1], 16, 176.4);
  if (otherLines[2]) pdf.text(otherLines[2], 16, 183.8);

  // Double Divider above Item 19
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.32);
  pdf.line(fx, 188.0, fxEnd, 188.0);
  pdf.line(fx, 189.5, fxEnd, 189.5);

  // Item 19 Supplementary Information (y=189.5..272)
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.4);
  pdf.setTextColor(15, 23, 42);
  pdf.text(
    "SUPPLEMENTARY INFORMATION (NOT TO BE TRANSMITTED IN FPL MESSAGES)",
    25,
    194.2
  );

  // 19A: Endurance, Persons, Emergency Radio
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.text("19", 15, 199.0);
  pdf.text("ENDURANCE", 25, 198.2);
  pdf.text("HR    MIN", 29, 201.0);
  pdf.text("PERSONS ON BOARD", 67, 200.5);
  pdf.text("EMERGENCY RADIO", 132, 198.2);
  pdf.text("UHF", 133.8, 201.2);
  pdf.text("VHF", 151.8, 201.2);
  pdf.text("ELT", 169.8, 201.2);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("- E/", 13.0, 206.0);
  drawCombBox(pdf, 24, 202.0, 24, 5.2, 4, data.item19Endurance, {
    midTallIndex: 2,
    fontSize: 9.0,
  });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text("P/", 61.5, 206.0);
  drawCombBox(pdf, 67, 202.0, 19, 5.2, 3, data.item19Persons, { fontSize: 9.0 });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text("R/", 127.5, 206.0);
  drawCrossableLetterBox(pdf, 134, 202.0, 5.4, "U", data.item19RadioU);
  drawCrossableLetterBox(pdf, 152, 202.0, 5.4, "V", data.item19RadioV);
  drawCrossableLetterBox(pdf, 170, 202.0, 5.4, "E", data.item19RadioE);

  // 19B: Survival Equipment & Jackets
  const anySurvival =
    data.item19SurvP || data.item19SurvD || data.item19SurvM || data.item19SurvJ;
  const anyJackets =
    data.item19JacketsL || data.item19JacketsF || data.item19JacketsU || data.item19JacketsV;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("SURVIVAL EQUIPMENT", 26, 212.0);
  pdf.text("POLAR", 35.5, 214.8);
  pdf.text("DESERT", 48.5, 214.8);
  pdf.text("MARITIME", 62, 214.8);
  pdf.text("JUNGLE", 76.5, 214.8);

  pdf.text("JACKETS", 104, 212.0);
  pdf.text("LIGHT", 116, 214.8);
  pdf.text("FLUORES", 129, 214.8);
  pdf.text("UHF", 145, 214.8);
  pdf.text("VHF", 159, 214.8);

  drawCrossableLetterBox(pdf, 26, 215.6, 5.4, "S", anySurvival);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("/", 33.0, 219.6);
  drawCrossableLetterBox(pdf, 36.5, 215.6, 5.4, "P", data.item19SurvP);
  drawCrossableLetterBox(pdf, 50.0, 215.6, 5.4, "D", data.item19SurvD);
  drawCrossableLetterBox(pdf, 64.5, 215.6, 5.4, "M", data.item19SurvM);
  drawCrossableLetterBox(pdf, 78.0, 215.6, 5.4, "J", data.item19SurvJ);

  drawCrossableLetterBox(pdf, 104, 215.6, 5.4, "J", anyJackets);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("/", 111.5, 219.6);
  drawCrossableLetterBox(pdf, 116, 215.6, 5.4, "L", data.item19JacketsL);
  drawCrossableLetterBox(pdf, 130, 215.6, 5.4, "F", data.item19JacketsF);
  drawCrossableLetterBox(pdf, 144.5, 215.6, 5.4, "U", data.item19JacketsU);
  drawCrossableLetterBox(pdf, 158.5, 215.6, 5.4, "V", data.item19JacketsV);

  // 19C: Dinghies
  const hasDinghy = Boolean(
    data.item19DinghiesNum.trim() ||
      data.item19DinghiesCap.trim() ||
      data.item19DinghiesCover ||
      data.item19DinghiesColor.trim()
  );
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("DINGHIES", 24, 224.8);
  pdf.text("NUMBER", 24, 227.6);
  pdf.text("CAPACITY", 40.5, 227.6);
  pdf.text("COVER", 58.5, 227.6);
  pdf.text("COLOR", 88, 227.6);

  drawCrossableLetterBox(pdf, 15, 228.5, 5.4, "D", hasDinghy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("/", 21.8, 232.6);
  drawCombBox(pdf, 24, 228.5, 11.5, 5.4, 2, data.item19DinghiesNum, { fontSize: 8.6 });
  drawCombBox(pdf, 40, 228.5, 16, 5.4, 3, data.item19DinghiesCap, { fontSize: 8.6 });
  drawCrossableLetterBox(pdf, 59.5, 228.5, 5.4, "C", data.item19DinghiesCover);

  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.28);
  pdf.rect(68.5, 228.5, 48, 5.4);
  if (data.item19DinghiesColor) {
    pdf.setFont("courier", "bold");
    pdf.setFontSize(8.4);
    pdf.setTextColor(27, 54, 93);
    pdf.text(data.item19DinghiesColor.toUpperCase().slice(0, 22), 70.5, 232.3);
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text("<=", 119.0, 232.6);

  // 19D: Aircraft Color and Markings
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.text("AIRCRAFT COLOR AND MARKINGS", 24, 238.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("A /", 15, 243.5);
  pdf.setLineWidth(0.28);
  pdf.rect(24, 239.5, 163, 5.4);
  pdf.setFont("courier", "bold");
  pdf.setFontSize(8.8);
  pdf.setTextColor(27, 54, 93);
  pdf.text((data.item19ColorMarkings || "").toUpperCase().slice(0, 68), 26, 243.3);

  // 19E: Remarks
  const hasRemarks = Boolean((data.item19Remarks || "").trim());
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.setTextColor(15, 23, 42);
  pdf.text("REMARKS", 24, 249.5);
  drawCrossableLetterBox(pdf, 15, 250.5, 5.4, "N", hasRemarks);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("/", 21.8, 254.5);
  pdf.setLineWidth(0.28);
  pdf.rect(24, 250.5, 160, 5.4);
  if (hasRemarks) {
    pdf.setFont("courier", "bold");
    pdf.setFontSize(8.4);
    pdf.setTextColor(27, 54, 93);
    pdf.text(data.item19Remarks.toUpperCase().slice(0, 66), 26, 254.3);
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text("<=", 186.5, 254.5);

  // 19F: Pilot-in-Command
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  pdf.text("PILOT-IN-COMMAND", 24, 260.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("C /", 15, 265.5);
  pdf.setLineWidth(0.28);
  pdf.rect(24, 261.5, 92, 5.4);
  pdf.setFont("courier", "bold");
  pdf.setFontSize(8.8);
  pdf.setTextColor(27, 54, 93);
  pdf.text((data.item19Pic || "").toUpperCase().slice(0, 36), 26, 265.3);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text(")<=", 118.5, 265.5);

  // Bottom 3-Column Footer Box (y=271..286)
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.32);
  pdf.line(fx, 271, fxEnd, 271);
  pdf.line(73, 271, 73, 286);
  pdf.line(135, 271, 135, 286);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.2);
  pdf.setTextColor(15, 23, 42);
  pdf.text("FILED BY", 42.5, 274.5, { align: "center" });
  pdf.text("ACCEPTED BY", 104, 274.5, { align: "center" });
  pdf.text("ADDITIONAL INFORMATION", 166.5, 274.5, { align: "center" });

  pdf.setFont("courier", "bold");
  pdf.setFontSize(7.6);
  pdf.setTextColor(27, 54, 93);
  if (data.filedBy) {
    const fLines = pdf.splitTextToSize(data.filedBy, 56) as string[];
    pdf.text(fLines.slice(0, 2), 42.5, 280.5, { align: "center" });
  }
  if (data.acceptedBy) {
    const aLines = pdf.splitTextToSize(data.acceptedBy, 56) as string[];
    pdf.text(aLines.slice(0, 2), 104, 280.5, { align: "center" });
  }
  if (data.additionalReq) {
    const addLines = pdf.splitTextToSize(data.additionalReq, 58) as string[];
    pdf.text(addLines.slice(0, 2), 166.5, 280.5, { align: "center" });
  }

  const safeId = (data.item7AircraftId || "SUBQT").replace(/[^A-Z0-9]/gi, "");
  pdf.save(`MFC_ICAO_Flight_Plan_${safeId}.pdf`);
}

// ============================================================================
// 3. MFC CLEARANCE, MET REPORT & COMM/NAV FREQUENCIES + 5-AIRPORT AIP MATRIX
// ============================================================================
export async function exportCommsSheetPdf(data: CommsReferenceData): Promise<void> {
  const logoUrl = await loadLogoDataUrl();
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Page 1: Official MFC Clearance, Met & Master Frequency Sheet (Image 1 Replica)
  if (logoUrl) {
    pdf.addImage(logoUrl, "PNG", 16, 12, 44, 11);
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(27, 54, 93);
  pdf.text("EGYPTIAN AVIATION ACADEMY", 38, 26, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.text("Misr Flying College", 38, 29.5, { align: "center" });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Misr Flying College", 194, 18, { align: "right" });
  pdf.setFontSize(11);
  pdf.text("Flying Operation Dept.", 194, 24, { align: "right" });

  // Crew / Flight strip (y = 36..52)
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.25);
  pdf.line(14, 34, 196, 34);
  const topCols = [
    { lbl: "Aircraft Registration", val: data.aircraftReg || "SU-B__" },
    { lbl: "Pilot In Command", val: data.pilotInCommand || "" },
    { lbl: "Departure A/D", val: data.departureAd || "HEAT" },
    { lbl: "Arrival A/D", val: data.arrivalAd || "" },
  ];
  topCols.forEach((tc, i) => {
    const cx = 14 + i * 45.5;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.2);
    pdf.setTextColor(27, 54, 93);
    pdf.text(tc.lbl, cx, 40);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(tc.val, cx, 47);
    pdf.line(cx, 48.5, cx + 41, 48.5);
  });

  // ATC Clearance section (y = 54..76)
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.2);
  pdf.setTextColor(27, 54, 93);
  pdf.text("ATC Clearance", 14, 56);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.8);
  pdf.setTextColor(15, 23, 42);
  pdf.text(
    `Cairo control clear for ${data.aircraftReg || "SU-B___"}  to destination  ${
      data.clearanceDest || "____________"
    }   Via  ${data.clearanceVia || "____________________"}`,
    14,
    63
  );
  pdf.text(
    `Climb initially   ${data.clearanceClimb || "____________"}      Squawk   ${
      data.clearanceSquawk || "________"
    }      Director Frequency:   ${data.directorFreq || "___________"}`,
    14,
    70
  );

  // Last Meteorological Report box (y = 75..98)
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(148, 163, 184);
  pdf.rect(14, 75, 182, 22, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.8);
  pdf.setTextColor(27, 54, 93);
  pdf.text("Last Meteorological Report", 105, 80, { align: "center" });

  const drawMet = (lbl: string, val: string, x: number, y: number, valOffset = 16) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(`${lbl}:`, x, y);
    pdf.setTextColor(15, 23, 42);
    pdf.text((val || "____").slice(0, 18), x + valOffset, y);
  };
  drawMet("Wind", data.metWind, 18, 86.5);
  drawMet("Visibility", data.metVis, 64, 86.5);
  drawMet("Clouds", data.metClouds, 114, 86.5);
  drawMet("Temp.", data.metTemp, 160, 86.5);
  drawMet("D.Point", data.metDewPoint, 18, 93.5);
  drawMet("QNH", data.metQnh, 64, 93.5);
  drawMet("Active RWY", data.metActiveRwy, 114, 93.5, 21);

  // 2-Column Communication & Navigation Frequencies (y = 102..246)
  const yFreqStart = 104;
  pdf.setFillColor(27, 54, 93);
  pdf.rect(14, yFreqStart, 88, 7, "F");
  pdf.rect(108, yFreqStart, 88, 7, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text("Communication Frequencies", 58, yFreqStart + 4.8, { align: "center" });
  pdf.text("Navigation Frequencies", 152, yFreqStart + 4.8, { align: "center" });

  const commRows = data.commFreqList;
  const navRows = data.navFreqList;
  const maxRows = Math.max(commRows.length, navRows.length);
  const rowH = Math.min(8.8, 134 / Math.max(1, maxRows));

  for (let i = 0; i < maxRows; i++) {
    const ry = yFreqStart + 7 + i * rowH;
    const cm = commRows[i];
    const nv = navRows[i];

    if (cm) {
      pdf.setFillColor(cm.highlight ? 233 : i % 2 === 0 ? 255 : 248, cm.highlight ? 242 : 250, cm.highlight ? 251 : 252);
      pdf.setDrawColor(203, 213, 225);
      pdf.rect(14, ry, 88, rowH, "FD");
      pdf.setFont("helvetica", cm.highlight ? "bold" : "normal");
      pdf.setFontSize(8.8);
      pdf.setTextColor(cm.highlight ? 27 : 15, cm.highlight ? 54 : 23, cm.highlight ? 93 : 42);
      pdf.text(cm.label, 17, ry + rowH * 0.65);
      pdf.setFont("courier", "bold");
      pdf.text(cm.freq, 99, ry + rowH * 0.65, { align: "right" });
    }

    if (nv) {
      pdf.setFillColor(nv.highlight ? 233 : i % 2 === 0 ? 255 : 248, nv.highlight ? 242 : 250, nv.highlight ? 251 : 252);
      pdf.setDrawColor(203, 213, 225);
      pdf.rect(108, ry, 88, rowH, "FD");
      pdf.setFont("helvetica", nv.highlight ? "bold" : "normal");
      pdf.setFontSize(8.8);
      pdf.setTextColor(nv.highlight ? 27 : 15, nv.highlight ? 54 : 23, nv.highlight ? 93 : 42);
      pdf.text(nv.label, 111, ry + rowH * 0.65);
      pdf.setFont("courier", "bold");
      pdf.text(nv.freq, 193, ry + rowH * 0.65, { align: "right" });
    }
  }

  // Bottom Cairo ACC / AIP Warning Strip
  pdf.setFillColor(254, 243, 199);
  pdf.setDrawColor(245, 158, 11);
  pdf.rect(14, 254, 182, 26, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(146, 64, 14);
  pdf.text(data.airacNote, 105, 260, { align: "center" });
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(7.2);
  pdf.text(
    `Egypt TA: ${data.transitionAltitude}  |  TL: ${data.transitionLevel}  |  Cairo ACC Upper/Luxor: 132.200 / 129.400  |  Sinai: 126.600`,
    105,
    266.5,
    { align: "center" }
  );
  pdf.setFont("helvetica", "normal");
  pdf.text(
    `Highlighted rows = Primary Training & X-Country Aerodromes (HEAT, HELX, HESG, HEKG, HESH) · MFC Ops: ${data.mfcOpsFreq}`,
    105,
    272.5,
    { align: "center" }
  );

  // Page 2: Detailed 5-Airport Matrix + Nav Legs + C172R Kneeboard (Landscape)
  if (data.includeDetailedPage2) {
    pdf.addPage("a4", "landscape");
    if (logoUrl) pdf.addImage(logoUrl, "PNG", 8, 6, 30, 7.5);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(27, 54, 93);
    pdf.text(
      "MFC DETAILED AIRPORT VOR/ILS/COMMS, NAV LEGS & C172R REFERENCE (HEAT · HELX · HESG · HEKG · HESH)",
      154,
      11,
      { align: "center" }
    );
    pdf.setFontSize(7);
    pdf.setTextColor(180, 83, 9);
    pdf.text(data.airacNote, 154, 15.5, { align: "center" });

    // Detailed Airport Table (y = 18..98)
    const apCols = [
      { title: "ICAO / Airport", w: 32 },
      { title: "Elev & Coords", w: 32 },
      { title: "Runways", w: 31 },
      { title: "VOR / DME", w: 28 },
      { title: "ILS / App Aid", w: 36 },
      { title: "ATIS", w: 18 },
      { title: "Ground", w: 18 },
      { title: "Tower", w: 26 },
      { title: "Approach", w: 24 },
      { title: "Notes", w: 42 },
    ]; // sum = 287mm (x=5..292)

    let ax = 5;
    pdf.setFillColor(27, 54, 93);
    pdf.rect(5, 18, 287, 6.5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.8);
    pdf.setTextColor(255, 255, 255);
    apCols.forEach((c) => {
      pdf.text(c.title, ax + c.w / 2, 22.3, { align: "center" });
      ax += c.w;
    });

    const apRowH = Math.min(13.5, 76 / Math.max(1, data.airports.length));
    data.airports.forEach((ap, idx) => {
      const ry = 24.5 + idx * apRowH;
      pdf.setFillColor(idx % 2 === 0 ? 233 : 255, idx % 2 === 0 ? 242 : 255, idx % 2 === 0 ? 251 : 255);
      pdf.setDrawColor(148, 163, 184);
      pdf.rect(5, ry, 287, apRowH, "FD");
      const vals = [
        `${ap.icao} (${ap.iata})\n${ap.name}`,
        `${ap.elevationFt} ft MSL\n${ap.coordsDms}`,
        ap.runways,
        `${ap.vorIdent} ${ap.vorFreq}\n${ap.vorNote}`,
        ap.ilsInfo,
        ap.atis,
        ap.ground,
        ap.tower,
        ap.approach,
        ap.notes,
      ];
      let cx = 5;
      vals.forEach((v, ci) => {
        pdf.line(cx, ry, cx, ry + apRowH);
        pdf.setFont("helvetica", ci === 0 || ci === 3 || ci === 7 ? "bold" : "normal");
        pdf.setFontSize(6.1);
        pdf.setTextColor(ci === 0 ? 27 : 15, ci === 0 ? 54 : 23, ci === 0 ? 93 : 42);
        const lines = pdf.splitTextToSize(v || "-", apCols[ci].w - 2) as string[];
        pdf.text(lines.slice(0, 3), cx + 1, ry + 4.0);
        cx += apCols[ci].w;
      });
    });

    // Bottom 3 Panels (y = 104..201)
    const yPan = 24.5 + data.airports.length * apRowH + 4;
    const panH = Math.max(70, 202 - yPan);
    const panels = [
      { x: 5, w: 94, title: "EN-ROUTE (CAIRO FIR HECC) & OPS NOTES" },
      { x: 101.5, w: 94, title: "DIRECT LEGS (TRUE/MAG TRACK · C172 @ 100 KT)" },
      { x: 198, w: 94, title: "C172R V-SPEEDS, SQUAWKS & LIGHT GUN" },
    ];
    panels.forEach((p) => {
      pdf.setDrawColor(27, 54, 93);
      pdf.rect(p.x, yPan, p.w, panH);
      pdf.setFillColor(27, 54, 93);
      pdf.rect(p.x, yPan, p.w, 6, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.6);
      pdf.setTextColor(255, 255, 255);
      pdf.text(p.title, p.x + p.w / 2, yPan + 4.1, { align: "center" });
    });

    // Panel 1 content: En-Route + Extra Notes
    let p1y = yPan + 10;
    data.enroute.forEach((er) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.2);
      pdf.setTextColor(27, 54, 93);
      pdf.text(`${er.unit} — ${er.sector}`, 7, p1y);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(15, 23, 42);
      pdf.text(`Pri: ${er.primaryFreq} | Sec: ${er.secondaryFreq}`, 7, p1y + 3.2);
      p1y += 7.5;
    });
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(192, 0, 0);
    pdf.text("KEY OPERATIONAL REMINDERS:", 7, p1y + 1);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.8);
    pdf.setTextColor(15, 23, 42);
    const extraWrapped = pdf.splitTextToSize(data.extraNotes, 90) as string[];
    pdf.text(extraWrapped.slice(0, 7), 7, p1y + 4.5);

    // Panel 2 content: Direct Nav Legs
    const apByIcao = new Map(data.airports.map((a) => [a.icao.toUpperCase(), a]));
    const legPairs: Array<[string, string]> = [
      ["HEAT", "HESG"],
      ["HEAT", "HELX"],
      ["HEAT", "HEKG"],
      ["HEAT", "HESH"],
      ["HESG", "HELX"],
      ["HELX", "HEKG"],
      ["HELX", "HESH"],
    ];
    let p2y = yPan + 10;
    legPairs.forEach(([f, t]) => {
      const a = apByIcao.get(f);
      const b = apByIcao.get(t);
      if (!a || !b) return;
      const m = computeLegMetrics(a, b, 100);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.3);
      pdf.setTextColor(27, 54, 93);
      pdf.text(`${f} - ${t}:`, 103.5, p2y);
      pdf.setFont("courier", "bold");
      pdf.setFontSize(6.2);
      pdf.setTextColor(15, 23, 42);
      pdf.text(
        `${m.distanceNm} NM | TRK ${formatDeg3(m.magTrackDeg)}/${formatDeg3(m.revMagTrackDeg)}M | ${m.eteStr}`,
        127,
        p2y
      );
      p2y += 6.2;
    });

    // Panel 3 content: V-Speeds + Squawk + Light Gun
    let p3y = yPan + 9.5;
    C172_QUICK_REF.slice(0, 10).forEach((item) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(5.9);
      pdf.setTextColor(27, 54, 93);
      pdf.text(item.label, 200, p3y);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(15, 23, 42);
      pdf.text(item.value, 290, p3y, { align: "right" });
      p3y += 3.9;
    });
    p3y += 1.5;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.1);
    pdf.setTextColor(192, 0, 0);
    pdf.text("TRANSPONDER SQUAWKS:", 200, p3y);
    p3y += 3.5;
    SQUAWK_CODES.slice(0, 4).forEach((sq) => {
      pdf.setFont("courier", "bold");
      pdf.setTextColor(192, 0, 0);
      pdf.text(sq.label, 200, p3y);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(15, 23, 42);
      pdf.text(sq.value, 211, p3y);
      p3y += 3.5;
    });
    p3y += 1.5;
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(27, 54, 93);
    pdf.text("ATC LIGHT GUN:", 200, p3y);
    p3y += 3.5;
    ATC_LIGHT_SIGNALS.slice(0, 4).forEach((ls) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(5.5);
      pdf.text(ls.color, 200, p3y);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Gnd: ${ls.ground} | Air: ${ls.air}`, 222, p3y);
      p3y += 3.4;
    });
  }

  pdf.save("MFC_VOR_Comms_Clearance_Egypt.pdf");
}
