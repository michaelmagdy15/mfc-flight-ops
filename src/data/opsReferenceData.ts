import {
  AirportCommsEntry,
  CommFreqRow,
  CommsReferenceData,
  EnrouteFreqEntry,
  FlightReleaseData,
  IcaoFlightPlanData,
  NavFreqRow,
  OpsDocumentsState,
} from "../types";
import { computeEmptyMoment, lookupFleetWeightRecord } from "./fleetWeightBalance";

export const DEFAULT_MFC_COMM_FREQS: CommFreqRow[] = [
  { id: "cm-heoc", label: "HEOC Tower", freq: "118.500" },
  { id: "cm-heca", label: "HECA Tower", freq: "118.100" },
  { id: "cm-heba", label: "HEBA Tower", freq: "119.100" },
  { id: "cm-heat", label: "HEAT Tower (Assiut)", freq: "118.100", highlight: true },
  { id: "cm-heps", label: "HEPS Tower", freq: "120.700" },
  { id: "cm-hetr", label: "HETR Tower", freq: "121.300" },
  { id: "cm-hesh", label: "HESH Tower (Sharm)", freq: "118.900", highlight: true },
  { id: "cm-hegn", label: "HEGN Tower", freq: "119.600" },
  { id: "cm-hesg", label: "HESG Tower (Sohag)", freq: "118.100", highlight: true },
  { id: "cm-hesx", label: "HESX Tower", freq: "121.000" },
  { id: "cm-hetb", label: "HETB Tower", freq: "120.300" },
  { id: "cm-helx", label: "HELX Tower (Luxor)", freq: "119.900", highlight: true },
  { id: "cm-hekg", label: "HEKG Tower (El Kharga)", freq: "122.800", highlight: true },
  { id: "cm-emrg", label: "Emergency", freq: "121.500" },
];

export const DEFAULT_MFC_NAV_FREQS: NavFreqRow[] = [
  { id: "nv-oct", label: "OCT NDB", freq: "340" },
  { id: "nv-fym", label: "FYM VOR", freq: "117.3" },
  { id: "nv-cvo", label: "CVO VOR", freq: "115.2" },
  { id: "nv-noz", label: "NOZ VOR", freq: "115.9" },
  { id: "nv-ast", label: "AST VOR (Assiut)", freq: "117.7", highlight: true },
  { id: "nv-shg", label: "SHG VOR (Sohag)", freq: "115.3", highlight: true },
  { id: "nv-psd", label: "PSD VOR", freq: "113.2" },
  { id: "nv-tba", label: "TBA VOR", freq: "114.5" },
  { id: "nv-shm", label: "SHM VOR (Sharm)", freq: "114.2", highlight: true },
  { id: "nv-hgd", label: "HGD VOR", freq: "116.5" },
  { id: "nv-lxr", label: "LXR VOR (Luxor)", freq: "114.4", highlight: true },
  { id: "nv-khg", label: "KHG VOR (El Kharga)", freq: "113.8", highlight: true },
];

