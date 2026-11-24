import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
} from "docx";
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

function mmToDxa(mm: number): number {
  return Math.round(mm * 56.6929133858);
}

const FONT_EN = "Calibri";
const FONT_MODERN_EN = "Segoe UI";
const FONT_AR = "Arial";
const BLACK = "000000";
const RED = "C00000";
const BLUE_BAND = "BDD7EE";
const WHITE = "FFFFFF";

// Modern palette
const MOD_NAVY = "1B365D";
const MOD_SLATE_HDR = "F1F5F9";
const MOD_ALT_BLUE = "E9F2FB";
const MOD_CONT_TEXT = "1D4ED8";
const MOD_NOTES_BG = "FFFDF7";
const MOD_STANDBY_BG = "F8FAFC";
const MOD_DARK = "0F172A";
const MOD_SUBTLE = "64748B";
const MOD_GRID_BORDER = "CBD5E1";
const MOD_ROW_BORDER = "94A3B8";

const B_NIL = { style: BorderStyle.NIL, size: 0, color: "auto" } as const;
const B_THICK = { style: BorderStyle.SINGLE, size: 14, color: BLACK } as const;
const B_MED = { style: BorderStyle.SINGLE, size: 8, color: BLACK } as const;
const B_THIN = { style: BorderStyle.SINGLE, size: 4, color: BLACK } as const;
const B_INNER = { style: BorderStyle.SINGLE, size: 6, color: BLACK } as const;
const B_OUTER = { style: BorderStyle.SINGLE, size: 16, color: BLACK } as const;
const B_RED = { style: BorderStyle.SINGLE, size: 8, color: RED } as const;
const B_GRID_V = { style: BorderStyle.SINGLE, size: 4, color: "505A69" } as const;
const B_GRID_H = { style: BorderStyle.SINGLE, size: 4, color: "8C9BAA" } as const;

const NO_TABLE_BORDERS = {
  top: B_NIL,
  bottom: B_NIL,
  left: B_NIL,
  right: B_NIL,
  insideHorizontal: B_NIL,
  insideVertical: B_NIL,
} as const;

function makeParagraph(
  text: string,
  opts: {
    sizeHalfPt?: number;
    bold?: boolean;
    italic?: boolean;
    fontName?: string;
    color?: string;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    lineTwip?: number;
    beforeTwip?: number;
    afterTwip?: number;
    underline?: boolean;
    rtl?: boolean;
  } = {}
): Paragraph {
  const {
    sizeHalfPt = 15,
    bold = true,
    italic = false,
    fontName,
    color = BLACK,
    align = AlignmentType.CENTER,
    lineTwip,
    beforeTwip = 0,
    afterTwip = 0,
    underline = false,
    rtl = false,
  } = opts;

  return new Paragraph({
    alignment: align,
    bidirectional: rtl,
    spacing: {
      before: beforeTwip,
      after: afterTwip,
      ...(lineTwip ? { line: lineTwip, lineRule: "exact" } : { line: 240 }),
    },
    children: text
      ? [
          new TextRun({
            text,
            font: fontName || (rtl ? FONT_AR : FONT_EN),
            size: Math.round(sizeHalfPt),
            bold,
            italics: italic,
            color,
            ...(underline ? { underline: { type: UnderlineType.SINGLE, color } } : {}),
          }),
        ]
      : [],
  });
}

