import {
  Aircraft,
  AppState,
  DaySchedule,
  GroupData,
  Instructor,
  ScheduleNote,
  Student,
} from "../types";
import { lookupFleetWeightRecord } from "./fleetWeightBalance";
import { createDefaultOpsDocuments } from "./opsReferenceData";

function withFleetWb(ac: Aircraft): Aircraft {
  const rec = lookupFleetWeightRecord(ac.registration);
  if (!rec) return ac;
  return {
    ...ac,
    basicEmptyWeightLb: rec.basicEmptyWeightLb,
    emptyArmIn: rec.emptyArmIn,
    weighingDate: rec.weighingDate,
    weighingDueDate: rec.weighingDueDate,
  };
}

export const DEFAULT_TIME_SLOTS: string[] = [
  "6 AM",
  "7 AM",
  "8 AM",
  "9 AM",
  "10 AM",
  "11 AM",
  "12 PM",
  "1 PM",
  "2 PM",
  "3 PM",
];

export const DEFAULT_NOTES: ScheduleNote[] = [
  {
    text: "Students must maintain a clean-shaven face and proper general appearance, and strictly adhere to reporting times. Non-compliance will be recorded as NO SHOW.",
    highlight: true,
  },
  {
    text: "Every student must verify their status on the flight board (Talon) prior to flying.",
    highlight: false,
  },
  {
    text: "IR phase flights require IFR glasses (hood/foggles) + wristwatch, and all flights require carrying your License + complete LOG BOOK updated through the last sortie.",
    highlight: false,
  },
];

export const ARABIC_DEFAULT_NOTES: ScheduleNote[] = [
  {
    text: "على الطلبة الالتزام بحلاقة الذقن والاهتمام بالمظهر العام والالتزام بتوقيتات الحضور ومن يخالف التعليمات NO SHOW",
    highlight: true,
  },
  {
    text: "على كل طالب مراجعة موقفه على التالون قبل الطيران",
    highlight: false,
  },
  {
    text: "طيران مرحلة الـ IR بالنظارة + ساعة يد، والطيران بالرخصة + الـ LOG BOOK كامل حتى آخر طلعة",
    highlight: false,
  },
];

export function translateOfficerToArabic(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "";
  if (/[\u0600-\u06FF]/.test(trimmed)) return trimmed;
  const map: Record<string, string> = {
    "capt. mohamed salah": "ك/ محمد صلاح",
    "capt. m. salah": "ك/ محمد صلاح",
    "capt. mohamed kamal": "ك/ محمد كمال",
    "capt. kamal": "ك/ كمال",
    "capt. salah el-din": "ك/ صلاح الدين",
    "capt. khedr": "ك/ خضر",
    "capt. khidr": "ك/ خضر",
    "capt. mina": "ك/ مينا",
    "capt. khaled": "ك/ خالد",
    "capt. amin": "ك/ أمين",
    "capt. amgad": "ك/ أمجد",
    "capt. hamdy": "ك/ حمدي",
    "capt. atef": "ك/ عاطف",
    "capt. m. atef": "ك/ محمد عاطف",
    "capt. saad": "ك/ سعد",
    "capt. islam": "ك/ إسلام",
    "assiut airport": "مطار أسيوط",
  };
  const key = trimmed.toLowerCase();
  if (map[key]) return map[key];
  if (key.startsWith("capt.")) {
    return `ك/ ${trimmed.slice(5).trim()}`;
  }
  return trimmed;
}