export const DEFAULT_AIRPORTS_COMMS: AirportCommsEntry[] = [
  {
    id: "ap-heat",
    icao: "HEAT",
    iata: "ATZ",
    name: "Assiut Int'l Airport",
    elevationFt: 772,
    lat: 27.045,
    lon: 31.0119,
    coordsDms: "27°02.7'N 031°00.7'E",
    magVarDeg: 4,
    runways: "13/31 (3,019 × 45 m, Asphalt)",
    vorIdent: "AST",
    vorFreq: "117.70 MHz",
    vorNote: "305° / 1.4 NM from ARP · Elev 850 ft",
    ilsInfo: "IASU 111.30 (RWY 31 LOC — check NOTAM); RNAV/VOR 31",
    atis: "NIL (via TWR)",
    ground: "121.900 MHz",
    tower: "118.100 MHz",
    approach: "Cairo ACC / Local",
    notes: "MFC Detachment Base · PPL VFR Min Vis 5.0 km · RWY 13/31 x-wind check",
  },
  {
    id: "ap-helx",
    icao: "HELX",
    iata: "LXR",
    name: "Luxor Int'l Airport",
    elevationFt: 294,
    lat: 25.6708,
    lon: 32.7064,
    coordsDms: "25°40.3'N 032°42.4'E",
    magVarDeg: 4,
    runways: "02/20 (3,000 × 45 m, Asphalt)",
    vorIdent: "LXR",
    vorFreq: "114.40 MHz",
    vorNote: "Ch 91X · Colocated DME",
    ilsInfo: "ILUX 108.50 (RWY 02 Ch 22X) / XIL 111.10 (RWY 20 Ch 48X)",
    atis: "122.600 MHz",
    ground: "121.900 MHz",
    tower: "119.900 (Alt 118.100)",
    approach: "124.300 (Alt 118.100)",
    notes: "Primary Southern X-Country & IFR Alternate · Radar TMA",
  },
  {
    id: "ap-hesg",
    icao: "HESG",
    iata: "HMB",
    name: "Sohag Int'l Airport",
    elevationFt: 859,
    lat: 26.3403,
    lon: 31.7389,
    coordsDms: "26°20.4'N 031°44.3'E",
    magVarDeg: 4,
    runways: "15/33 (3,000 × 45 m, Asphalt)",
    vorIdent: "SHG",
    vorFreq: "115.30 MHz",
    vorNote: "0.5 NM off THR RWY 15",
    ilsInfo: "VOR/DME & RNAV Approaches (check AIP/NOTAM)",
    atis: "NIL (via TWR)",
    ground: "121.900 MHz",
    tower: "118.100 (MFC) / 118.900 · 125.050 (AIP)",
    approach: "118.900 / 125.050",
    notes: "Nearest X-Country & Alternate SE of Assiut (~47 NM)",
  },
  {
    id: "ap-hekg",
    icao: "HEKG",
    iata: "UVL",
    name: "El Kharga Airport (New Valley)",
    elevationFt: 192,
    lat: 25.4736,
    lon: 30.5908,
    coordsDms: "25°28.4'N 030°35.5'E",
    magVarDeg: 3,
    runways: "18/36 (3,500 × 45 m, Asphalt)",
    vorIdent: "KHG",
    vorFreq: "113.80 MHz",
    vorNote: "356° / 1.5 NM from ARP",
    ilsInfo: "VOR / RNAV Procedural (Non-ILS)",
    atis: "NIL",
    ground: "NIL (via TWR)",
    tower: "122.800 MHz",
    approach: "Cairo ACC (Procedural)",
    notes: "Western Desert X-Country · Desert kit & 45 min fuel reserve mandatory",
  },
  {
    id: "ap-hesh",
    icao: "HESH",
    iata: "SSH",
    name: "Sharm El Sheikh Int'l",
    elevationFt: 143,
    lat: 27.9786,
    lon: 34.3933,
    coordsDms: "27°58.7'N 034°23.6'E",
    magVarDeg: 4,
    runways: "04L/22R & 04R/22L (3,081 × 45 m)",
    vorIdent: "SHM",
    vorFreq: "114.20 MHz",
    vorNote: "Ch 89X · Field VOR/DME",
    ilsInfo: "IKIL 109.50 (RWY 04L); VOR/RNAV RWY 04R/22L/22R",
    atis: "134.000 MHz",
    ground: "121.900 MHz",
    tower: "118.900 MHz",
    approach: "121.100 (Sec 122.600)",
    notes: "Red Sea / Sinai X-Country · High Sinai terrain NW — verify MSA",
  },
];

export const DEFAULT_ENROUTE_FREQS: EnrouteFreqEntry[] = [
  {
    id: "enr-upper",
    unit: "Cairo ACC (HECC)",
    sector: "Upper Egypt / Asyut – Luxor Sector",
    primaryFreq: "132.200 MHz",
    secondaryFreq: "129.400 MHz",
    remarks: "Verify active sector freq on Egypt AIP ENR 2.1 / ATIS / TWR handoff",
  },
  {
    id: "enr-sinai",
    unit: "Cairo ACC (HECC)",
    sector: "Red Sea / Hurghada – Sinai Sector",
    primaryFreq: "126.600 MHz",
    secondaryFreq: "129.400 MHz",
    remarks: "HESH arrivals & Gulf of Suez / Sinai VFR/IFR corridors",
  },
  {
    id: "enr-emrg",
    unit: "Guard / Distress",
    sector: "International Aeronautical Emergency",
    primaryFreq: "121.500 MHz",
    secondaryFreq: "243.000 MHz",
    remarks: "Monitor on COM2 when practicable; ELT distress test first 5 min/hr max 5s",
  },
  {
    id: "enr-ops",
    unit: "MFC Dispatch",
    sector: "Misr Flying College Base Ops (HEAT)",
    primaryFreq: "131.500 MHz (Editable)",
    secondaryFreq: "Ops Desk",
    remarks: "Check-in prior to SOLO dispatch & report fuel/Hobbs on return",
  },
];

