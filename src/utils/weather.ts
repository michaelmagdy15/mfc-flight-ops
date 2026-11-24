import {
  DayVisibilitySummary,
  HourlyVisibilityPoint,
  WeatherForecastSlot,
  WeatherMeta,
} from "../types";

const PPL_VFR_MIN_KM = 5.0;

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW",
];

function degToCompass16(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  return COMPASS_16[Math.round(norm / 22.5) % 16];
}

function calcRwy13CrosswindKt(speedKt: number, windDeg: number): number {
  const angleRad = ((windDeg - 130) * Math.PI) / 180;
  return Math.round(Math.abs(speedKt * Math.sin(angleRad)));
}

function formatWindCell(speedKt: number, deg: number, gustKt?: number): string {
  const spd = Math.round(speedKt);
  if (spd < 3) return "CALM";
  const dir = degToCompass16(deg);
  const gst = gustKt !== undefined ? Math.round(gustKt) : spd;
  if (gst >= spd + 5) {
    return `${spd} ${dir}\nGST ${gst}`;
  }
  return `${spd} ${dir}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function formatHour12(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${suffix}`;
}

function buildDayVisibilitySummary(
  targetDate: string,
  hourly: { time: string[]; visibility?: number[] }
): DayVisibilitySummary | undefined {
  if (!hourly.visibility || hourly.visibility.length === 0) return undefined;
  const points: HourlyVisibilityPoint[] = [];

  for (let i = 0; i < hourly.time.length; i++) {
    const ts = hourly.time[i];
    if (!ts.startsWith(targetDate)) continue;
    const hour = Number(ts.slice(11, 13));
    if (Number.isNaN(hour) || hour < 6 || hour > 16) continue;
    const visM = hourly.visibility[i];
    if (typeof visM !== "number" || !Number.isFinite(visM)) continue;
    const visKm = Math.round((visM / 1000) * 10) / 10;
    points.push({ hour, label: formatHour12(hour), visibilityKm: visKm });
  }

  if (points.length === 0) return undefined;

  const minVisibilityKm = Math.min(...points.map((p) => p.visibilityKm));
  const maxVisibilityKm = Math.max(...points.map((p) => p.visibilityKm));
  const belowMinHours = points
    .filter((p) => p.visibilityKm < PPL_VFR_MIN_KM)
    .map((p) => `${p.label} (${p.visibilityKm.toFixed(1)} km)`);

  return {
    date: targetDate,
    minVisibilityKm,
    maxVisibilityKm,
    vfrOkForPpl: minVisibilityKm >= PPL_VFR_MIN_KM,
    belowMinHours,
    hourly: points,
  };
}

export interface WeatherFetchResponse {
  ok: boolean;
  slots: WeatherForecastSlot[];
  meta?: WeatherMeta;
  error?: string;
}

