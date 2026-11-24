export type StudentProgram = "IRCPL" | "PPL";
export type SortieType = "DUAL" | "SOLO";
export type ExportLang = "EN" | "AR";
export type ExportStyle = "modern" | "classic";

export interface Instructor {
  id: string;
  name: string;
  shortName: string;
  nameAr?: string;
  shortNameAr?: string;
  fit: boolean;
  maxDailyMin?: number; // default 360 warning / 480 error
}

export interface Student {
  id: string;
  name: string;
  nameAr?: string;
  program: StudentProgram;
  fit: boolean;
}

export interface Aircraft {
  id: string;
  registration: string;
  serviceable: boolean;
  note?: string;
  hoursToInspection?: number;
  inspectionType?: "50-Hr" | "100-Hr";
  basicEmptyWeightLb?: number;
  emptyArmIn?: number;
  weighingDate?: string;
  weighingDueDate?: string;
}

export interface Sortie {
  id: string;
  type: SortieType;
  instructorId?: string;
  studentId?: string;
  durationMin: number;
  tag?: string;
}

export interface StandbyEntry {
  id: string;
  studentId: string;
  highlight?: boolean;
}

export interface NoShowEntry {
  id: string;
  date: string;
  studentId: string;
  studentName: string;
  aircraftReg: string;
  slotLabel: string;
  replacedByStudentId?: string;
  replacedByStudentName?: string;
  timestamp: string;
}

export interface WeatherForecastSlot {
  time: string;
  wind: string;
  temp: string;
  visibilityKm?: number;
}

export interface ScheduleNote {
  text: string;
  highlight?: boolean;
}

export interface HourlyVisibilityPoint {
  hour: number; // 6..16 local Cairo time
  label: string; // e.g. "6 AM"
  visibilityKm: number;
}

export interface DayVisibilitySummary {
  date: string; // YYYY-MM-DD
  minVisibilityKm: number;
  maxVisibilityKm: number;
  vfrOkForPpl: boolean; // minVisibilityKm >= 5.0 across 06:00-16:00
  belowMinHours: string[]; // e.g. ["6 AM (3.2 km)"]
  hourly: HourlyVisibilityPoint[];
}

export interface WeatherMeta {
  station?: string; // e.g. "HEAT"
  fetchedAt?: string;
  maxCrosswindKt?: number;
  advisory?: string;
  metarRaw?: string;
  metarVisKm?: number | null;
  tafRaw?: string;
  tafMinVisKm?: number | null;
  todayVisibility?: DayVisibilitySummary;
  nextDayVisibility?: DayVisibilitySummary;
  vfrMinKm?: number; // 5
}

export interface DaySchedule {
  date: string; // YYYY-MM-DD
  airport: string;
  issueLabel: string;
  missionCommander: string;
  operationsOfficer: string;
  monitoringOfficer: string;
  operationsManager: string;
  massBriefing: string;
  exams: string;
  timeSlots: string[]; // length 10
  weather: WeatherForecastSlot[]; // length 3
  weatherMeta?: WeatherMeta;
  standby: StandbyEntry[];
  notes: ScheduleNote[];
  grid: Record<string, Record<number, Sortie>>; // aircraftId -> slotIdx (0..9) -> Sortie
}

export interface GroupData {
  id: string;
  name: string;
  instructors: Instructor[];
  students: Student[];
  aircraft: Aircraft[];
  schedules: Record<string, DaySchedule>;
  noShows: NoShowEntry[];
}

export interface AirportCommsEntry {
  id: string;
  icao: string;
  iata: string;
  name: string;
  elevationFt: number;
  lat: number;
  lon: number;
  coordsDms: string;
  magVarDeg: number;
  runways: string;
  vorIdent: string;
  vorFreq: string;
  vorNote: string;
  ilsInfo: string;
  atis: string;
  ground: string;
  tower: string;
  approach: string;
  notes: string;
}

export interface EnrouteFreqEntry {
  id: string;
  unit: string;
  sector: string;
  primaryFreq: string;
  secondaryFreq: string;
  remarks: string;
}

export interface FlightReleaseCrewRow {
  name: string;
  designation: string;
  licenceNo: string;
  expDate: string;
}

export interface CommFreqRow {
  id: string;
  label: string;
  freq: string;
  highlight?: boolean;
}

export interface NavFreqRow {
  id: string;
  label: string;
  freq: string;
  highlight?: boolean;
}