export const C172_CREW_DESIGNATION_LEGEND =
  "*CREW MEMBER(S) DESIGNATION(S): 01 CFI, 02 PIC, 03 EXAMINER, 04 INSPECTOR, 05 OBSERVER, 06 EAA EMPLOYEE, 07 PASSENGER, 41 ECAR 141 STUDENT, 61 ECAR 61 STUDENT, 21 EASA STUDENT.";

export interface QuickRefMetric {
  label: string;
  value: string;
}

export const C172_QUICK_REF: QuickRefMetric[] = [
  { label: "Model / Engine", value: "Cessna 172R · IO-360-L2A (160 HP)" },
  { label: "Max Ramp / Takeoff Wt", value: "2,457 lb / 2,450 lb (Utility 2,100 lb)" },
  { label: "Sample Empty Wt / Mom", value: "1,639 lb / 64.4 lb-ins/1000" },
  { label: "Usable Fuel (6 lb/gal)", value: "53 USG Max (318 lb) / 35 USG (210 lb)" },
  { label: "Rotate (Vr) / Best Angle (Vx)", value: "55 KIAS / 60 KIAS" },
  { label: "Best Rate (Vy) / Best Glide (Vg)", value: "79 KIAS / 65 KIAS" },
  { label: "Maneuvering (Va)", value: "99 KIAS @ 2,450 lb" },
  { label: "Flaps (Vfe 10° / 20°-30°)", value: "110 / 85 KIAS" },
  { label: "Structural (Vno / Vne)", value: "129 / 163 KIAS" },
  { label: "Max Demo Crosswind", value: "15 kt" },
  { label: "Egypt Transition Alt / Level", value: "TA 4,500 ft / TL FL060" },
  { label: "PPL VFR Visibility Min", value: ">= 5.0 km (MFC SOP)" },
  { label: "VFR Semi-Circular Rule", value: "000-179° Odd+500 | 180-359° Even+500" },
  { label: "Mandatory Reserve", value: "Day 30m AIP / MFC 45m" },
];

export const SQUAWK_CODES: QuickRefMetric[] = [
  { label: "7700", value: "General Emergency (Mayday / Pan)" },
  { label: "7600", value: "Radio Communication Failure (LOST COMMS)" },
  { label: "7500", value: "Unlawful Interference" },
  { label: "7000", value: "VFR Conspicuity (unless ATC discrete assigned)" },
  { label: "2000", value: "Non-assigned IFR / En-route entry" },
];

export const ATC_LIGHT_SIGNALS: Array<{ color: string; ground: string; air: string }> = [
  { color: "Steady Green", ground: "Cleared for Takeoff", air: "Cleared to Land" },
  { color: "Flashing Green", ground: "Cleared to Taxi", air: "Return for Landing" },
  { color: "Steady Red", ground: "STOP", air: "Give way & continue circling" },
  { color: "Flashing Red", ground: "Taxi clear of runway", air: "Airport unsafe — do NOT land" },
  { color: "Flashing White", ground: "Return to starting point", air: "Land & taxi to apron (after green)" },
];

export interface FplPreset {
  id: string;
  label: string;
  dep: string;
  dest: string;
  altn1: string;
  altn2: string;
  eet: string;
  level: string;
  route: string;
  rules: "V" | "I";
  otherInfo: string;
}