export async function fetchAssiutWeather(date: string): Promise<WeatherFetchResponse> {
  // 1. Try Cloudflare Pages Function (/api/weather) first
  try {
    const res = await fetch(`/api/weather?date=${encodeURIComponent(date)}`);
    if (res.ok) {
      const data = (await res.json()) as {
        ok?: boolean;
        station?: string;
        slots?: WeatherForecastSlot[];
        maxCrosswindKt?: number;
        advisory?: string;
        fetchedAt?: string;
        metarRaw?: string;
        metarVisKm?: number | null;
        tafRaw?: string;
        tafMinVisKm?: number | null;
        todayVisibility?: DayVisibilitySummary;
        nextDayVisibility?: DayVisibilitySummary;
        vfrMinKm?: number;
      };
      if (data.ok && Array.isArray(data.slots) && data.slots.length === 3) {
        return {
          ok: true,
          slots: data.slots,
          meta: {
            station: data.station || "HEAT",
            fetchedAt: data.fetchedAt,
            maxCrosswindKt: data.maxCrosswindKt,
            advisory: data.advisory,
            metarRaw: data.metarRaw,
            metarVisKm: data.metarVisKm,
            tafRaw: data.tafRaw,
            tafMinVisKm: data.tafMinVisKm,
            todayVisibility: data.todayVisibility,
            nextDayVisibility: data.nextDayVisibility,
            vfrMinKm: data.vfrMinKm ?? PPL_VFR_MIN_KM,
          },
        };
      }
    }
  } catch {
    // Fall back to direct Open-Meteo request (e.g. local Vite dev)
  }

  // 2. Direct Open-Meteo 2-day fallback (today + next day at HEAT)
  const nextDate = addDaysIso(date, 1);
  const buildUrl = (withRange: boolean) => {
    const base =
      "https://api.open-meteo.com/v1/forecast?latitude=27.0465&longitude=31.0120&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&wind_speed_unit=kn&timezone=Africa%2FCairo";
    return withRange
      ? `${base}&start_date=${encodeURIComponent(date)}&end_date=${encodeURIComponent(nextDate)}`
      : `${base}&forecast_days=2`;
  };

  try {
    let fallbackDay = false;
    let res = await fetch(buildUrl(true));
    if (!res.ok) {
      fallbackDay = true;
      res = await fetch(buildUrl(false));
    }
    if (!res.ok) {
      return { ok: false, slots: [], error: "Unable to reach weather service." };
    }
    const data = (await res.json()) as {
      hourly?: {
        time: string[];
        temperature_2m: number[];
        wind_speed_10m: number[];
        wind_direction_10m: number[];
        wind_gusts_10m: number[];
        visibility?: number[];
      };
    };
    const hourly = data.hourly;
    if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
      return { ok: false, slots: [], error: "Empty weather response." };
    }

    const distinctDates = Array.from(new Set(hourly.time.map((t) => t.slice(0, 10)))).sort();
    const day1Date = distinctDates.includes(date) ? date : distinctDates[0];
    const day2Date = distinctDates.includes(nextDate)
      ? nextDate
      : distinctDates[1] || addDaysIso(day1Date, 1);

    const targets = [
      { suffix: "T09:00", label: "9 AM" },
      { suffix: "T12:00", label: "12 PM" },
      { suffix: "T15:00", label: "3 PM" },
    ];

    const parsed = targets.map(({ suffix, label }) => {
      let idx = hourly.time.indexOf(`${day1Date}${suffix}`);
      if (idx < 0) idx = hourly.time.findIndex((t) => t.endsWith(suffix));
      const safe = idx >= 0 ? idx : 0;
      const spd = hourly.wind_speed_10m?.[safe] ?? 0;
      const deg = hourly.wind_direction_10m?.[safe] ?? 0;
      const gst = hourly.wind_gusts_10m?.[safe] ?? spd;
      const temp = String(Math.round(hourly.temperature_2m?.[safe] ?? 22));
      const visM = hourly.visibility?.[safe] ?? 10000;
      const visibilityKm = Math.round((visM / 1000) * 10) / 10;
      return {
        time: label,
        wind: formatWindCell(spd, deg, gst),
        temp,
        visibilityKm,
        xwind: calcRwy13CrosswindKt(Math.max(spd, gst), deg),
      };
    });

    const todayVisibility = buildDayVisibilitySummary(day1Date, hourly);
    const nextDayVisibility = buildDayVisibilitySummary(day2Date, hourly);
    const maxCrosswindKt = Math.max(...parsed.map((p) => p.xwind), 0);

    const parts: string[] = [];
    if (todayVisibility && !todayVisibility.vfrOkForPpl) {
      parts.push(
        `⛔ HEAT PPL VFR NO-GO (${todayVisibility.date}): Visibility drops below 5.0 km [${todayVisibility.belowMinHours.join(", ")}].`
      );
    }
    if (nextDayVisibility && !nextDayVisibility.vfrOkForPpl) {
      parts.push(
        `⚠️ NEXT DAY (${nextDayVisibility.date}) HEAT VISIBILITY ALERT: Min ${nextDayVisibility.minVisibilityKm.toFixed(1)} km (< 5.0 km PPL VFR min).`
      );
    }
    if (maxCrosswindKt >= 15) {
      parts.push(`⚠️ HIGH CROSSWIND (~${maxCrosswindKt} kt on RWY 13/31) — review SOLO clearances.`);
    } else if (maxCrosswindKt >= 12) {
      parts.push(`⚠️ Moderate crosswind (~${maxCrosswindKt} kt on RWY 13/31).`);
    }

    const advisory =
      parts.length > 0
        ? parts.join(" ")
        : fallbackDay
        ? `✅ Showing current HEAT (${day1Date}) VFR OK: Min ${todayVisibility?.minVisibilityKm.toFixed(1) ?? "10.0"} km · Next day (${day2Date}) min ${nextDayVisibility?.minVisibilityKm.toFixed(1) ?? "10.0"} km.`
        : `✅ HEAT Assiut VFR OK (≥ 5.0 km): Today min ${todayVisibility?.minVisibilityKm.toFixed(1) ?? "10.0"} km · Next day (${day2Date}) min ${nextDayVisibility?.minVisibilityKm.toFixed(1) ?? "10.0"} km.`;

    return {
      ok: true,
      slots: parsed.map(({ time, wind, temp, visibilityKm }) => ({ time, wind, temp, visibilityKm })),
      meta: {
        station: "HEAT",
        fetchedAt: new Date().toISOString(),
        maxCrosswindKt,
        advisory,
        todayVisibility,
        nextDayVisibility,
        vfrMinKm: PPL_VFR_MIN_KM,
      },
    };
  } catch (err) {
    return {
      ok: false,
      slots: [],
      error: err instanceof Error ? err.message : "Weather fetch error",
    };
  }
}