async function fetchLogoBytes(): Promise<Uint8Array | null> {
  try {
    const res = await fetch("/mfc-logo.png");
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export function buildClassicScheduleDocxDocument(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  logoBytes: Uint8Array | null,
  lang: ExportLang = "EN"
): Document {
  const isAr = lang === "AR";
  const totals = calcScheduleTotals(schedule, aircraft);
  const stuMap = new Map(students.map((s) => [s.id, s]));

  const fitInstructors = instructors.filter((i) => i.fit).length;
  const unfitInstructors = instructors.length - fitInstructors;
  const fitStudents = students.filter((s) => s.fit).length;
  const unfitStudents = students.length - fitStudents;
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
        mission: "المأمورية",
        pilot: "الطيار",
        student: "الطالب",
        aircraft: "الطائرة",
        timeFromTo: "التوقيت من و إلى",
        flight: "ساعات",
        hours: "الطيران",
        solo: "منفرد",
        dual: "مزدوج",
        standby: "احتياطي",
        notes: "ملاحظات",
        totalHours: "إجمالي الساعات",
        operations: "العمليات",
        monitoring: "المراقبة",
        massBriefing: "Mass Briefing",
        exams: "Exams",
        wForecast: "W. Forecast",
        wind: "Wind (D/KTS)",
        temp: "TEMP (°C)",
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
        flight: "Flight",
        hours: "Hours",
        solo: "Solo",
        dual: "Dual",
        standby: "Standby",
        notes: "Notes",
        totalHours: "Total Hours",
        operations: "Operations",
        monitoring: "Monitoring",
        massBriefing: "Mass Briefing",
        exams: "Exams",
        wForecast: "W. Forecast",
        wind: "Wind (D/KTS)",
        temp: "TEMP (°C)",
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

  // =========================================================================
  // A. TOP HEADER TABLE (85, 115, 85 mm = 285 mm)
  // =========================================================================
  const hdrTable = new Table({
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: isAr,
    width: { size: mmToDxa(285), type: WidthType.DXA },
    columnWidths: [mmToDxa(85), mmToDxa(115), mmToDxa(85)],
    borders: NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        height: { value: mmToDxa(15.5), rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: mmToDxa(85), type: WidthType.DXA },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 0, bottom: 6, left: 8, right: 8 },
            borders: { top: B_NIL, bottom: B_NIL, left: B_NIL, right: B_NIL },
            children: [
              makeParagraph(lbl.ministry, {
                sizeHalfPt: 18,
                align: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
                lineTwip: 215,
                rtl: isAr,
              }),
              makeParagraph(lbl.academy, {
                sizeHalfPt: 18,
                align: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
                lineTwip: 215,
                rtl: isAr,
              }),
              makeParagraph(lbl.college, {
                sizeHalfPt: 18,
                align: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
                lineTwip: 215,
                rtl: isAr,
              }),
            ],
          }),
          new TableCell({
            width: { size: mmToDxa(115), type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 6, left: 8, right: 8 },
            borders: { top: B_NIL, bottom: B_NIL, left: B_NIL, right: B_NIL },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: logoBytes
                  ? [
                      new ImageRun({
                        type: "png",
                        data: logoBytes,
                        transformation: { width: 265, height: 49 },
                      }),
                    ]
                  : [
                      new TextRun({
                        text: "MFC — EGYPTIAN AVIATION ACADEMY\nMisr Flying College",
                        font: FONT_EN,
                        size: 18,
                        bold: true,
                        color: "1B365D",
                      }),
                    ],
              }),
            ],
          }),
          new TableCell({
            width: { size: mmToDxa(85), type: WidthType.DXA },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 0, bottom: 6, left: 8, right: 8 },
            borders: { top: B_NIL, bottom: B_NIL, left: B_NIL, right: B_NIL },
            children: [
              makeParagraph(lbl.commander, {
                sizeHalfPt: 18,
                align: isAr ? AlignmentType.LEFT : AlignmentType.RIGHT,
                lineTwip: 220,
                rtl: isAr,
              }),
              makeParagraph(
                `${isAr ? "\u200F" : ""}${lbl.signature} ${
                  isAr
                    ? translateOfficerToArabic(schedule.missionCommander) || "ك/ ..............."
                    : schedule.missionCommander || "Capt. _____________"
                }`,
                {
                  sizeHalfPt: 18,
                  align: isAr ? AlignmentType.LEFT : AlignmentType.RIGHT,
                  lineTwip: 230,
                  beforeTwip: 35,
                  rtl: isAr,
                }
              ),
            ],
          }),
        ],
      }),
    ],
  });

  // =========================================================================
  // B. TITLE PARAGRAPH
  // =========================================================================
  const titlePara = makeParagraph(lbl.title, {
    sizeHalfPt: 20,
    bold: true,
    align: AlignmentType.CENTER,
    beforeTwip: 15,
    afterTwip: 45,
    underline: true,
    rtl: isAr,
  });

  // =========================================================================
  // C. MAIN SCHEDULE TABLE (45 columns, 285 mm total width)
  // =========================================================================
  const mainColWidthsMm = [20.5, 27.5, 13.0, ...Array(40).fill(5.1), 10.0, 10.0];
  const mainColWidthsDxa = mainColWidthsMm.map(mmToDxa);

  const pilotParas: Paragraph[] = instructors.length
    ? instructors.map((inst) =>
        makeParagraph(
          isAr ? inst.nameAr || translateOfficerToArabic(inst.name) : inst.name,
          {
            sizeHalfPt: 14.5,
            align: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
            lineTwip: 215,
            rtl: isAr,
          }
        )
      )
    : [makeParagraph("", { sizeHalfPt: 14.5, align: AlignmentType.LEFT })];

  const ircplStudents = students.filter((s) => s.program === "IRCPL");
  const pplStudents = students.filter((s) => s.program === "PPL");
  const studentCount = Math.max(students.length, 1);
  const stuSizeHalfPt = studentCount > 34 ? 12 : 13.5;
  const stuLineTwip = studentCount > 34 ? 152 : 174;
  const stuAlign = isAr ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const fmtStu = (num: number, s: Student) => {
    const nm = isAr ? s.nameAr || s.name : s.name;
    return isAr
      ? `\u200F${num}- ${nm}${s.fit ? "" : " (غير لائق)"}`
      : `${num}. ${nm}${s.fit ? "" : " (U)"}`;
  };

  const studentParas: Paragraph[] =
    ircplStudents.length > 0
      ? [
          makeParagraph("IRCPL", { sizeHalfPt: 15, color: RED, align: AlignmentType.CENTER, lineTwip: 190 }),
          ...ircplStudents.map((s, idx) =>
            makeParagraph(fmtStu(idx + 1, s), {
              sizeHalfPt: stuSizeHalfPt,
              color: RED,
              align: stuAlign,
              lineTwip: stuLineTwip,
              rtl: isAr,
            })
          ),
          makeParagraph("PPL", {
            sizeHalfPt: 15,
            color: BLACK,
            align: AlignmentType.CENTER,
            lineTwip: 190,
            beforeTwip: 30,
          }),
          ...pplStudents.map((s, idx) =>
            makeParagraph(fmtStu(ircplStudents.length + idx + 1, s), {
              sizeHalfPt: stuSizeHalfPt,
              color: BLACK,
              align: stuAlign,
              lineTwip: stuLineTwip,
              rtl: isAr,
            })
          ),
        ]
      : pplStudents.map((s, idx) =>
          makeParagraph(fmtStu(idx + 1, s), {
            sizeHalfPt: stuSizeHalfPt,
            color: BLACK,
            align: stuAlign,
            lineTwip: stuLineTwip,
            rtl: isAr,
          })
        );

  const displayAircraft: (Aircraft | null)[] = [...aircraft];
  while (displayAircraft.length < 8) {
    displayAircraft.push(null);
  }
  const acCount = displayAircraft.length;
  const subRowHeightMm = Math.min(6.0, 114.0 / (acCount * 2));
  const bodySpanRows = acCount * 2 + 3; // aircraft sub-rows + 1 standby row + 2 notes/totals rows

  // Header Row 0
  const row0 = new TableRow({
    height: { value: mmToDxa(5.0), rule: HeightRule.EXACT },
    children: [
      new TableCell({
        columnSpan: 2,
        width: { size: mmToDxa(48), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 6, bottom: 6, left: 10, right: 10 },
        borders: { top: B_THICK, left: B_THICK, bottom: B_MED, right: B_MED },
        children: [makeParagraph(lbl.mission, { sizeHalfPt: 18, rtl: isAr })],
      }),
      new TableCell({
        rowSpan: 3,
        width: { size: mmToDxa(13), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 6, bottom: 6, left: 8, right: 8 },
        borders: { top: B_THICK, left: B_MED, bottom: B_MED, right: B_MED },
        children: [makeParagraph(lbl.aircraft, { sizeHalfPt: 17, rtl: isAr })],
      }),
      new TableCell({
        columnSpan: 40,
        width: { size: mmToDxa(204), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 6, bottom: 6, left: 10, right: 10 },
        borders: { top: B_THICK, left: B_MED, bottom: B_MED, right: B_MED },
        children: [makeParagraph(lbl.timeFromTo, { sizeHalfPt: 18.5, rtl: isAr })],
      }),
      new TableCell({
        columnSpan: 2,
        rowSpan: 2,
        width: { size: mmToDxa(20), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 6, bottom: 6, left: 6, right: 6 },
        borders: { top: B_THICK, left: B_MED, bottom: B_MED, right: B_THICK },
        children: [
          makeParagraph(lbl.flight, { sizeHalfPt: 16.5, lineTwip: 175, rtl: isAr }),
          makeParagraph(lbl.hours, { sizeHalfPt: 16.5, lineTwip: 175, rtl: isAr }),
        ],
      }),
    ],
  });

  // Header Row 1
  const row1 = new TableRow({
    height: { value: mmToDxa(4.6), rule: HeightRule.EXACT },
    children: [
      new TableCell({
        rowSpan: 2,
        width: { size: mmToDxa(20.5), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 6, bottom: 6, left: 8, right: 8 },
        borders: { top: B_MED, left: B_THICK, bottom: B_MED, right: B_THIN },
        children: [makeParagraph(lbl.pilot, { sizeHalfPt: 16.5, rtl: isAr })],
      }),
      new TableCell({
        rowSpan: 2,
        width: { size: mmToDxa(27.5), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 6, bottom: 6, left: 8, right: 8 },
        borders: { top: B_MED, left: B_THIN, bottom: B_MED, right: B_MED },
        children: [makeParagraph(lbl.student, { sizeHalfPt: 16.5, rtl: isAr })],
      }),
      ...Array.from({ length: 10 }, (_, sIdx) => {
        const timeText = schedule.timeSlots[sIdx] || "";
        return new TableCell({
          columnSpan: 4,
          width: { size: mmToDxa(20.4), type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 6, bottom: 6, left: 16, right: 10 },
          borders: {
            top: B_MED,
            bottom: B_THIN,
            left: sIdx === 0 ? B_MED : B_THIN,
            right: sIdx === 9 ? B_MED : B_THIN,
          },
          children: [
            makeParagraph(timeText, {
              sizeHalfPt: 15.5,
              align: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
            }),
          ],
        });
      }),
    ],
  });

  // Header Row 2
  const row2 = new TableRow({
    height: { value: mmToDxa(4.2), rule: HeightRule.EXACT },
    children: [
      ...Array.from({ length: 40 }, (_, qGlobal) => {
        const qLabel = (["00", "15", "30", "45"] as const)[qGlobal % 4];
        return new TableCell({
          width: { size: mmToDxa(5.1), type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 4, bottom: 4, left: 2, right: 2 },
          borders: {
            top: B_THIN,
            bottom: B_MED,
            left: qGlobal === 0 ? B_MED : B_THIN,
            right: qGlobal === 39 ? B_MED : B_THIN,
          },
          children: [makeParagraph(qLabel, { sizeHalfPt: 13 })],
        });
      }),
      new TableCell({
        width: { size: mmToDxa(10), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 4, bottom: 4, left: 4, right: 4 },
        borders: { top: B_MED, left: B_MED, bottom: B_MED, right: B_RED },
        children: [makeParagraph(lbl.solo, { sizeHalfPt: 15.5, color: RED, rtl: isAr })],
      }),
      new TableCell({
        width: { size: mmToDxa(10), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 4, bottom: 4, left: 4, right: 4 },
        borders: { top: B_MED, left: B_RED, bottom: B_MED, right: B_THICK },
        children: [makeParagraph(lbl.dual, { sizeHalfPt: 15.5, color: BLACK, rtl: isAr })],
      }),
    ],
  });

  // Aircraft Body Rows
  const bodyRows: TableRow[] = [];
  displayAircraft.forEach((ac, acIdx) => {
    const isBand = acIdx % 2 === 0;
    const fillHex = isBand ? BLUE_BAND : WHITE;
    const topB = acIdx === 0 ? B_MED : B_THIN;
    const botB = acIdx === acCount - 1 ? B_MED : B_THIN;

    const rawReg = ac?.registration || "";
    const shownReg = isAr && rawReg.toUpperCase() === "EXTRA" ? "" : rawReg;
    const regLines = shownReg
      ? shownReg.includes("-")
        ? [shownReg.split("-")[0] + "-", shownReg.split("-").slice(1).join("-")]
        : [shownReg]
      : [""];

    const hours = ac ? calcAircraftHours(ac.id, schedule.grid) : { soloMin: 0, dualMin: 0 };
    const soloText = ac ? formatMinutes(hours.soloMin, "-") : "-";
    const dualText = ac ? formatMinutes(hours.dualMin, "-") : "-";

    const topCells: TableCell[] = [];
    const botCells: TableCell[] = [];

    if (acIdx === 0) {
      topCells.push(
        new TableCell({
          rowSpan: bodySpanRows,
          width: { size: mmToDxa(20.5), type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          margins: { top: 26, bottom: 18, left: 16, right: 14 },
          borders: { top: B_MED, left: B_THICK, bottom: B_THICK, right: B_THIN },
          children: pilotParas,
        }),
        new TableCell({
          rowSpan: bodySpanRows,
          width: { size: mmToDxa(27.5), type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          margins: { top: 20, bottom: 16, left: 16, right: 10 },
          borders: { top: B_MED, left: B_THIN, bottom: B_THICK, right: B_MED },
          children: studentParas,
        })
      );
    }

    topCells.push(
      new TableCell({
        rowSpan: 2,
        width: { size: mmToDxa(13), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 6, bottom: 6, left: 6, right: 6 },
        borders: { top: topB, bottom: botB, left: B_MED, right: B_MED },
        children: regLines.map((ln) => makeParagraph(ln, { sizeHalfPt: 17, lineTwip: 185 })),
      })
    );

    for (let sIdx = 0; sIdx < 10; sIdx++) {
      const sortie = ac ? schedule.grid[ac.id]?.[sIdx] : undefined;
      const disp = sortie ? formatSortieDisplay(sortie, instructors, students, lang) : null;
      const clr = sortie?.type === "SOLO" ? RED : BLACK;

      topCells.push(
        new TableCell({
          columnSpan: 4,
          width: { size: mmToDxa(20.4), type: WidthType.DXA },
          verticalAlign: VerticalAlign.BOTTOM,
          shading: { fill: fillHex, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 4, bottom: 2, left: 2, right: 2 },
          borders: {
            top: topB,
            bottom: B_GRID_H,
            left: sIdx === 0 ? B_MED : B_GRID_V,
            right: sIdx === 9 ? B_MED : B_GRID_V,
          },
          children: [makeParagraph(disp?.topLine || "", { sizeHalfPt: 11.4, color: clr, rtl: isAr })],
        })
      );

      botCells.push(
        new TableCell({
          columnSpan: 4,
          width: { size: mmToDxa(20.4), type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          shading: { fill: fillHex, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 2, bottom: 4, left: 2, right: 2 },
          borders: {
            top: B_GRID_H,
            bottom: botB,
            left: sIdx === 0 ? B_MED : B_GRID_V,
            right: sIdx === 9 ? B_MED : B_GRID_V,
          },
          children: [makeParagraph(disp?.bottomLine || "", { sizeHalfPt: 12.0, color: clr, rtl: isAr })],
        })
      );
    }

    topCells.push(
      new TableCell({
        rowSpan: 2,
        width: { size: mmToDxa(10), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 4, bottom: 4, left: 4, right: 4 },
        borders: { top: topB, bottom: botB, left: B_MED, right: B_RED },
        children: [makeParagraph(soloText, { sizeHalfPt: 15.5, color: RED })],
      }),
      new TableCell({
        rowSpan: 2,
        width: { size: mmToDxa(10), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 4, bottom: 4, left: 4, right: 4 },
        borders: { top: topB, bottom: botB, left: B_RED, right: B_THICK },
        children: [makeParagraph(dualText, { sizeHalfPt: 15.5, color: BLACK })],
      })
    );

    bodyRows.push(
      new TableRow({
        height: { value: mmToDxa(subRowHeightMm), rule: HeightRule.EXACT },
        cantSplit: true,
        children: topCells,
      }),
      new TableRow({
        height: { value: mmToDxa(subRowHeightMm), rule: HeightRule.EXACT },
        cantSplit: true,
        children: botCells,
      })
    );
  });

  // Standby Row (directly above Notes)
  const standbyEntries = schedule.standby || [];
  const standbyRow = new TableRow({
    height: { value: mmToDxa(5.6), rule: HeightRule.EXACT },
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: mmToDxa(13), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 4, bottom: 4, left: 4, right: 4 },
        borders: { top: B_MED, bottom: B_MED, left: B_MED, right: B_MED },
        children: [makeParagraph(lbl.standby, { sizeHalfPt: 15, rtl: isAr })],
      }),
      ...Array.from({ length: 10 }, (_, sIdx) => {
        const sb = standbyEntries[sIdx];
        const sbStu = sb ? stuMap.get(sb.studentId) : undefined;
        const sbName = sbStu ? (isAr ? sbStu.nameAr || sbStu.name : sbStu.name) : "";
        return new TableCell({
          columnSpan: 4,
          width: { size: mmToDxa(20.4), type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          shading: { fill: BLUE_BAND, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 4, bottom: 4, left: 2, right: 2 },
          borders: {
            top: B_MED,
            bottom: B_MED,
            left: sIdx === 0 ? B_MED : B_GRID_V,
            right: sIdx === 9 ? B_MED : B_GRID_V,
          },
          children: [makeParagraph(sbName, { sizeHalfPt: 12.5, color: sb?.highlight ? RED : BLACK, rtl: isAr })],
        });
      }),
      new TableCell({
        width: { size: mmToDxa(10), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        borders: { top: B_MED, bottom: B_MED, left: B_MED, right: B_RED },
        children: [makeParagraph("-", { sizeHalfPt: 14, color: RED })],
      }),
      new TableCell({
        width: { size: mmToDxa(10), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        borders: { top: B_MED, bottom: B_MED, left: B_RED, right: B_THICK },
        children: [makeParagraph("-", { sizeHalfPt: 14, color: BLACK })],
      }),
    ],
  });

  // Notes & Totals Rows
  const notesToRender = isAr ? ARABIC_DEFAULT_NOTES : schedule.notes;
  const notesRowTop = new TableRow({
    height: { value: mmToDxa(4.8), rule: HeightRule.EXACT },
    cantSplit: true,
    children: [
      new TableCell({
        rowSpan: 2,
        width: { size: mmToDxa(13), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 6, bottom: 6, left: 6, right: 6 },
        borders: { top: B_MED, bottom: B_THICK, left: B_MED, right: B_MED },
        children: [makeParagraph(lbl.notes, { sizeHalfPt: 16.5, rtl: isAr })],
      }),
      new TableCell({
        columnSpan: 40,
        rowSpan: 2,
        width: { size: mmToDxa(204), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 8, bottom: 8, left: 16, right: 16 },
        borders: { top: B_MED, bottom: B_THICK, left: B_MED, right: B_MED },
        children: notesToRender.map((n, idx) =>
          makeParagraph(n.text, {
            sizeHalfPt: 14.5,
            color: n.highlight ? RED : BLACK,
            underline: Boolean(n.highlight),
            lineTwip: 185,
            beforeTwip: idx === 0 ? 0 : 18,
            rtl: isAr,
          })
        ),
      }),
      new TableCell({
        columnSpan: 2,
        width: { size: mmToDxa(20), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 4, bottom: 4, left: 4, right: 4 },
        borders: { top: B_MED, bottom: B_THIN, left: B_MED, right: B_THICK },
        children: [makeParagraph(lbl.totalHours, { sizeHalfPt: 14.5, rtl: isAr })],
      }),
    ],
  });

  const notesRowBot = new TableRow({
    height: { value: mmToDxa(8.5), rule: HeightRule.EXACT },
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: mmToDxa(10), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 4, bottom: 4, left: 2, right: 2 },
        borders: { top: B_THIN, bottom: B_THICK, left: B_MED, right: B_RED },
        children: [makeParagraph(formatMinutes(totals.totalSoloMin, "0:00"), { sizeHalfPt: 15.5, color: RED })],
      }),
      new TableCell({
        width: { size: mmToDxa(10), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 4, bottom: 4, left: 2, right: 2 },
        borders: { top: B_THIN, bottom: B_THICK, left: B_RED, right: B_THICK },
        children: [makeParagraph(formatMinutes(totals.totalDualMin, "0:00"), { sizeHalfPt: 15.5, color: BLACK })],
      }),
    ],
  });

  const mainTable = new Table({
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: isAr,
    width: { size: mmToDxa(285), type: WidthType.DXA },
    columnWidths: mainColWidthsDxa,
    borders: NO_TABLE_BORDERS,
    rows: [row0, row1, row2, ...bodyRows, standbyRow, notesRowTop, notesRowBot],
  });

  // =========================================================================
  // D. BOTTOM SUMMARY TABLE (16 columns, 285 mm total width)
  // =========================================================================
  const botWidthsMm = [21.5, 21.5, 24.0, 19.0, 12.5, 14.5, 14.5, 19.0, 11.0, 10.0, 10.0, 17.5, 18.5, 21.5, 3.0, 47.0];
  const botWidthsDxa = botWidthsMm.map(mmToDxa);

  const w0 = schedule.weather[0] || { time: "9 AM", wind: "", temp: "" };
  const w1 = schedule.weather[1] || { time: "12 PM", wind: "", temp: "" };
  const w2 = schedule.weather[2] || { time: "3 PM", wind: "", temp: "" };

  const makeWindParas = (wind: string): Paragraph[] => {
    const lines = (wind || "").split("\n");
    return lines.map((l) => makeParagraph(l, { sizeHalfPt: 13.0, lineTwip: 150 }));
  };

  const botTable = new Table({
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: isAr,
    width: { size: mmToDxa(285), type: WidthType.DXA },
    columnWidths: botWidthsDxa,
    borders: NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        height: { value: mmToDxa(5.0), rule: HeightRule.EXACT },
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: botWidthsDxa[0], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_OUTER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.operations, { sizeHalfPt: 15, rtl: isAr })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[1], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.monitoring, { sizeHalfPt: 15, rtl: isAr })],
          }),
          new TableCell({
            rowSpan: 2,
            width: { size: botWidthsDxa[2], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [
              makeParagraph(
                schedule.massBriefing ? `${lbl.massBriefing}\n${schedule.massBriefing}` : lbl.massBriefing,
                { sizeHalfPt: 15 }
              ),
            ],
          }),
          new TableCell({
            width: { size: botWidthsDxa[3], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.wForecast, { sizeHalfPt: 14.8 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[4], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(w0.time || "9 AM", { sizeHalfPt: 14.8 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[5], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(w1.time || "12 PM", { sizeHalfPt: 14.8 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[6], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(w2.time || "3 PM", { sizeHalfPt: 14.8 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[7], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.fitness, { sizeHalfPt: 15, rtl: isAr })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[8], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.total, { sizeHalfPt: 15, rtl: isAr })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[9], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.fit, { sizeHalfPt: 15, rtl: isAr })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[10], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.unfit, { sizeHalfPt: 14.5, rtl: isAr })],
          }),
          new TableCell({
            columnSpan: 2,
            width: { size: mmToDxa(36), type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.acServiceability, { sizeHalfPt: 14.5, rtl: isAr })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[13], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_OUTER, left: B_INNER, bottom: B_INNER, right: B_OUTER },
            children: [makeParagraph(lbl.totalHours, { sizeHalfPt: 14.8, rtl: isAr })],
          }),
          new TableCell({
            rowSpan: 3,
            width: { size: botWidthsDxa[14], type: WidthType.DXA },
            borders: { top: B_NIL, left: B_NIL, bottom: B_NIL, right: B_NIL },
            children: [makeParagraph("", { sizeHalfPt: 14 })],
          }),
          new TableCell({
            rowSpan: 3,
            width: { size: botWidthsDxa[15], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 6, right: 6 },
            borders: { top: B_NIL, left: B_NIL, bottom: B_NIL, right: B_NIL },
            children: [
              makeParagraph(lbl.opsManager, {
                sizeHalfPt: 17.5,
                align: isAr ? AlignmentType.LEFT : AlignmentType.RIGHT,
                lineTwip: 220,
                rtl: isAr,
              }),
              makeParagraph(
                `${isAr ? "\u200F" : ""}${lbl.signature} ${
                  isAr
                    ? translateOfficerToArabic(schedule.operationsManager) || "ك/ ..............."
                    : schedule.operationsManager || "Capt. _____________"
                }`,
                {
                  sizeHalfPt: 17.5,
                  align: isAr ? AlignmentType.LEFT : AlignmentType.RIGHT,
                  lineTwip: 230,
                  beforeTwip: 50,
                  rtl: isAr,
                }
              ),
            ],
          }),
        ],
      }),
      new TableRow({
        height: { value: mmToDxa(7.0), rule: HeightRule.EXACT },
        cantSplit: true,
        children: [
          new TableCell({
            rowSpan: 2,
            width: { size: botWidthsDxa[0], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_OUTER, bottom: B_OUTER, right: B_INNER },
            children: [
              makeParagraph(
                isAr
                  ? translateOfficerToArabic(schedule.operationsOfficer)
                  : schedule.operationsOfficer || "",
                { sizeHalfPt: 16, rtl: isAr }
              ),
            ],
          }),
          new TableCell({
            rowSpan: 2,
            width: { size: botWidthsDxa[1], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [
              makeParagraph(
                isAr
                  ? translateOfficerToArabic(schedule.monitoringOfficer)
                  : schedule.monitoringOfficer || "",
                { sizeHalfPt: 16, rtl: isAr }
              ),
            ],
          }),
          new TableCell({
            width: { size: botWidthsDxa[3], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.wind, { sizeHalfPt: 14 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[4], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: makeWindParas(w0.wind),
          }),
          new TableCell({
            width: { size: botWidthsDxa[5], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: makeWindParas(w1.wind),
          }),
          new TableCell({
            width: { size: botWidthsDxa[6], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: makeWindParas(w2.wind),
          }),
          new TableCell({
            width: { size: botWidthsDxa[7], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.instructors, { sizeHalfPt: 14.5, rtl: isAr })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[8], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(String(instructors.length), { sizeHalfPt: 15.2 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[9], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(String(fitInstructors), { sizeHalfPt: 15.2 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[10], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(String(unfitInstructors), { sizeHalfPt: 15.2 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[11], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.serviceable, { sizeHalfPt: 14, rtl: isAr })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[12], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_INNER, right: B_INNER },
            children: [makeParagraph(lbl.unserviceable, { sizeHalfPt: 13.5, rtl: isAr })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[13], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_INNER, right: B_OUTER },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                bidirectional: isAr,
                spacing: { before: 0, after: 0 },
                children: [
                  new TextRun({ text: lbl.solo, font: isAr ? FONT_AR : FONT_EN, size: 15, bold: true, color: RED }),
                  new TextRun({ text: " + ", font: isAr ? FONT_AR : FONT_EN, size: 15, bold: true, color: BLACK }),
                  new TextRun({ text: lbl.dual, font: isAr ? FONT_AR : FONT_EN, size: 15, bold: true, color: BLACK }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        height: { value: mmToDxa(5.0), rule: HeightRule.EXACT },
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: botWidthsDxa[2], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [makeParagraph(schedule.exams ? `${lbl.exams}: ${schedule.exams}` : lbl.exams, { sizeHalfPt: 15 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[3], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [makeParagraph(lbl.temp, { sizeHalfPt: 14 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[4], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [makeParagraph(w0.temp, { sizeHalfPt: 15.2 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[5], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [makeParagraph(w1.temp, { sizeHalfPt: 15.2 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[6], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [makeParagraph(w2.temp, { sizeHalfPt: 15.2 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[7], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [makeParagraph(lbl.students, { sizeHalfPt: 14.5, rtl: isAr })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[8], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [makeParagraph(String(students.length), { sizeHalfPt: 15.2 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[9], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [makeParagraph(String(fitStudents), { sizeHalfPt: 15.2 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[10], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [makeParagraph(String(unfitStudents), { sizeHalfPt: 15.2 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[11], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [makeParagraph(String(svcAircraft), { sizeHalfPt: 15.2 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[12], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_INNER },
            children: [makeParagraph(String(unsvcAircraft), { sizeHalfPt: 15.2 })],
          }),
          new TableCell({
            width: { size: botWidthsDxa[13], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            borders: { top: B_INNER, left: B_INNER, bottom: B_OUTER, right: B_OUTER },
            children: [makeParagraph(formatMinutes(totals.grandTotalMin, "0:00"), { sizeHalfPt: 16 })],
          }),
        ],
      }),
    ],
  });

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: mmToDxa(210),
              height: mmToDxa(297),
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: mmToDxa(5),
              bottom: mmToDxa(5),
              left: mmToDxa(6),
              right: mmToDxa(6),
              header: 0,
              footer: 0,
            },
          },
        },
        children: [
          hdrTable,
          titlePara,
          mainTable,
          makeParagraph("", { sizeHalfPt: 4, lineTwip: 40, afterTwip: 40 }),
          botTable,
        ],
      },
    ],
  });
}

export function buildModernScheduleDocxDocument(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  logoBytes: Uint8Array | null,
  lang: ExportLang = "EN",
  groupName?: string,
  showInspectionHours = true
): Document {
  const isAr = lang === "AR";
  const fName = isAr ? FONT_AR : FONT_MODERN_EN;
  const totals = calcScheduleTotals(schedule, aircraft);
  const stuMap = new Map(students.map((s) => [s.id, s]));

  const fitInstructors = instructors.filter((i) => i.fit).length;
  const unfitInstructors = instructors.length - fitInstructors;
  const fitStudents = students.filter((s) => s.fit).length;
  const unfitStudents = students.length - fitStudents;
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
        instructorsLabel: `المدربون — ${instructors.length}:  `,
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
        instructorsLabel: `Instructors (${instructors.length}):   `,
      };

  const MB_OUTER = { style: BorderStyle.SINGLE, size: 12, color: MOD_NAVY } as const;
  const MB_NAVY_SEP = { style: BorderStyle.SINGLE, size: 10, color: MOD_NAVY } as const;
  const MB_NAVY_SUM = { style: BorderStyle.SINGLE, size: 10, color: MOD_NAVY } as const;
  const MB_ROW = { style: BorderStyle.SINGLE, size: 6, color: MOD_ROW_BORDER } as const;
  const MB_GRID = { style: BorderStyle.SINGLE, size: 4, color: MOD_GRID_BORDER } as const;
  const MB_RED = { style: BorderStyle.SINGLE, size: 12, color: RED } as const;
  const MB_WHITE_4 = { style: BorderStyle.SINGLE, size: 4, color: WHITE } as const;
  const MB_WHITE_6 = { style: BorderStyle.SINGLE, size: 6, color: WHITE } as const;

  const mkRun = (
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
    } = {}
  ) =>
    new TextRun({
      text,
      font: fName,
      size: Math.round(opts.size ?? 12),
      bold: opts.bold ?? false,
      italics: opts.italic ?? false,
      color: opts.color ?? MOD_DARK,
      ...(opts.underline ? { underline: { type: UnderlineType.SINGLE, color: opts.color ?? MOD_DARK } } : {}),
    });

  // A. Header table (96.33, 96.33, 96.34 mm = 289 mm)
  const hdrColsDxa = [96.33, 96.33, 96.34].map(mmToDxa);
  const hdrTable = new Table({
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: isAr,
    width: { size: mmToDxa(289), type: WidthType.DXA },
    columnWidths: hdrColsDxa,
    borders: NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: hdrColsDxa[0], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 8, left: 16, right: 16 },
            borders: { top: B_NIL, bottom: B_NIL, left: B_NIL, right: B_NIL },
            children: [
              new Paragraph({
                alignment: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
                bidirectional: isAr,
                spacing: { before: 0, after: 0, line: 210, lineRule: "exact" },
                children: [mkRun(lbl.ministry, { size: 17, bold: true, color: MOD_NAVY })],
              }),
              new Paragraph({
                alignment: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
                bidirectional: isAr,
                spacing: { before: 0, after: 0, line: 210, lineRule: "exact" },
                children: [mkRun(lbl.academy, { size: 17, bold: true, color: MOD_NAVY })],
              }),
              new Paragraph({
                alignment: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
                bidirectional: isAr,
                spacing: { before: 0, after: 0, line: 210, lineRule: "exact" },
                children: [mkRun(lbl.college, { size: 17, bold: true, color: MOD_NAVY })],
              }),
            ],
          }),
          new TableCell({
            width: { size: hdrColsDxa[1], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 8, left: 16, right: 16 },
            borders: { top: B_NIL, bottom: B_NIL, left: B_NIL, right: B_NIL },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: logoBytes
                  ? [
                      new ImageRun({
                        type: "png",
                        data: logoBytes,
                        transformation: { width: 197, height: 36 },
                      }),
                    ]
                  : [mkRun("EGYPTIAN AVIATION ACADEMY — Misr Flying College", { size: 17, bold: true, color: MOD_NAVY })],
              }),
            ],
          }),
          new TableCell({
            width: { size: hdrColsDxa[2], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 8, left: 16, right: 16 },
            borders: { top: B_NIL, bottom: B_NIL, left: B_NIL, right: B_NIL },
            children: [
              new Paragraph({
                alignment: isAr ? AlignmentType.LEFT : AlignmentType.RIGHT,
                bidirectional: isAr,
                spacing: { before: 0, after: 0, line: 220, lineRule: "exact" },
                children: [mkRun(lbl.commander, { size: 17, bold: true, color: MOD_DARK })],
              }),
              new Paragraph({
                alignment: isAr ? AlignmentType.LEFT : AlignmentType.RIGHT,
                bidirectional: isAr,
                spacing: { before: 0, after: 0, line: 220, lineRule: "exact" },
                children: [
                  mkRun(
                    `${isAr ? "\u200F" : ""}${lbl.signature} ${
                      isAr
                        ? translateOfficerToArabic(schedule.missionCommander) || "ك/ ..............."
                        : schedule.missionCommander || "Capt. _____________"
                    }`,
                    { size: 17, bold: true, color: MOD_DARK }
                  ),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // B. Title paragraph
  const titlePara = makeParagraph(lbl.title, {
    sizeHalfPt: 22,
    bold: true,
    fontName: fName,
    color: MOD_NAVY,
    align: AlignmentType.CENTER,
    beforeTwip: 0,
    afterTwip: 35,
    lineTwip: 245,
    underline: true,
    rtl: isAr,
  });

  // C. 13-Column Schedule Table (289.0 mm)
  const schedWidthsMm = [19.5, ...Array(10).fill(24.35), 13.0, 13.0]; // 289.0 mm
  const schedWidthsDxa = schedWidthsMm.map(mmToDxa);

  const slotHalfPt = (text: string): number => {
    const len = text.trim().length;
    if (len > 21) return 13;
    if (len > 17) return 14;
    if (len > 14) return 15;
    return 16;
  };

  const row0 = new TableRow({
    height: { value: mmToDxa(5.0), rule: HeightRule.ATLEAST },
    cantSplit: true,
    children: [
      new TableCell({
        rowSpan: 2,
        width: { size: schedWidthsDxa[0], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 14, bottom: 14, left: 20, right: 20 },
        borders: { top: MB_OUTER, bottom: MB_NAVY_SEP, left: MB_OUTER, right: MB_WHITE_6 },
        children: [makeParagraph(lbl.aircraft, { sizeHalfPt: 17, fontName: fName, color: WHITE, rtl: isAr })],
      }),
      new TableCell({
        columnSpan: 10,
        width: { size: mmToDxa(243.5), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 14, bottom: 14, left: 20, right: 20 },
        borders: { top: MB_OUTER, bottom: MB_NAVY_SEP, left: MB_WHITE_6, right: MB_WHITE_6 },
        children: [makeParagraph(lbl.timeFromTo, { sizeHalfPt: 18, fontName: fName, color: WHITE, rtl: isAr })],
      }),
      new TableCell({
        columnSpan: 2,
        width: { size: mmToDxa(26.0), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 14, bottom: 14, left: 20, right: 20 },
        borders: { top: MB_OUTER, bottom: MB_NAVY_SEP, left: MB_WHITE_6, right: MB_OUTER },
        children: [makeParagraph(lbl.flightHours, { sizeHalfPt: 15, fontName: fName, color: WHITE, rtl: isAr })],
      }),
    ],
  });

  const row1 = new TableRow({
    height: { value: mmToDxa(6.4), rule: HeightRule.ATLEAST },
    cantSplit: true,
    children: [
      ...Array.from({ length: 10 }, (_, sIdx) => {
        const slotLbl = schedule.timeSlots[sIdx] || "";
        return new TableCell({
          width: { size: schedWidthsDxa[1 + sIdx], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 12, bottom: 12, left: 12, right: 12 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: MOD_NAVY },
            bottom: MB_NAVY_SEP,
            left: sIdx === 0 ? MB_NAVY_SEP : MB_GRID,
            right: sIdx === 9 ? MB_NAVY_SEP : MB_GRID,
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0, line: 185, lineRule: "exact" },
              children: [mkRun(slotLbl || " ", { size: 16, bold: true, color: MOD_NAVY })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0, line: 140, lineRule: "exact" },
              children: [mkRun(slotLbl ? "00   15   30   45" : "", { size: 11, bold: false, color: MOD_SUBTLE })],
            }),
          ],
        });
      }),
      new TableCell({
        width: { size: schedWidthsDxa[11], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 12, bottom: 12, left: 14, right: 14 },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: MOD_NAVY },
          bottom: MB_NAVY_SEP,
          left: MB_NAVY_SEP,
          right: MB_RED,
        },
        children: [makeParagraph(lbl.solo, { sizeHalfPt: 17, fontName: fName, color: RED, rtl: isAr })],
      }),
      new TableCell({
        width: { size: schedWidthsDxa[12], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 12, bottom: 12, left: 14, right: 14 },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: MOD_NAVY },
          bottom: MB_NAVY_SEP,
          left: MB_RED,
          right: MB_OUTER,
        },
        children: [makeParagraph(lbl.dual, { sizeHalfPt: 17, fontName: fName, color: MOD_DARK, rtl: isAr })],
      }),
    ],
  });

  const displayAircraft: (Aircraft | null)[] = [...aircraft];
  while (displayAircraft.length < 8) displayAircraft.push(null);
  const acCount = displayAircraft.length;
  const acRowHeightMm = Math.min(9.4, 75.2 / acCount);

  const acRows = displayAircraft.map((ac, idx) => {
    const isEven = idx % 2 === 0;
    const bandBg = isEven ? MOD_ALT_BLUE : WHITE;
    const topB = idx === 0 ? MB_NAVY_SEP : MB_ROW;
    const botB = idx === acCount - 1 ? MB_NAVY_SEP : MB_ROW;

    const hours = ac ? calcAircraftHours(ac.id, schedule.grid) : { soloMin: 0, dualMin: 0 };
    const soloText = ac ? formatMinutes(hours.soloMin, "-") : "-";
    const dualText = ac ? formatMinutes(hours.dualMin, "-") : "-";
    const covered = ac ? getAircraftCoveredSlots(schedule, ac.id) : new Map();

    const inspAfter =
      showInspectionHours && ac && ac.hoursToInspection !== undefined
        ? ac.hoursToInspection - (hours.soloMin + hours.dualMin) / 60
        : undefined;

    const regText = ac?.registration || "";
    const acChildren: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 190, lineRule: "exact" },
        children: [mkRun(regText, { size: inspAfter !== undefined ? 16 : 17, bold: true, color: MOD_NAVY })],
      }),
    ];
    if (inspAfter !== undefined) {
      acChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0, line: 150, lineRule: "exact" },
          children: [mkRun(`${inspAfter.toFixed(1)}h`, { size: 13, bold: false, color: MOD_SUBTLE })],
        })
      );
    }

    const slotCells = Array.from({ length: 10 }, (_, sIdx) => {
      const sortie = ac ? schedule.grid[ac.id]?.[sIdx] : undefined;
      const cov = !sortie ? covered.get(sIdx) : undefined;

      const fill = WHITE;
      let children: Paragraph[] = [makeParagraph("", { sizeHalfPt: 14, fontName: fName })];

      if (sortie) {
        const disp = formatSortieDisplay(sortie, instructors, students, lang);
        const isSolo = sortie.type === "SOLO";
        const clr = isSolo ? RED : MOD_DARK;
        children = [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            bidirectional: isAr,
            spacing: { before: 0, after: 0, line: 175, lineRule: "exact" },
            children: [mkRun(disp.topLine, { size: slotHalfPt(disp.topLine), bold: true, color: clr })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            bidirectional: isAr,
            spacing: { before: 0, after: 0, line: 175, lineRule: "exact" },
            children: [mkRun(disp.bottomLine, { size: slotHalfPt(disp.bottomLine), bold: true, color: clr })],
          }),
        ];
      } else if (cov) {
        const contLabel = isAr ? `→ امتداد (${cov.fromLabel})` : `← Cont. (${cov.fromLabel})`;
        children = [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            bidirectional: isAr,
            spacing: { before: 0, after: 0, line: 175, lineRule: "exact" },
            children: [mkRun(contLabel, { size: 14, bold: true, italic: true, color: MOD_CONT_TEXT })],
          }),
        ];
      }

      return new TableCell({
        width: { size: schedWidthsDxa[1 + sIdx], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 10, bottom: 10, left: 8, right: 8 },
        borders: {
          top: topB,
          bottom: botB,
          left: sIdx === 0 ? MB_NAVY_SEP : MB_GRID,
          right: sIdx === 9 ? MB_NAVY_SEP : MB_GRID,
        },
        children,
      });
    });

    return new TableRow({
      height: { value: mmToDxa(acRowHeightMm), rule: HeightRule.ATLEAST },
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: schedWidthsDxa[0], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          shading: { fill: bandBg, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 10, bottom: 10, left: 10, right: 10 },
          borders: { top: topB, bottom: botB, left: MB_OUTER, right: MB_NAVY_SEP },
          children: acChildren,
        }),
        ...slotCells,
        new TableCell({
          width: { size: schedWidthsDxa[11], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          shading: { fill: bandBg, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 10, bottom: 10, left: 10, right: 10 },
          borders: { top: topB, bottom: botB, left: MB_NAVY_SEP, right: MB_RED },
          children: [
            makeParagraph(soloText, {
              sizeHalfPt: 17,
              fontName: fName,
              color: soloText !== "-" ? RED : MOD_SUBTLE,
            }),
          ],
        }),
        new TableCell({
          width: { size: schedWidthsDxa[12], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          shading: { fill: bandBg, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 10, bottom: 10, left: 10, right: 10 },
          borders: { top: topB, bottom: botB, left: MB_RED, right: MB_OUTER },
          children: [
            makeParagraph(dualText, {
              sizeHalfPt: 17,
              fontName: fName,
              color: dualText !== "-" ? MOD_DARK : MOD_SUBTLE,
            }),
          ],
        }),
      ],
    });
  });

  // Row DAILY TOTALS
  const totalsRow = new TableRow({
    height: { value: mmToDxa(5.4), rule: HeightRule.ATLEAST },
    cantSplit: true,
    children: [
      new TableCell({
        columnSpan: 11,
        width: { size: mmToDxa(263.0), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 14, bottom: 14, left: 32, right: 32 },
        borders: { top: MB_NAVY_SEP, bottom: MB_NAVY_SEP, left: MB_OUTER, right: MB_NAVY_SEP },
        children: [
          makeParagraph(lbl.dailyTotals, {
            sizeHalfPt: 16,
            fontName: fName,
            color: MOD_NAVY,
            align: isAr ? AlignmentType.LEFT : AlignmentType.RIGHT,
            rtl: isAr,
          }),
        ],
      }),
      new TableCell({
        width: { size: schedWidthsDxa[11], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 14, bottom: 14, left: 14, right: 14 },
        borders: { top: MB_NAVY_SEP, bottom: MB_NAVY_SEP, left: MB_NAVY_SEP, right: MB_RED },
        children: [makeParagraph(formatMinutes(totals.totalSoloMin, "0:00"), { sizeHalfPt: 18, fontName: fName, color: RED })],
      }),
      new TableCell({
        width: { size: schedWidthsDxa[12], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 14, bottom: 14, left: 14, right: 14 },
        borders: { top: MB_NAVY_SEP, bottom: MB_NAVY_SEP, left: MB_RED, right: MB_OUTER },
        children: [makeParagraph(formatMinutes(totals.totalDualMin, "0:00"), { sizeHalfPt: 18, fontName: fName, color: MOD_DARK })],
      }),
    ],
  });

  // Row STANDBY
  const standbyEntries = schedule.standby || [];
  const standbyRow = new TableRow({
    height: { value: mmToDxa(5.8), rule: HeightRule.ATLEAST },
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: schedWidthsDxa[0], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: MOD_STANDBY_BG, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 14, bottom: 14, left: 14, right: 14 },
        borders: { top: MB_NAVY_SEP, bottom: MB_NAVY_SEP, left: MB_OUTER, right: MB_NAVY_SEP },
        children: [makeParagraph(lbl.standby, { sizeHalfPt: 15, fontName: fName, color: MOD_NAVY, rtl: isAr })],
      }),
      ...Array.from({ length: 10 }, (_, sIdx) => {
        const sb = standbyEntries[sIdx];
        const sbStu = sb ? stuMap.get(sb.studentId) : undefined;
        const sbName = sbStu ? (isAr ? sbStu.nameAr || sbStu.name : sbStu.name) : "";
        return new TableCell({
          width: { size: schedWidthsDxa[1 + sIdx], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 14, bottom: 14, left: 10, right: 10 },
          borders: {
            top: MB_NAVY_SEP,
            bottom: MB_NAVY_SEP,
            left: sIdx === 0 ? MB_NAVY_SEP : MB_GRID,
            right: sIdx === 9 ? MB_NAVY_SEP : MB_GRID,
          },
          children: [makeParagraph(sbName, { sizeHalfPt: 15, fontName: fName, color: sb?.highlight ? RED : MOD_DARK, rtl: isAr })],
        });
      }),
      new TableCell({
        width: { size: schedWidthsDxa[11], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
        borders: { top: MB_NAVY_SEP, bottom: MB_NAVY_SEP, left: MB_NAVY_SEP, right: MB_RED },
        children: [makeParagraph("-", { sizeHalfPt: 15, fontName: fName, bold: false, color: MOD_SUBTLE })],
      }),
      new TableCell({
        width: { size: schedWidthsDxa[12], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
        borders: { top: MB_NAVY_SEP, bottom: MB_NAVY_SEP, left: MB_RED, right: MB_OUTER },
        children: [makeParagraph("-", { sizeHalfPt: 15, fontName: fName, bold: false, color: MOD_SUBTLE })],
      }),
    ],
  });

  // Row NOTES
  const notesToRender = isAr ? ARABIC_DEFAULT_NOTES : schedule.notes;
  const notesRow = new TableRow({
    height: { value: mmToDxa(11.6), rule: HeightRule.ATLEAST },
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: schedWidthsDxa[0], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 16, bottom: 16, left: 14, right: 14 },
        borders: { top: MB_NAVY_SEP, bottom: MB_OUTER, left: MB_OUTER, right: MB_NAVY_SEP },
        children: [makeParagraph(lbl.notes, { sizeHalfPt: 15, fontName: fName, color: MOD_NAVY, rtl: isAr })],
      }),
      new TableCell({
        columnSpan: 12,
        width: { size: mmToDxa(269.5), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: MOD_NOTES_BG, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 16, bottom: 16, left: 32, right: 32 },
        borders: { top: MB_NAVY_SEP, bottom: MB_OUTER, left: MB_NAVY_SEP, right: MB_OUTER },
        children: notesToRender.map((n, idx) =>
          makeParagraph(n.text, {
            sizeHalfPt: 14,
            fontName: fName,
            bold: Boolean(n.highlight),
            underline: Boolean(n.highlight),
            color: n.highlight ? RED : MOD_DARK,
            lineTwip: 170,
            beforeTwip: idx === 0 ? 0 : 10,
            rtl: isAr,
          })
        ),
      }),
    ],
  });

  const modernSchedTable = new Table({
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: isAr,
    width: { size: mmToDxa(289), type: WidthType.DXA },
    columnWidths: schedWidthsDxa,
    borders: NO_TABLE_BORDERS,
    rows: [row0, row1, ...acRows, totalsRow, standbyRow, notesRow],
  });

  // D. Operations Summary Table (16 cols = 289.0 mm)
  const opsWidthsMm = [21.5, 20.5, 22.5, 16.5, 19.5, 13.5, 13.5, 13.5, 19.5, 10.0, 10.0, 10.0, 14.0, 14.0, 24.5, 46.0];
  const opsWidthsDxa = opsWidthsMm.map(mmToDxa);

  const w0 = schedule.weather[0] || { time: "9 AM", wind: "", temp: "" };
  const w1 = schedule.weather[1] || { time: "12 PM", wind: "", temp: "" };
  const w2 = schedule.weather[2] || { time: "3 PM", wind: "", temp: "" };

  const opsTable = new Table({
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: isAr,
    width: { size: mmToDxa(289), type: WidthType.DXA },
    columnWidths: opsWidthsDxa,
    borders: NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        height: { value: mmToDxa(5.0), rule: HeightRule.ATLEAST },
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: opsWidthsDxa[0], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 14, bottom: 14, left: 12, right: 12 },
            borders: { top: MB_OUTER, bottom: MB_NAVY_SUM, left: MB_OUTER, right: MB_WHITE_4 },
            children: [makeParagraph(lbl.operations, { sizeHalfPt: 14, fontName: fName, color: WHITE, rtl: isAr })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[1], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 14, bottom: 14, left: 12, right: 12 },
            borders: { top: MB_OUTER, bottom: MB_NAVY_SUM, left: MB_WHITE_4, right: MB_WHITE_4 },
            children: [makeParagraph(lbl.monitoring, { sizeHalfPt: 14, fontName: fName, color: WHITE, rtl: isAr })],
          }),
          new TableCell({
            columnSpan: 2,
            width: { size: mmToDxa(39.0), type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 14, bottom: 14, left: 12, right: 12 },
            borders: { top: MB_OUTER, bottom: MB_NAVY_SUM, left: MB_WHITE_4, right: MB_WHITE_4 },
            children: [makeParagraph(lbl.briefingExams, { sizeHalfPt: 14, fontName: fName, color: WHITE, rtl: isAr })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[4], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 14, bottom: 14, left: 10, right: 10 },
            borders: { top: MB_OUTER, bottom: MB_NAVY_SUM, left: MB_WHITE_4, right: MB_WHITE_4 },
            children: [makeParagraph(lbl.wForecast, { sizeHalfPt: 14, fontName: fName, color: WHITE })],
          }),
          ...[w0.time || "9 AM", w1.time || "12 PM", w2.time || "3 PM"].map((wt, wi) =>
            new TableCell({
              width: { size: opsWidthsDxa[5 + wi], type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
              margins: { top: 14, bottom: 14, left: 8, right: 8 },
              borders: { top: MB_OUTER, bottom: MB_NAVY_SUM, left: MB_WHITE_4, right: MB_WHITE_4 },
              children: [makeParagraph(wt, { sizeHalfPt: 14, fontName: fName, color: WHITE })],
            })
          ),
          new TableCell({
            width: { size: opsWidthsDxa[8], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 14, bottom: 14, left: 10, right: 10 },
            borders: { top: MB_OUTER, bottom: MB_NAVY_SUM, left: MB_WHITE_4, right: MB_WHITE_4 },
            children: [makeParagraph(lbl.fitness, { sizeHalfPt: 14, fontName: fName, color: WHITE, rtl: isAr })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[9], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 14, bottom: 14, left: 8, right: 8 },
            borders: { top: MB_OUTER, bottom: MB_NAVY_SUM, left: MB_WHITE_4, right: MB_WHITE_4 },
            children: [makeParagraph(lbl.tot, { sizeHalfPt: 14, fontName: fName, color: WHITE, rtl: isAr })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[10], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 14, bottom: 14, left: 8, right: 8 },
            borders: { top: MB_OUTER, bottom: MB_NAVY_SUM, left: MB_WHITE_4, right: MB_WHITE_4 },
            children: [makeParagraph(lbl.fit, { sizeHalfPt: 14, fontName: fName, color: WHITE, rtl: isAr })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[11], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 14, bottom: 14, left: 8, right: 8 },
            borders: { top: MB_OUTER, bottom: MB_NAVY_SUM, left: MB_WHITE_4, right: MB_WHITE_4 },
            children: [makeParagraph(lbl.unfit, { sizeHalfPt: 13, fontName: fName, color: WHITE, rtl: isAr })],
          }),
          new TableCell({
            columnSpan: 2,
            width: { size: mmToDxa(28.0), type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 14, bottom: 14, left: 10, right: 10 },
            borders: { top: MB_OUTER, bottom: MB_NAVY_SUM, left: MB_WHITE_4, right: MB_WHITE_4 },
            children: [makeParagraph(lbl.acServ, { sizeHalfPt: 14, fontName: fName, color: WHITE, rtl: isAr })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[14], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 14, bottom: 14, left: 10, right: 10 },
            borders: { top: MB_OUTER, bottom: MB_NAVY_SUM, left: MB_WHITE_4, right: MB_OUTER },
            children: [makeParagraph(lbl.totalHours, { sizeHalfPt: 14, fontName: fName, color: WHITE, rtl: isAr })],
          }),
          new TableCell({
            rowSpan: 3,
            width: { size: opsWidthsDxa[15], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 10, bottom: 10, left: 28, right: 10 },
            borders: { top: B_NIL, bottom: B_NIL, left: MB_OUTER, right: B_NIL },
            children: [
              makeParagraph(lbl.opsManager, {
                sizeHalfPt: 17,
                fontName: fName,
                color: MOD_DARK,
                align: isAr ? AlignmentType.LEFT : AlignmentType.RIGHT,
                lineTwip: 215,
                rtl: isAr,
              }),
              makeParagraph(
                `${isAr ? "\u200F" : ""}${lbl.signature} ${
                  isAr
                    ? translateOfficerToArabic(schedule.operationsManager) || "ك/ ..............."
                    : schedule.operationsManager || "Capt. _____________"
                }`,
                {
                  sizeHalfPt: 17,
                  fontName: fName,
                  color: MOD_DARK,
                  align: isAr ? AlignmentType.LEFT : AlignmentType.RIGHT,
                  lineTwip: 215,
                  rtl: isAr,
                }
              ),
            ],
          }),
        ],
      }),
      new TableRow({
        height: { value: mmToDxa(5.2), rule: HeightRule.ATLEAST },
        cantSplit: true,
        children: [
          new TableCell({
            rowSpan: 2,
            width: { size: opsWidthsDxa[0], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 12, right: 12 },
            borders: { top: MB_NAVY_SUM, bottom: MB_OUTER, left: MB_OUTER, right: MB_ROW },
            children: [
              makeParagraph(
                isAr ? translateOfficerToArabic(schedule.operationsOfficer) : schedule.operationsOfficer || "",
                { sizeHalfPt: 16, fontName: fName, color: MOD_DARK, rtl: isAr }
              ),
            ],
          }),
          new TableCell({
            rowSpan: 2,
            width: { size: opsWidthsDxa[1], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 12, right: 12 },
            borders: { top: MB_NAVY_SUM, bottom: MB_OUTER, left: MB_ROW, right: MB_ROW },
            children: [
              makeParagraph(
                isAr ? translateOfficerToArabic(schedule.monitoringOfficer) : schedule.monitoringOfficer || "",
                { sizeHalfPt: 16, fontName: fName, color: MOD_DARK, rtl: isAr }
              ),
            ],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[2], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 12, right: 12 },
            borders: { top: MB_NAVY_SUM, bottom: MB_GRID, left: MB_ROW, right: MB_GRID },
            children: [makeParagraph(lbl.massBriefing, { sizeHalfPt: 14, fontName: fName, color: MOD_NAVY })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[3], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 10, right: 10 },
            borders: { top: MB_NAVY_SUM, bottom: MB_GRID, left: MB_GRID, right: MB_ROW },
            children: [makeParagraph(schedule.massBriefing || "", { sizeHalfPt: 14, fontName: fName, color: MOD_DARK, rtl: isAr })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[4], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 10, right: 10 },
            borders: { top: MB_NAVY_SUM, bottom: MB_GRID, left: MB_ROW, right: MB_GRID },
            children: [makeParagraph(lbl.wind, { sizeHalfPt: 14, fontName: fName, color: MOD_NAVY, rtl: isAr })],
          }),
          ...[w0.wind || "", w1.wind || "", w2.wind || ""].map((wv, wi) =>
            new TableCell({
              width: { size: opsWidthsDxa[5 + wi], type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
              margins: { top: 10, bottom: 10, left: 8, right: 8 },
              borders: { top: MB_NAVY_SUM, bottom: MB_GRID, left: MB_GRID, right: wi === 2 ? MB_ROW : MB_GRID },
              children: (wv || "").split("\n").map((ln) =>
                makeParagraph(ln, { sizeHalfPt: 12, fontName: fName, color: MOD_DARK, lineTwip: 140 })
              ),
            })
          ),
          new TableCell({
            width: { size: opsWidthsDxa[8], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 10, right: 10 },
            borders: { top: MB_NAVY_SUM, bottom: MB_GRID, left: MB_ROW, right: MB_GRID },
            children: [makeParagraph(lbl.instructors, { sizeHalfPt: 14, fontName: fName, color: MOD_NAVY, rtl: isAr })],
          }),
          ...[instructors.length, fitInstructors, unfitInstructors].map((val, vi) =>
            new TableCell({
              width: { size: opsWidthsDxa[9 + vi], type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
              margins: { top: 12, bottom: 12, left: 8, right: 8 },
              borders: { top: MB_NAVY_SUM, bottom: MB_GRID, left: MB_GRID, right: vi === 2 ? MB_ROW : MB_GRID },
              children: [makeParagraph(String(val), { sizeHalfPt: 15, fontName: fName, color: MOD_DARK })],
            })
          ),
          new TableCell({
            width: { size: opsWidthsDxa[12], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 8, right: 8 },
            borders: { top: MB_NAVY_SUM, bottom: MB_GRID, left: MB_ROW, right: MB_GRID },
            children: [makeParagraph(lbl.serv, { sizeHalfPt: 14, fontName: fName, color: MOD_NAVY, rtl: isAr })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[13], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 8, right: 8 },
            borders: { top: MB_NAVY_SUM, bottom: MB_GRID, left: MB_GRID, right: MB_ROW },
            children: [makeParagraph(lbl.us, { sizeHalfPt: 14, fontName: fName, color: MOD_NAVY, rtl: isAr })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[14], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 10, right: 10 },
            borders: { top: MB_NAVY_SUM, bottom: MB_GRID, left: MB_ROW, right: MB_OUTER },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                bidirectional: isAr,
                spacing: { before: 0, after: 0 },
                children: [
                  mkRun(lbl.solo, { size: 14, bold: true, color: RED }),
                  mkRun(` + ${lbl.dual}`, { size: 14, bold: true, color: MOD_DARK }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        height: { value: mmToDxa(5.2), rule: HeightRule.ATLEAST },
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: opsWidthsDxa[2], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 12, right: 12 },
            borders: { top: MB_GRID, bottom: MB_OUTER, left: MB_ROW, right: MB_GRID },
            children: [makeParagraph(lbl.exams, { sizeHalfPt: 14, fontName: fName, color: MOD_NAVY })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[3], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 10, right: 10 },
            borders: { top: MB_GRID, bottom: MB_OUTER, left: MB_GRID, right: MB_ROW },
            children: [makeParagraph(schedule.exams || "", { sizeHalfPt: 14, fontName: fName, color: MOD_DARK, rtl: isAr })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[4], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 10, right: 10 },
            borders: { top: MB_GRID, bottom: MB_OUTER, left: MB_ROW, right: MB_GRID },
            children: [makeParagraph(lbl.temp, { sizeHalfPt: 14, fontName: fName, color: MOD_NAVY, rtl: isAr })],
          }),
          ...[w0.temp || "", w1.temp || "", w2.temp || ""].map((tv, ti) =>
            new TableCell({
              width: { size: opsWidthsDxa[5 + ti], type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
              margins: { top: 12, bottom: 12, left: 8, right: 8 },
              borders: { top: MB_GRID, bottom: MB_OUTER, left: MB_GRID, right: ti === 2 ? MB_ROW : MB_GRID },
              children: [makeParagraph(tv, { sizeHalfPt: 15, fontName: fName, color: MOD_DARK })],
            })
          ),
          new TableCell({
            width: { size: opsWidthsDxa[8], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_SLATE_HDR, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 10, right: 10 },
            borders: { top: MB_GRID, bottom: MB_OUTER, left: MB_ROW, right: MB_GRID },
            children: [makeParagraph(lbl.students, { sizeHalfPt: 14, fontName: fName, color: MOD_NAVY, rtl: isAr })],
          }),
          ...[students.length, fitStudents, unfitStudents].map((val, vi) =>
            new TableCell({
              width: { size: opsWidthsDxa[9 + vi], type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
              margins: { top: 12, bottom: 12, left: 8, right: 8 },
              borders: { top: MB_GRID, bottom: MB_OUTER, left: MB_GRID, right: vi === 2 ? MB_ROW : MB_GRID },
              children: [makeParagraph(String(val), { sizeHalfPt: 15, fontName: fName, color: MOD_DARK })],
            })
          ),
          new TableCell({
            width: { size: opsWidthsDxa[12], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 8, right: 8 },
            borders: { top: MB_GRID, bottom: MB_OUTER, left: MB_ROW, right: MB_GRID },
            children: [makeParagraph(String(svcAircraft), { sizeHalfPt: 16, fontName: fName, color: MOD_DARK })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[13], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 8, right: 8 },
            borders: { top: MB_GRID, bottom: MB_OUTER, left: MB_GRID, right: MB_ROW },
            children: [makeParagraph(String(unsvcAircraft), { sizeHalfPt: 16, fontName: fName, color: MOD_DARK })],
          }),
          new TableCell({
            width: { size: opsWidthsDxa[14], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 10, right: 10 },
            borders: { top: MB_GRID, bottom: MB_OUTER, left: MB_ROW, right: MB_OUTER },
            children: [makeParagraph(formatMinutes(totals.grandTotalMin, "0:00"), { sizeHalfPt: 18, fontName: fName, color: MOD_NAVY })],
          }),
        ],
      }),
    ],
  });

  // E. Pilots & Students Roster Reference Table (6 cols x 48.1667 mm = 289.0 mm)
  const rosterWidthsDxa = Array(6).fill(mmToDxa(289.0 / 6));
  const perCol = Math.max(1, Math.ceil(students.length / 6));
  const stuFontHalfPt = perCol > 6 ? 13 : 15;
  const stuLineTwip = perCol > 6 ? 155 : 176;
  const instLine = instructors.map((i) => (isAr ? i.nameAr || translateOfficerToArabic(i.name) : i.name)).join("   |   ");

  const rosterTable = new Table({
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: isAr,
    width: { size: mmToDxa(289), type: WidthType.DXA },
    columnWidths: rosterWidthsDxa,
    borders: NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        height: { value: mmToDxa(4.8), rule: HeightRule.ATLEAST },
        cantSplit: true,
        children: [
          new TableCell({
            columnSpan: 6,
            width: { size: mmToDxa(289.0), type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_NAVY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 20, right: 20 },
            borders: { top: MB_OUTER, bottom: MB_GRID, left: MB_OUTER, right: MB_OUTER },
            children: [makeParagraph(lbl.rosterTitle, { sizeHalfPt: 15, fontName: fName, color: WHITE, rtl: isAr })],
          }),
        ],
      }),
      new TableRow({
        height: { value: mmToDxa(5.2), rule: HeightRule.ATLEAST },
        cantSplit: true,
        children: [
          new TableCell({
            columnSpan: 6,
            width: { size: mmToDxa(289.0), type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: MOD_ALT_BLUE, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 12, bottom: 12, left: 20, right: 20 },
            borders: { top: MB_GRID, bottom: MB_GRID, left: MB_OUTER, right: MB_OUTER },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                bidirectional: isAr,
                spacing: { before: 0, after: 0 },
                children: [
                  mkRun(lbl.instructorsLabel, { size: 15, bold: true, color: MOD_NAVY }),
                  mkRun(instLine || "-", { size: 15, bold: true, color: MOD_DARK }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        height: { value: mmToDxa(17.5), rule: HeightRule.ATLEAST },
        cantSplit: true,
        children: Array.from({ length: 6 }, (_, cIdx) => {
          const slice = students.slice(cIdx * perCol, (cIdx + 1) * perCol);
          const children = slice.length
            ? slice.map((s, sOff) => {
                const num = cIdx * perCol + sOff + 1;
                const nm = isAr ? s.nameAr || s.name : s.name;
                const unfitTag = s.fit ? "" : isAr ? " (غير لائق)" : " (U)";
                const label = isAr ? `\u200F${num}- ${nm}${unfitTag}` : `${num}. ${nm}${unfitTag}`;
                return makeParagraph(label, {
                  sizeHalfPt: stuFontHalfPt,
                  fontName: fName,
                  bold: s.program === "IRCPL",
                  color: s.program === "IRCPL" ? RED : MOD_DARK,
                  align: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  lineTwip: stuLineTwip,
                  rtl: isAr,
                });
              })
            : [makeParagraph("", { sizeHalfPt: stuFontHalfPt, fontName: fName })];

          return new TableCell({
            width: { size: rosterWidthsDxa[cIdx], type: WidthType.DXA },
            verticalAlign: VerticalAlign.TOP,
            shading: { fill: WHITE, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 14, bottom: 14, left: 28, right: 24 },
            borders: {
              top: MB_GRID,
              bottom: MB_OUTER,
              left: cIdx === 0 ? MB_OUTER : MB_GRID,
              right: cIdx === 5 ? MB_OUTER : MB_GRID,
            },
            children,
          });
        }),
      }),
    ],
  });

  const makeExactSpacer = () =>
    new Paragraph({
      spacing: { before: 0, after: 0, line: 45, lineRule: "exact" },
      children: [new TextRun({ text: "", font: fName, size: 2 })],
    });

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: mmToDxa(210),
              height: mmToDxa(297),
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: mmToDxa(3.5),
              bottom: mmToDxa(3.5),
              left: mmToDxa(4.0),
              right: mmToDxa(4.0),
              header: 0,
              footer: 0,
            },
          },
        },
        children: [
          hdrTable,
          titlePara,
          modernSchedTable,
          makeExactSpacer(),
          opsTable,
          makeExactSpacer(),
          rosterTable,
        ],
      },
    ],
  });
}