// =============================================================================
// GROUP B — Capt. Mohamed Salah (23/11/2026 Detachment)
// =============================================================================
export const GROUP_B_INSTRUCTORS: Instructor[] = [
  { id: "inst-msalah", name: "Capt. Mohamed Salah", shortName: "Capt. M. Salah", nameAr: "ك/ محمد صلاح", shortNameAr: "ك/ محمد صلاح", fit: true, maxDailyMin: 360 },
  { id: "inst-kamal", name: "Capt. Mohamed Kamal", shortName: "Capt. Kamal", nameAr: "ك/ محمد كمال", shortNameAr: "ك/ كمال", fit: true, maxDailyMin: 360 },
  { id: "inst-salah", name: "Capt. Salah El-Din", shortName: "Capt. Salah El-Din", nameAr: "ك/ صلاح الدين", shortNameAr: "ك/ صلاح الدين", fit: true, maxDailyMin: 360 },
  { id: "inst-khidr", name: "Capt. Khedr", shortName: "Capt. Khedr", nameAr: "ك/ خضر", shortNameAr: "ك/ خضر", fit: true, maxDailyMin: 360 },
  { id: "inst-mina", name: "Capt. Mina", shortName: "Capt. Mina", nameAr: "ك/ مينا", shortNameAr: "ك/ مينا", fit: true, maxDailyMin: 360 },
];

export const GROUP_B_STUDENTS: Student[] = [
  { id: "st-1", name: "Mohannad Nader", nameAr: "مهند نادر", program: "PPL", fit: true },
  { id: "st-2", name: "Yassin", nameAr: "ياسين", program: "PPL", fit: true },
  { id: "st-3", name: "Yassa Maher", nameAr: "يسى ماهر", program: "PPL", fit: true },
  { id: "st-4", name: "Omar Beiba", nameAr: "عمر بيبة", program: "PPL", fit: true },
  { id: "st-5", name: "Karim Tamer", nameAr: "كريم تامر", program: "PPL", fit: true },
  { id: "st-6", name: "Shneishen", nameAr: "شنيشن", program: "PPL", fit: true },
  { id: "st-7", name: "Youssef Attia", nameAr: "يوسف عطية", program: "PPL", fit: true },
  { id: "st-8", name: "Mostafa Gamal", nameAr: "مصطفى جمال", program: "PPL", fit: true },
  { id: "st-9", name: "Abdel Nasser", nameAr: "عبد الناصر", program: "PPL", fit: true },
  { id: "st-10", name: "El-Shammari", nameAr: "الشمري", program: "PPL", fit: true },
  { id: "st-11", name: "Omar Fawzy", nameAr: "عمر فوزي", program: "PPL", fit: true },
  { id: "st-12", name: "Hassan Zahran", nameAr: "حسن زهران", program: "PPL", fit: true },
  { id: "st-13", name: "Seif Diab", nameAr: "سيف دياب", program: "PPL", fit: true },
  { id: "st-14", name: "Mina Hakim", nameAr: "مينا حكيم", program: "PPL", fit: true },
  { id: "st-15", name: "Hady Hussein", nameAr: "هادي حسين", program: "PPL", fit: true },
  { id: "st-16", name: "Dina", nameAr: "دينا", program: "PPL", fit: true },
  { id: "st-17", name: "Mohamed Mofreh", nameAr: "محمد مفرح", program: "PPL", fit: true },
  { id: "st-18", name: "Shaker Moraga", nameAr: "شاكر مراجع", program: "PPL", fit: true },
  { id: "st-19", name: "Talal", nameAr: "طلال", program: "PPL", fit: true },
  { id: "st-20", name: "Khaled Ali", nameAr: "خالد علي", program: "PPL", fit: true },
  { id: "st-21", name: "Arwa", nameAr: "أروى", program: "PPL", fit: true },
  { id: "st-22", name: "Amir Younan", nameAr: "أمير يونان", program: "PPL", fit: true },
  { id: "st-23", name: "Eyad El-Gendy", nameAr: "إياد الجندي", program: "PPL", fit: true },
  { id: "st-24", name: "Michael", nameAr: "مايكل", program: "PPL", fit: true },
  { id: "st-25", name: "Abdel Hafez", nameAr: "عبد الحافظ", program: "PPL", fit: true },
  { id: "st-26", name: "Abu Taleb", nameAr: "أبو طالب", program: "PPL", fit: true },
  { id: "st-27", name: "Omar Khattab", nameAr: "عمر خطاب", program: "PPL", fit: true },
  { id: "st-28", name: "Omar Helmy", nameAr: "عمر حلمي", program: "PPL", fit: true },
  { id: "st-29", name: "Youssef Gamal", nameAr: "يوسف جمال", program: "PPL", fit: true },
  { id: "st-30", name: "Mohamed Shaker", nameAr: "محمد شاكر", program: "PPL", fit: true },
  { id: "st-31", name: "Moslem", nameAr: "مسلم", program: "PPL", fit: true },
  { id: "st-32", name: "Karim Ragab", nameAr: "كريم رجب", program: "PPL", fit: true },
  { id: "st-33", name: "Nasr Badr", nameAr: "نصر بدر", program: "PPL", fit: true },
  { id: "st-34", name: "Shoaib", nameAr: "شعيب", program: "PPL", fit: true },
  { id: "st-35", name: "Youssef Osama", nameAr: "يوسف أسامة", program: "PPL", fit: true },
  { id: "st-36", name: "Sorour", nameAr: "سرور", program: "PPL", fit: true },
];