export const FPL_ROUTE_PRESETS: FplPreset[] = [
  {
    id: "heat-helx",
    label: "HEAT → HELX (Luxor)",
    dep: "HEAT",
    dest: "HELX",
    altn1: "HESG",
    altn2: "HEAT",
    eet: "0115",
    level: "A055",
    route: "DCT AST DCT SHG DCT LXR",
    rules: "V",
    otherInfo: "DOF/261123 EET/HECC0005 OPR/MISR FLYING COLLEGE RMK/TRAINING FLT",
  },
  {
    id: "heat-hesg",
    label: "HEAT → HESG (Sohag)",
    dep: "HEAT",
    dest: "HESG",
    altn1: "HEAT",
    altn2: "HELX",
    eet: "0032",
    level: "A045",
    route: "DCT AST DCT SHG",
    rules: "V",
    otherInfo: "DOF/261123 OPR/MISR FLYING COLLEGE RMK/X-COUNTRY TRAINING",
  },
  {
    id: "heat-hekg",
    label: "HEAT → HEKG (El Kharga)",
    dep: "HEAT",
    dest: "HEKG",
    altn1: "HEAT",
    altn2: "HESG",
    eet: "0105",
    level: "A065",
    route: "DCT AST DCT KHG",
    rules: "V",
    otherInfo: "DOF/261123 OPR/MISR FLYING COLLEGE RMK/DESERT X-COUNTRY TRAINING",
  },
  {
    id: "heat-hesh",
    label: "HEAT → HESH (Sharm)",
    dep: "HEAT",
    dest: "HESH",
    altn1: "HEGN",
    altn2: "HELX",
    eet: "0200",
    level: "A075",
    route: "DCT AST DCT HURGA DCT SHM",
    rules: "V",
    otherInfo: "DOF/261123 OPR/MISR FLYING COLLEGE RMK/RED SEA X-COUNTRY TRAINING",
  },
  {
    id: "heat-local",
    label: "HEAT Local Area",
    dep: "HEAT",
    dest: "HEAT",
    altn1: "HESG",
    altn2: "",
    eet: "0100",
    level: "A035",
    route: "LOCAL TRAINING AREA HEAT",
    rules: "V",
    otherInfo: "DOF/261123 OPR/MISR FLYING COLLEGE RMK/LOCAL CIRCUITS OR AREA",
  },
];

// Official Cessna 172R CG Moment Envelope polygons (Fig 6-7: [moment/1000, weightLb])
export const C172R_NORMAL_ENVELOPE: ReadonlyArray<readonly [number, number]> = [
  [52.5, 1500],
  [68.25, 1950],
  [98.0, 2450],
  [115.89, 2450],
  [70.95, 1500],
];

export const C172R_UTILITY_ENVELOPE: ReadonlyArray<readonly [number, number]> = [
  [52.5, 1500],
  [68.25, 1950],
  [76.65, 2100],
  [85.05, 2100],
  [60.75, 1500],
];