export interface FlightReleaseData {
  aircraftReg: string;
  aircraftModel: string;
  date: string;
  utcTime: string;
  lessonNo: string;
  fltCategory: "LCL" | "XC" | "INST" | "SIM INST";
  isDual: boolean;
  isSolo: boolean;
  isNight: boolean;
  isIfr: boolean;
  isVfr: boolean;
  crew: FlightReleaseCrewRow[];
  depAd: string;
  arrAd: string;
  altAd: string;
  wxWind: string;
  wxRwy: string;
  wxTemp: string;
  wxDp: string;
  wxQnh: string;
  wxVis: string;
  notam: string;
  taf: string;
  metar: string;
  bewLb: string;
  bewArmIn?: string;
  bewMoment: string;
  weighingDate?: string;
  weighingDueDate?: string;
  fuelGal: string;
  frontPaxLb: string;
  rearPaxLb: string;
  baggageALb: string;
  baggageBLb: string;
  taxiFuelLb: string;
  taxiFuelMoment: string;
  burnGph: string;
  opsSupervisor: string;
  cfiName: string;
  picName: string;
  issueNo: string;
  issueDate: string;
  revisionNo: string;
  revisionDate: string;
  includeWbCharts: boolean;
}

export interface IcaoFlightPlanData {
  aerodrome?: string;
  priority: string;
  addressees: string;
  filingTimeUtc: string;
  originator: string;
  specificId?: string;
  item3MsgType: string;
  item7AircraftId: string;
  item8FlightRules: "V" | "I" | "Y" | "Z";
  item8FlightType: "G" | "N" | "S" | "X" | "M";
  item9Number: string;
  item9AircraftType: string;
  item9WakeCat: "L" | "M" | "H" | "J";
  item10Equipment: string;
  item10Surveillance: string;
  item13DepIcao: string;
  item13EobtUtc: string;
  item15Speed: string;
  item15Level: string;
  item15Route: string;
  item16DestIcao: string;
  item16TotalEet: string;
  item16Altn1: string;
  item16Altn2: string;
  item18Other: string;
  item19Endurance: string;
  item19Persons: string;
  item19RadioU: boolean;
  item19RadioV: boolean;
  item19RadioE: boolean;
  item19SurvP: boolean;
  item19SurvD: boolean;
  item19SurvM: boolean;
  item19SurvJ: boolean;
  item19JacketsL: boolean;
  item19JacketsF: boolean;
  item19JacketsU: boolean;
  item19JacketsV: boolean;
  item19DinghiesNum: string;
  item19DinghiesCap: string;
  item19DinghiesCover: boolean;
  item19DinghiesColor: string;
  item19ColorMarkings: string;
  item19Remarks: string;
  item19Pic: string;
  filedBy: string;
  acceptedBy?: string;
  additionalReq: string;
}

export interface CommsReferenceData {
  title: string;
  airacNote: string;
  aircraftReg: string;
  pilotInCommand: string;
  departureAd: string;
  arrivalAd: string;
  clearanceDest: string;
  clearanceVia: string;
  clearanceClimb: string;
  clearanceSquawk: string;
  directorFreq: string;
  metWind: string;
  metVis: string;
  metClouds: string;
  metTemp: string;
  metDewPoint: string;
  metQnh: string;
  metActiveRwy: string;
  commFreqList: CommFreqRow[];
  navFreqList: NavFreqRow[];
  transitionAltitude: string;
  transitionLevel: string;
  mfcOpsFreq: string;
  mfcOpsPhone: string;
  airports: AirportCommsEntry[];
  enroute: EnrouteFreqEntry[];
  extraNotes: string;
  includeDetailedPage2: boolean;
}

export interface OpsDocumentsState {
  flightRelease: FlightReleaseData;
  flightPlan: IcaoFlightPlanData;
  commsRef: CommsReferenceData;
}

export interface StationWeatherSummary {
  icao: string;
  metarRaw?: string;
  tafRaw?: string;
  visKm: number | null;
  wind?: string;
  tempC?: number;
  altimHpa?: number;
  vfrOkForPpl: boolean;
  obsTime?: string;
}

export interface AppState {
  version: 2;
  activeGroupId: string;
  groups: GroupData[];
  opsDocs?: OpsDocumentsState;
}

export type ConflictSeverity = "error" | "warning";

export interface ScheduleConflict {
  id: string;
  severity: ConflictSeverity;
  aircraftId: string;
  slotIndex: number;
  message: string;
}