export function buildScheduleDocxDocument(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  logoBytes: Uint8Array | null,
  lang: ExportLang = "EN",
  style: ExportStyle = "modern",
  groupName?: string,
  showInspectionHours = true
): Document {
  return style === "modern"
    ? buildModernScheduleDocxDocument(
        schedule,
        instructors,
        students,
        aircraft,
        logoBytes,
        lang,
        groupName,
        showInspectionHours
      )
    : buildClassicScheduleDocxDocument(schedule, instructors, students, aircraft, logoBytes, lang);
}

export async function exportScheduleToDocx(
  schedule: DaySchedule,
  instructors: Instructor[],
  students: Student[],
  aircraft: Aircraft[],
  lang: ExportLang = "EN",
  style: ExportStyle = "modern",
  groupName?: string,
  showInspectionHours = true
): Promise<void> {
  const logoBytes = await fetchLogoBytes();
  const doc = buildScheduleDocxDocument(
    schedule,
    instructors,
    students,
    aircraft,
    logoBytes,
    lang,
    style,
    groupName,
    showInspectionHours
  );
  const blob = await Packer.toBlob(doc);
  const suffix = style === "modern" ? "_Modern" : "";
  saveAs(blob, `MFC_Daily_Flight_Schedule_${schedule.date}_${lang}${suffix}.docx`);
}