export const GROUP_B_AIRCRAFT: Aircraft[] = [
  withFleetWb({ id: "ac-bqt", registration: "SU-BQT", serviceable: true, hoursToInspection: 38, inspectionType: "50-Hr" }),
  withFleetWb({ id: "ac-bri", registration: "SU-BRI", serviceable: true, hoursToInspection: 42, inspectionType: "50-Hr" }),
  withFleetWb({ id: "ac-bqx", registration: "SU-BQX", serviceable: true, hoursToInspection: 29, inspectionType: "100-Hr" }),
  withFleetWb({ id: "ac-bro", registration: "SU-BRO", serviceable: true, hoursToInspection: 46, inspectionType: "50-Hr" }),
  withFleetWb({ id: "ac-bqs", registration: "SU-BQS", serviceable: true, hoursToInspection: 24, inspectionType: "100-Hr" }),
  withFleetWb({ id: "ac-bqw", registration: "SU-BQW", serviceable: true, hoursToInspection: 35, inspectionType: "50-Hr" }),
  withFleetWb({ id: "ac-bnt", registration: "SU-BNT", serviceable: true, hoursToInspection: 49, inspectionType: "100-Hr" }),
  { id: "ac-extra", registration: "EXTRA", serviceable: true },
];

export const SEED_SCHEDULE_2026_11_23: DaySchedule = {
  date: "2026-11-23",
  airport: "Assiut Airport",
  issueLabel: "DAY ISSUE 1",
  missionCommander: "Capt. Mohamed Salah",
  operationsOfficer: "Capt. Amin",
  monitoringOfficer: "",
  operationsManager: "Capt. Amgad",
  massBriefing: "",
  exams: "",
  timeSlots: [...DEFAULT_TIME_SLOTS],
  weather: [
    { time: "9 AM", wind: "", temp: "" },
    { time: "12 PM", wind: "", temp: "" },
    { time: "3 PM", wind: "", temp: "" },
  ],
  standby: [
    { id: "sb-1", studentId: "st-32", highlight: false }, // Karim Ragab
    { id: "sb-2", studentId: "st-17", highlight: false }, // Mohamed Mofreh
    { id: "sb-3", studentId: "st-26", highlight: false }, // Abu Taleb
    { id: "sb-4", studentId: "st-13", highlight: true },  // Seif Diab
  ],
  notes: DEFAULT_NOTES.map((n) => ({ ...n })),
  grid: {
    "ac-bqt": {
      0: { id: "s-bqt-0", type: "DUAL", instructorId: "inst-msalah", studentId: "st-14", durationMin: 60 },
      1: { id: "s-bqt-1", type: "DUAL", instructorId: "inst-msalah", studentId: "st-16", durationMin: 60 },
      2: { id: "s-bqt-2", type: "DUAL", instructorId: "inst-msalah", studentId: "st-15", durationMin: 60 },
      3: { id: "s-bqt-3", type: "DUAL", instructorId: "inst-msalah", studentId: "st-12", durationMin: 60 },
      4: { id: "s-bqt-4", type: "SOLO", studentId: "st-12", durationMin: 60 },
      5: { id: "s-bqt-5", type: "DUAL", instructorId: "inst-msalah", studentId: "st-13", durationMin: 60 },
      6: { id: "s-bqt-6", type: "SOLO", studentId: "st-13", durationMin: 60 },
      8: { id: "s-bqt-8", type: "SOLO", studentId: "st-1", durationMin: 120 },
    },
    "ac-bri": {
      0: { id: "s-bri-0", type: "DUAL", instructorId: "inst-kamal", studentId: "st-25", durationMin: 60 },
      1: { id: "s-bri-1", type: "DUAL", instructorId: "inst-kamal", studentId: "st-29", durationMin: 60 },
      2: { id: "s-bri-2", type: "DUAL", instructorId: "inst-kamal", studentId: "st-11", durationMin: 60 },
      3: { id: "s-bri-3", type: "DUAL", instructorId: "inst-kamal", studentId: "st-28", durationMin: 120 },
      4: { id: "s-bri-4", type: "SOLO", studentId: "st-28", durationMin: 120 },
      6: { id: "s-bri-6", type: "SOLO", studentId: "st-5", durationMin: 120 },
    },
    "ac-bqx": {
      0: { id: "s-bqx-0", type: "DUAL", instructorId: "inst-khidr", studentId: "st-30", durationMin: 60 },
      1: { id: "s-bqx-1", type: "DUAL", instructorId: "inst-khidr", studentId: "st-10", durationMin: 60 },
      2: { id: "s-bqx-2", type: "DUAL", instructorId: "inst-khidr", studentId: "st-8", durationMin: 60 },
      3: { id: "s-bqx-3", type: "DUAL", instructorId: "inst-khidr", studentId: "st-23", durationMin: 60 },
      4: { id: "s-bqx-4", type: "SOLO", studentId: "st-26", durationMin: 60 },
      5: { id: "s-bqx-5", type: "DUAL", instructorId: "inst-khidr", studentId: "st-24", durationMin: 60 },
      6: { id: "s-bqx-6", type: "SOLO", studentId: "st-24", durationMin: 60 },
      7: { id: "s-bqx-7", type: "DUAL", instructorId: "inst-khidr", studentId: "st-22", durationMin: 60 },
      8: { id: "s-bqx-8", type: "SOLO", studentId: "st-22", durationMin: 60 },
    },
    "ac-bro": {
      0: { id: "s-bro-0", type: "DUAL", instructorId: "inst-mina", studentId: "st-9", durationMin: 60 },
      1: { id: "s-bro-1", type: "DUAL", instructorId: "inst-mina", studentId: "st-20", durationMin: 60 },
      2: { id: "s-bro-2", type: "DUAL", instructorId: "inst-mina", studentId: "st-21", durationMin: 60 },
      3: { id: "s-bro-3", type: "DUAL", instructorId: "inst-mina", studentId: "st-19", durationMin: 60 },
      4: { id: "s-bro-4", type: "SOLO", studentId: "st-19", durationMin: 60 },
      5: { id: "s-bro-5", type: "DUAL", instructorId: "inst-mina", studentId: "st-27", durationMin: 60 },
      6: { id: "s-bro-6", type: "SOLO", studentId: "st-27", durationMin: 60 },
      7: { id: "s-bro-7", type: "DUAL", instructorId: "inst-mina", studentId: "st-32", durationMin: 60 },
    },
    "ac-bqs": {
      0: { id: "s-bqs-0", type: "SOLO", studentId: "st-6", durationMin: 120 },
      1: { id: "s-bqs-1", type: "DUAL", instructorId: "inst-salah", studentId: "st-33", durationMin: 60 },
      2: { id: "s-bqs-2", type: "DUAL", instructorId: "inst-salah", studentId: "st-35", durationMin: 60 },
      3: { id: "s-bqs-3", type: "SOLO", studentId: "st-2", durationMin: 120 },
      4: { id: "s-bqs-4", type: "DUAL", instructorId: "inst-salah", studentId: "st-36", durationMin: 60 },
      5: { id: "s-bqs-5", type: "DUAL", instructorId: "inst-salah", studentId: "st-34", durationMin: 60 },
    },
    "ac-bqw": {
      0: { id: "s-bqw-0", type: "SOLO", studentId: "st-5", durationMin: 120 },
      2: { id: "s-bqw-2", type: "SOLO", studentId: "st-7", durationMin: 120 },
      4: { id: "s-bqw-4", type: "SOLO", studentId: "st-3", durationMin: 120 },
      6: { id: "s-bqw-6", type: "SOLO", studentId: "st-7", durationMin: 120 },
    },
    "ac-bnt": {
      0: { id: "s-bnt-0", type: "DUAL", instructorId: "inst-salah", studentId: "st-7", durationMin: 120 },
      3: { id: "s-bnt-3", type: "DUAL", instructorId: "inst-msalah", studentId: "st-4", durationMin: 120 },
      5: { id: "s-bnt-5", type: "DUAL", instructorId: "inst-kamal", studentId: "st-2", durationMin: 60 },
    },
    "ac-extra": {},
  },
};