export interface C172RWbResult {
  bewLb: number;
  bewArmIn: number;
  bewMom: number;
  fuelGal: number;
  fuelLb: number;
  fuelMom: number;
  frontPaxLb: number;
  frontPaxMom: number;
  rearPaxLb: number;
  rearPaxMom: number;
  bagALb: number;
  bagAMom: number;
  bagBLb: number;
  bagBMom: number;
  rampLb: number;
  rampMom: number;
  taxiLb: number;
  taxiMom: number;
  towLb: number;
  towMom: number;
  towCgArmIn: number;
  enduranceStr: string;
  enduranceMin: number;
  category: "UTILITY" | "NORMAL" | "OVERWEIGHT" | "OUT_OF_CG";
  warnings: string[];
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function computeC172RWb(fr: FlightReleaseData): C172RWbResult {
  const num = (s: string | undefined, fallback = 0) => {
    if (s === undefined || s.trim() === "") return fallback;
    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
  };

  const bewLb = round2(Math.max(0, num(fr.bewLb, 1707.9)));
  const rawMom = num(fr.bewMoment, NaN);
  const rawArm = num(fr.bewArmIn, NaN);
  const bewArmIn =
    Number.isFinite(rawArm) && rawArm > 0
      ? rawArm
      : bewLb > 0 && Number.isFinite(rawMom) && rawMom > 0
      ? Math.round(((rawMom * 1000) / bewLb) * 10000) / 10000
      : 40.183957;
  const bewMom =
    Number.isFinite(rawMom) && rawMom >= 0
      ? round2(rawMom)
      : computeEmptyMoment(bewLb, bewArmIn);
  const fuelGal = Math.max(0, Math.min(53, num(fr.fuelGal, 35)));
  const fuelLb = round1(fuelGal * 6);
  const fuelMom = round1((fuelLb * 48) / 1000);
  const frontPaxLb = round1(Math.max(0, num(fr.frontPaxLb, 0)));
  const frontPaxMom = round1((frontPaxLb * 37) / 1000);
  const rearPaxLb = round1(Math.max(0, num(fr.rearPaxLb, 0)));
  const rearPaxMom = round1((rearPaxLb * 73) / 1000);
  const bagALb = round1(Math.max(0, num(fr.baggageALb, 0)));
  const bagAMom = round1((bagALb * 95) / 1000);
  const bagBLb = round1(Math.max(0, num(fr.baggageBLb, 0)));
  const bagBMom = round1((bagBLb * 123) / 1000);

  const rampLb = round1(bewLb + fuelLb + frontPaxLb + rearPaxLb + bagALb + bagBLb);
  const rampMom = round1(bewMom + fuelMom + frontPaxMom + rearPaxMom + bagAMom + bagBMom);

  const taxiLb = round1(num(fr.taxiFuelLb, -7.0));
  const taxiMom = round1(num(fr.taxiFuelMoment, -0.3));

  const towLb = round1(rampLb + taxiLb);
  const towMom = round1(rampMom + taxiMom);
  const towCgArmIn = towLb > 0 ? round1((towMom * 1000) / towLb) : 0;

  const burnGph = Math.max(4, num(fr.burnGph, 8.5));
  const usableAfterTaxiGal = Math.max(0, fuelGal + taxiLb / 6);
  const enduranceMin = Math.round((usableAfterTaxiGal / burnGph) * 60);
  const enduranceStr = `${String(Math.floor(enduranceMin / 60)).padStart(2, "0")}:${String(
    enduranceMin % 60
  ).padStart(2, "0")}`;

  // Determine exact C172R CG bounds for given towLb (POH Fig 6-7)
  let fwdArm = 35.0;
  if (towLb > 1950) {
    fwdArm = 35.0 + ((Math.min(towLb, 2450) - 1950) / (2450 - 1950)) * (40.0 - 35.0);
  }
  const minMomNormal = (fwdArm * towLb) / 1000;
  const maxMomNormal = (47.3 * towLb) / 1000;
  const maxMomUtility = (40.5 * towLb) / 1000;

  const warnings: string[] = [];
  if (bagALb > 120) warnings.push("Baggage A exceeds 120 lb max limit.");
  if (bagBLb > 50) warnings.push("Baggage B exceeds 50 lb max limit.");
  if (bagALb + bagBLb > 120) warnings.push("Combined Baggage A+B exceeds 120 lb max.");
  if (rampLb > 2457) warnings.push(`Ramp Wt ${rampLb} lb exceeds 2,457 lb max.`);
  if (towLb > 2450) warnings.push(`Takeoff Wt ${towLb} lb exceeds 2,450 lb max.`);
  if (towLb < 1500) warnings.push(`Takeoff Wt ${towLb} lb below 1,500 lb chart min.`);

  let category: C172RWbResult["category"] = "NORMAL";
  if (towLb > 2450 || rampLb > 2457) {
    category = "OVERWEIGHT";
  } else if (towLb < 1500 || towMom < minMomNormal - 0.1 || towMom > maxMomNormal + 0.1) {
    category = "OUT_OF_CG";
    warnings.push(
      `Takeoff Moment ${towMom.toFixed(1)} is outside Normal CG limits (${minMomNormal.toFixed(
        1
      )}–${maxMomNormal.toFixed(1)}).`
    );
  } else if (towLb <= 2100 && towMom <= maxMomUtility + 0.05 && rearPaxLb === 0 && bagALb + bagBLb === 0) {
    category = "UTILITY";
  }

  return {
    bewLb,
    bewArmIn,
    bewMom,
    fuelGal,
    fuelLb,
    fuelMom,
    frontPaxLb,
    frontPaxMom,
    rearPaxLb,
    rearPaxMom,
    bagALb,
    bagAMom,
    bagBLb,
    bagBMom,
    rampLb,
    rampMom,
    taxiLb,
    taxiMom,
    towLb,
    towMom,
    towCgArmIn,
    enduranceStr,
    enduranceMin,
    category,
    warnings,
  };
}

export function formatDeg3(deg: number): string {
  const norm = ((Math.round(deg) % 360) + 360) % 360;
  return String(norm === 0 ? 360 : norm).padStart(3, "0");
}

export function computeLegMetrics(
  from: AirportCommsEntry,
  to: AirportCommsEntry,
  gsKt = 100
): {
  distanceNm: number;
  trueTrackDeg: number;
  magTrackDeg: number;
  revMagTrackDeg: number;
  eteStr: string;
} {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(to.lon - from.lon);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  const distanceNm = Math.round(3440.065 * c);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const trueTrackDeg = ((Math.round(toDeg(Math.atan2(y, x))) % 360) + 360) % 360;
  const magTrackDeg = ((trueTrackDeg - from.magVarDeg) % 360 + 360) % 360;
  const revMagTrackDeg = (magTrackDeg + 180) % 360;

  const totalMin = Math.round((distanceNm / Math.max(40, gsKt)) * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  const eteStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;

  return { distanceNm, trueTrackDeg, magTrackDeg, revMagTrackDeg, eteStr };
}

export function buildIcaoFplString(fpl: IcaoFlightPlanData): string {
  const id = (fpl.item7AircraftId || "SUBQT").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const numStr =
    fpl.item9Number && Number(fpl.item9Number) > 1 ? fpl.item9Number.trim() : "";
  const ac = (fpl.item9AircraftType || "C172").trim().toUpperCase();
  const wake = (fpl.item9WakeCat || "L").trim().toUpperCase();
  const eq = (fpl.item10Equipment || "SDG").trim().toUpperCase();
  const surv = (fpl.item10Surveillance || "S").trim().toUpperCase();
  const dep = (fpl.item13DepIcao || "HEAT").trim().toUpperCase();
  const eobt = (fpl.item13EobtUtc || "0400").trim();
  const spd = (fpl.item15Speed || "N0105").trim().toUpperCase();
  const lvl = (fpl.item15Level || "A055").trim().toUpperCase();
  const route = (fpl.item15Route || "DCT").trim().toUpperCase();
  const dest = (fpl.item16DestIcao || "HELX").trim().toUpperCase();
  const eet = (fpl.item16TotalEet || "0115").trim();
  const alt1 = (fpl.item16Altn1 || "").trim().toUpperCase();
  const alt2 = (fpl.item16Altn2 || "").trim().toUpperCase();
  const other = (fpl.item18Other || "0").trim().toUpperCase();

  const item16 = [dest + eet, alt1, alt2].filter(Boolean).join(" ");
  return [
    `(FPL-${id}-${fpl.item8FlightRules || "V"}${fpl.item8FlightType || "G"}`,
    `-${numStr}${ac}/${wake}-${eq}/${surv}`,
    `-${dep}${eobt}`,
    `-${spd}${lvl} ${route}`,
    `-${item16}`,
    `-${other})`,
  ].join("\n");
}

export function createDefaultFlightRelease(): FlightReleaseData {
  return {
    aircraftReg: "SU-BQT",
    aircraftModel: "C172R",
    date: "23/11/2026",
    utcTime: "04:00",
    lessonNo: "EX-04",
    fltCategory: "LCL",
    isDual: true,
    isSolo: false,
    isNight: false,
    isIfr: false,
    isVfr: true,
    crew: [
      { name: "Capt. Mohamed Salah", designation: "01, 02", licenceNo: "", expDate: "" },
      { name: "Mina Hakim", designation: "41", licenceNo: "", expDate: "" },
      { name: "", designation: "", licenceNo: "", expDate: "" },
      { name: "", designation: "", licenceNo: "", expDate: "" },
    ],
    depAd: "HEAT",
    arrAd: "HEAT",
    altAd: "HESG",
    wxWind: "7 NNW",
    wxRwy: "13/31",
    wxTemp: "17°C",
    wxDp: "06°C",
    wxQnh: "1016",
    wxVis: "10 KM (CAVOK)",
    notam: "HEAT RWY 13/31 OPEN · NIL RESTRICTIONS AFFECTING VFR TRG",
    taf: "TAF HEAT 230500Z 2306/2406 33008KT CAVOK",
    metar: "METAR HEAT 230600Z 33007KT CAVOK 17/06 Q1016",
    bewLb: "1707.9",
    bewArmIn: "40.183957",
    bewMoment: "68.63",
    weighingDate: "5/11/2023",
    weighingDueDate: "5/11/2026",
    fuelGal: "35",
    frontPaxLb: "340",
    rearPaxLb: "0",
    baggageALb: "0",
    baggageBLb: "0",
    taxiFuelLb: "-7.0",
    taxiFuelMoment: "-0.3",
    burnGph: "8.5",
    opsSupervisor: "Capt. Amin",
    cfiName: "Capt. Mohamed Salah",
    picName: "Capt. Mohamed Salah",
    issueNo: "01",
    issueDate: "19 July 2019",
    revisionNo: "0",
    revisionDate: "Feb 2021",
    includeWbCharts: true,
  };
}

export function createDefaultIcaoFlightPlan(): IcaoFlightPlanData {
  return {
    aerodrome: "ASSIUT (HEAT)",
    priority: "FF",
    addressees: "HECCZQZX HEATZTZX HELXZTZX HESGZTZX",
    filingTimeUtc: "230330",
    originator: "HEATYOYX",
    specificId: "",
    item3MsgType: "FPL",
    item7AircraftId: "SUBQT",
    item8FlightRules: "V",
    item8FlightType: "G",
    item9Number: "1",
    item9AircraftType: "C172",
    item9WakeCat: "L",
    item10Equipment: "SDG",
    item10Surveillance: "S",
    item13DepIcao: "HEAT",
    item13EobtUtc: "0400",
    item15Speed: "N0105",
    item15Level: "A055",
    item15Route: "DCT AST DCT SHG DCT LXR",
    item16DestIcao: "HELX",
    item16TotalEet: "0115",
    item16Altn1: "HESG",
    item16Altn2: "HEAT",
    item18Other: "DOF/261123 EET/HECC0005 OPR/MISR FLYING COLLEGE RMK/TRAINING FLT",
    item19Endurance: "0530",
    item19Persons: "02",
    item19RadioU: false,
    item19RadioV: true,
    item19RadioE: true,
    item19SurvP: false,
    item19SurvD: true,
    item19SurvM: false,
    item19SurvJ: false,
    item19JacketsL: false,
    item19JacketsF: false,
    item19JacketsU: false,
    item19JacketsV: false,
    item19DinghiesNum: "",
    item19DinghiesCap: "",
    item19DinghiesCover: false,
    item19DinghiesColor: "",
    item19ColorMarkings: "WHITE / NAVY BLUE STRIPE (MFC)",
    item19Remarks: "PPL/CPL TRAINING FLT - MFC ASSIUT DETACHMENT",
    item19Pic: "Capt. Mohamed Salah",
    filedBy: "MFC Ops (Capt. Amin)",
    acceptedBy: "",
    additionalReq: "AFTN / Briefing Desk",
  };
}

export function createDefaultCommsReference(): CommsReferenceData {
  return {
    title: "Misr Flying College — Flying Operation Dept. (Comms, VOR/DME & Clearance Sheet)",
    airacNote: "OPERATIONAL REFERENCE ONLY — Verify current frequencies, NOTAMs & Egypt AIP prior to flight",
    aircraftReg: "SU-BQT",
    pilotInCommand: "Capt. Mohamed Salah",
    departureAd: "HEAT",
    arrivalAd: "HELX",
    clearanceDest: "HELX",
    clearanceVia: "DCT AST DCT SHG DCT LXR",
    clearanceClimb: "A055",
    clearanceSquawk: "7000",
    directorFreq: "132.200",
    metWind: "330 / 07 kt",
    metVis: "10 KM (CAVOK)",
    metClouds: "NSC / FEW 040",
    metTemp: "17°C",
    metDewPoint: "06°C",
    metQnh: "1016",
    metActiveRwy: "RWY 31",
    commFreqList: DEFAULT_MFC_COMM_FREQS.map((c) => ({ ...c })),
    navFreqList: DEFAULT_MFC_NAV_FREQS.map((n) => ({ ...n })),
    transitionAltitude: "4,500 ft MSL",
    transitionLevel: "FL060 (by QNH)",
    mfcOpsFreq: "131.500 MHz (Editable)",
    mfcOpsPhone: "MFC Assiut Ops Desk",
    airports: DEFAULT_AIRPORTS_COMMS.map((a) => ({ ...a })),
    enroute: DEFAULT_ENROUTE_FREQS.map((e) => ({ ...e })),
    extraNotes:
      "• Assiut (HEAT) PPL VFR minimum visibility: >= 5.0 km (checked daily & next day).\n• Always obtain ATIS (HELX 122.600 / HESH 134.000) before initial Approach/Tower contact.\n• Note HESG Tower shows 118.100 on MFC Dispatch Sheet & 118.900/125.050 in AIP — verify before call.\n• Desert routes (HEKG) require survival kit, water, 45-min reserve fuel & ELT armed.",
    includeDetailedPage2: true,
  };
}

export function createDefaultOpsDocuments(): OpsDocumentsState {
  return {
    flightRelease: createDefaultFlightRelease(),
    flightPlan: createDefaultIcaoFlightPlan(),
    commsRef: createDefaultCommsReference(),
  };
}

export function normalizeOpsDocuments(raw?: Partial<OpsDocumentsState>): OpsDocumentsState {
  const def = createDefaultOpsDocuments();
  if (!raw || typeof raw !== "object") return def;

  const frRaw = raw.flightRelease as Partial<FlightReleaseData> | undefined;
  const fplRaw = raw.flightPlan as Partial<IcaoFlightPlanData> | undefined;
  const commsRaw = raw.commsRef as Partial<CommsReferenceData> | undefined;

  let flightRelease = def.flightRelease;
  if (frRaw && typeof frRaw === "object") {
    const mergedFr: FlightReleaseData = {
      ...def.flightRelease,
      ...frRaw,
      crew:
        Array.isArray(frRaw.crew) && frRaw.crew.length === 4
          ? frRaw.crew
          : def.flightRelease.crew,
    };
    // Auto-upgrade legacy POH sample placeholder BEW (1639 / 64.4) to actual EAA fleet W&B data
    if (mergedFr.bewLb === "1639" && mergedFr.bewMoment === "64.4" && !frRaw.bewArmIn) {
      const rec = lookupFleetWeightRecord(mergedFr.aircraftReg || "SU-BQT");
      if (rec) {
        mergedFr.bewLb = String(rec.basicEmptyWeightLb);
        mergedFr.bewArmIn = String(rec.emptyArmIn);
        mergedFr.bewMoment = computeEmptyMoment(rec.basicEmptyWeightLb, rec.emptyArmIn).toFixed(2);
        mergedFr.weighingDate = rec.weighingDate;
        mergedFr.weighingDueDate = rec.weighingDueDate;
        mergedFr.aircraftModel = rec.aircraftClass;
      }
    }
    flightRelease = mergedFr;
  }

  return {
    flightRelease,
    flightPlan:
      fplRaw && typeof fplRaw === "object" ? { ...def.flightPlan, ...fplRaw } : def.flightPlan,
    commsRef:
      commsRaw && typeof commsRaw === "object"
        ? {
            ...def.commsRef,
            ...commsRaw,
            commFreqList:
              Array.isArray(commsRaw.commFreqList) && commsRaw.commFreqList.length > 0
                ? commsRaw.commFreqList
                : def.commsRef.commFreqList,
            navFreqList:
              Array.isArray(commsRaw.navFreqList) && commsRaw.navFreqList.length > 0
                ? commsRaw.navFreqList
                : def.commsRef.navFreqList,
            airports:
              Array.isArray(commsRaw.airports) && commsRaw.airports.length > 0
                ? commsRaw.airports
                : def.commsRef.airports,
            enroute:
              Array.isArray(commsRaw.enroute) && commsRaw.enroute.length > 0
                ? commsRaw.enroute
                : def.commsRef.enroute,
          }
        : def.commsRef,
  };
}