export function createGroupB(): GroupData {
  return {
    id: "grp-msalah",
    name: "Group B — Capt. Mohamed Salah",
    instructors: GROUP_B_INSTRUCTORS.map((i) => ({ ...i })),
    students: GROUP_B_STUDENTS.map((s) => ({ ...s })),
    aircraft: GROUP_B_AIRCRAFT.map((a) => ({ ...a })),
    schedules: {
      [SEED_SCHEDULE_2026_11_23.date]: structuredClone(SEED_SCHEDULE_2026_11_23),
    },
    noShows: [],
  };
}

export function createBlankSchedule(date: string, group?: GroupData): DaySchedule {
  const refDates = group ? Object.keys(group.schedules).sort() : [];
  const refSchedule = refDates.length > 0 && group ? group.schedules[refDates[refDates.length - 1]] : undefined;
  return {
    date,
    airport: refSchedule?.airport || "Assiut Airport",
    issueLabel: refSchedule?.issueLabel || "DAY ISSUE 1",
    missionCommander: refSchedule?.missionCommander || group?.instructors[0]?.name || "Capt. Mohamed Salah",
    operationsOfficer: refSchedule?.operationsOfficer || "Capt. Amin",
    monitoringOfficer: "",
    operationsManager: refSchedule?.operationsManager || "Capt. Amgad",
    massBriefing: "",
    exams: "",
    timeSlots: refSchedule ? [...refSchedule.timeSlots] : [...DEFAULT_TIME_SLOTS],
    weather: [
      { time: "9 AM", wind: "", temp: "" },
      { time: "12 PM", wind: "", temp: "" },
      { time: "3 PM", wind: "", temp: "" },
    ],
    standby: [],
    notes: DEFAULT_NOTES.map((n) => ({ ...n })),
    grid: {},
  };
}

export function createNewGroup(name: string, cloneFrom?: GroupData): GroupData {
  const id = `grp-${Date.now().toString(36)}`;
  const todayIso = new Date().toISOString().slice(0, 10);
  if (cloneFrom) {
    return {
      id,
      name,
      instructors: cloneFrom.instructors.map((i) => ({ ...i })),
      students: cloneFrom.students.map((s) => ({ ...s })),
      aircraft: cloneFrom.aircraft.map((a) => ({ ...a })),
      schedules: {
        [todayIso]: createBlankSchedule(todayIso, cloneFrom),
      },
      noShows: [],
    };
  }
  return {
    id,
    name,
    instructors: [],
    students: [],
    aircraft: [
      withFleetWb({ id: `${id}-ac-1`, registration: "SU-BQT", serviceable: true, hoursToInspection: 50, inspectionType: "50-Hr" }),
    ],
    schedules: {
      [todayIso]: createBlankSchedule(todayIso),
    },
    noShows: [],
  };
}

export function createSeedState(): AppState {
  return {
    version: 2,
    activeGroupId: "grp-msalah",
    groups: [createGroupB()],
    opsDocs: createDefaultOpsDocuments(),
  };
}
