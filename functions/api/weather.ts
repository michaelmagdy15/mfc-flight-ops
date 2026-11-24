interface PagesContext {
  request: Request;
}

interface HourlyVisibilityPoint {
  hour: number;
  label: string;
  visibilityKm: number;
}

interface DayVisibilitySummary {
  date: string;
  minVisibilityKm: number;
  maxVisibilityKm: number;
  vfrOkForPpl: boolean;
  belowMinHours: string[];
  hourly: HourlyVisibilityPoint[];
}

interface WeatherSlotResult {
  time: string;
  wind: string;
  temp: string;
  visibilityKm: number;
  crosswindKt: number;
}

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

function parseIcaoVisibilityKm(rawText?: string): number | null {
  if (!rawText) return null;
  const tokens = rawText.trim().split(/\s+/);
  let seenTimestamp = false;
  let minKm: number | null = null;

  for (const tok of tokens) {
    if (/^\d{6}Z$/.test(tok)) {
      seenTimestamp = true;
      continue;
    }
    if (!seenTimestamp) continue;
    if (tok === "CAVOK" || tok === "9999") {
      minKm = minKm === null ? 10.0 : Math.min(minKm, 10.0);
      continue;
    }
    if (/^\d{4}$/.test(tok)) {
      const km = Math.round((Number(tok) / 1000) * 10) / 10;
      minKm = minKm === null ? km : Math.min(minKm, km);
    }
  }
  return minKm;
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

async function fetchHeatMetarAndTaf(): Promise<{
  metarRaw?: string;
  metarVisKm?: number | null;
  metarWind?: string;
  metarTemp?: string;
  metarXwind?: number;
  tafRaw?: string;
  tafMinVisKm?: number | null;
}> {
  const [metarRes, tafRes] = await Promise.allSettled([
    fetch("https://aviationweather.gov/api/data/metar?ids=HEAT&format=json"),
    fetch("https://aviationweather.gov/api/data/taf?ids=HEAT&format=json"),
  ]);

  let metarRaw: string | undefined;
  let metarVisKm: number | null = null;
  let metarWind: string | undefined;
  let metarTemp: string | undefined;
  let metarXwind: number | undefined;

  if (metarRes.status === "fulfilled" && metarRes.value.ok) {
    try {
      const metars = (await metarRes.value.json()) as {
        rawOb?: string;
        visib?: string | number;
        wdir?: number | string;
        wspd?: number;
        wgst?: number;
        temp?: number;
      }[];
      if (Array.isArray(metars) && metars.length > 0) {
        const m = metars[0];
        metarRaw = m.rawOb;
        metarVisKm = parseIcaoVisibilityKm(m.rawOb);
        if (metarVisKm === null && m.visib !== undefined) {
          if (String(m.visib).includes("+")) metarVisKm = 10.0;
          else if (!Number.isNaN(Number(m.visib))) {
            metarVisKm = Math.round(Number(m.visib) * 1.60934 * 10) / 10;
          }
        }
        const spd = Number(m.wspd ?? 0);
        const deg = typeof m.wdir === "number" ? m.wdir : 0;
        const gst = m.wgst !== undefined ? Number(m.wgst) : spd;
        metarTemp = String(Math.round(Number(m.temp ?? 22)));
        metarWind = formatWindCell(spd, deg, gst);
        metarXwind = calcRwy13CrosswindKt(Math.max(spd, gst), deg);
      }
    } catch {
      // ignore malformed METAR response
    }
  }

  let tafRaw: string | undefined;
  let tafMinVisKm: number | null = null;

  if (tafRes.status === "fulfilled" && tafRes.value.ok) {
    try {
      const tafs = (await tafRes.value.json()) as {
        rawTAF?: string;
        fcsts?: { visib?: string | number }[];
      }[];
      if (Array.isArray(tafs) && tafs.length > 0) {
        const t = tafs[0];
        tafRaw = t.rawTAF;
        tafMinVisKm = parseIcaoVisibilityKm(t.rawTAF);
        if (tafMinVisKm === null && Array.isArray(t.fcsts)) {
          const vals = t.fcsts
            .map((f) =>
              String(f.visib || "").includes("+")
                ? 10.0
                : Number.isNaN(Number(f.visib))
                ? null
                : Math.round(Number(f.visib) * 1.60934 * 10) / 10
            )
            .filter((v): v is number => v !== null);
          if (vals.length > 0) tafMinVisKm = Math.min(...vals);
        }
      }
    } catch {
      // ignore malformed TAF response
    }
  }

  return { metarRaw, metarVisKm, metarWind, metarTemp, metarXwind, tafRaw, tafMinVisKm };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

interface StationWeatherSummary {
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

async function fetchStationsMetarAndTaf(icaos: string[]): Promise<StationWeatherSummary[]> {
  const ids = icaos.join(",");
  const [metarRes, tafRes] = await Promise.allSettled([
    fetch(`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(ids)}&format=json`),
    fetch(`https://aviationweather.gov/api/data/taf?ids=${encodeURIComponent(ids)}&format=json`),
  ]);

  const metarByIcao = new Map<
    string,
    {
      icaoId?: string;
      stationId?: string;
      rawOb?: string;
      visib?: string | number;
      wdir?: number | string;
      wspd?: number;
      wgst?: number;
      temp?: number;
      altim?: number;
      obsTime?: string;
      reportTime?: string;
    }
  >();

  if (metarRes.status === "fulfilled" && metarRes.value.ok) {
    try {
      const list = (await metarRes.value.json()) as Array<{
        icaoId?: string;
        stationId?: string;
        rawOb?: string;
        visib?: string | number;
        wdir?: number | string;
        wspd?: number;
        wgst?: number;
        temp?: number;
        altim?: number;
        obsTime?: string;
        reportTime?: string;
      }>;
      if (Array.isArray(list)) {
        for (const m of list) {
          const id = (m.icaoId || m.stationId || "").toUpperCase();
          if (id) metarByIcao.set(id, m);
        }
      }
    } catch {
      // ignore malformed multi-METAR JSON
    }
  }

  const tafByIcao = new Map<string, string>();
  if (tafRes.status === "fulfilled" && tafRes.value.ok) {
    try {
      const list = (await tafRes.value.json()) as Array<{
        icaoId?: string;
        stationId?: string;
        rawTAF?: string;
      }>;
      if (Array.isArray(list)) {
        for (const t of list) {
          const id = (t.icaoId || t.stationId || "").toUpperCase();
          if (id && t.rawTAF) tafByIcao.set(id, t.rawTAF);
        }
      }
    } catch {
      // ignore malformed multi-TAF JSON
    }
  }

  return icaos.map((icao) => {
    const m = metarByIcao.get(icao);
    const metarRaw = m?.rawOb;
    let visKm = parseIcaoVisibilityKm(metarRaw);
    if (visKm === null && m?.visib !== undefined) {
      if (String(m.visib).includes("+")) visKm = 10.0;
      else if (!Number.isNaN(Number(m.visib))) {
        visKm = Math.round(Number(m.visib) * 1.60934 * 10) / 10;
      }
    }
    const spd = m?.wspd !== undefined ? Number(m.wspd) : undefined;
    const deg = typeof m?.wdir === "number" ? m.wdir : 0;
    const gst = m?.wgst !== undefined ? Number(m.wgst) : spd;
    const wind = spd !== undefined ? formatWindCell(spd, deg, gst) : undefined;
    const tempC = typeof m?.temp === "number" ? Math.round(m.temp) : undefined;
    const rawAltim = typeof m?.altim === "number" ? m.altim : undefined;
    const altimHpa =
      rawAltim !== undefined
        ? rawAltim < 100
          ? Math.round(rawAltim * 33.8639)
          : Math.round(rawAltim)
        : undefined;

    return {
      icao,
      metarRaw,
      tafRaw: tafByIcao.get(icao),
      visKm,
      wind,
      tempC,
      altimHpa,
      vfrOkForPpl: visKm === null ? true : visKm >= PPL_VFR_MIN_KM,
      obsTime: m?.reportTime || m?.obsTime,
    };
  });
}

export const onRequestGet = async (context: PagesContext): Promise<Response> => {
  const url = new URL(context.request.url);
  const stationsParam = url.searchParams.get("stations");
  if (stationsParam) {
    const requested = Array.from(
      new Set(
        stationsParam
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter((s) => /^[A-Z]{4}$/.test(s))
      )
    ).slice(0, 8);
    if (requested.length === 0) {
      return jsonResponse({ ok: false, error: "No valid 4-letter ICAO stations supplied." }, 400);
    }
    try {
      const stations = await fetchStationsMetarAndTaf(requested);
      return jsonResponse({
        ok: true,
        fetchedAt: new Date().toISOString(),
        stations,
      });
    } catch (err) {
      return jsonResponse(
        { ok: false, error: err instanceof Error ? err.message : "Station weather fetch failed" },
        502
      );
    }
  }

  const dateParam = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const nextDateParam = addDaysIso(dateParam, 1);

  // Assiut International Airport (HEAT): 27.0465° N, 31.0120° E, RWY 13/31
  const buildOpenMeteoUrl = (useDateRange: boolean) => {
    const base =
      "https://api.open-meteo.com/v1/forecast?latitude=27.0465&longitude=31.0120&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&wind_speed_unit=kn&timezone=Africa%2FCairo";
    return useDateRange
      ? `${base}&start_date=${encodeURIComponent(dateParam)}&end_date=${encodeURIComponent(nextDateParam)}`
      : `${base}&forecast_days=2`;
  };

  try {
    const metarTafPromise = fetchHeatMetarAndTaf();

    let usedFallbackCurrent = false;
    let res = await fetch(buildOpenMeteoUrl(true));
    if (!res.ok) {
      usedFallbackCurrent = true;
      res = await fetch(buildOpenMeteoUrl(false));
    }

    const metarTaf = await metarTafPromise;

    if (res.ok) {
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
      if (hourly && Array.isArray(hourly.time) && hourly.time.length > 0) {
        const distinctDates = Array.from(new Set(hourly.time.map((t) => t.slice(0, 10)))).sort();
        const day1Date = distinctDates.includes(dateParam) ? dateParam : distinctDates[0];
        const day2Date = distinctDates.includes(nextDateParam)
          ? nextDateParam
          : distinctDates[1] || addDaysIso(day1Date, 1);

        const targetHours = [
          { hourSuffix: "T09:00", label: "9 AM" },
          { hourSuffix: "T12:00", label: "12 PM" },
          { hourSuffix: "T15:00", label: "3 PM" },
        ];

        const slots: WeatherSlotResult[] = targetHours.map(({ hourSuffix, label }) => {
          const targetTs = `${day1Date}${hourSuffix}`;
          let idx = hourly.time.indexOf(targetTs);
          if (idx < 0) idx = hourly.time.findIndex((t) => t.endsWith(hourSuffix));
          const safeIdx = idx >= 0 ? idx : 0;
          const spd = hourly.wind_speed_10m?.[safeIdx] ?? 0;
          const deg = hourly.wind_direction_10m?.[safeIdx] ?? 0;
          const gst = hourly.wind_gusts_10m?.[safeIdx] ?? spd;
          const temp = Math.round(hourly.temperature_2m?.[safeIdx] ?? 22);
          const visM = hourly.visibility?.[safeIdx] ?? 10000;
          const visKm = Math.round((visM / 1000) * 10) / 10;
          const xwind = calcRwy13CrosswindKt(Math.max(spd, gst), deg);
          return {
            time: label,
            wind: formatWindCell(spd, deg, gst),
            temp: String(temp),
            visibilityKm: visKm,
            crosswindKt: xwind,
          };
        });

        const todayVisibility = buildDayVisibilitySummary(day1Date, hourly);
        const nextDayVisibility = buildDayVisibilitySummary(day2Date, hourly);
        const maxCrosswindKt = Math.max(...slots.map((s) => s.crosswindKt), 0);

        const parts: string[] = [];
        if (todayVisibility && !todayVisibility.vfrOkForPpl) {
          parts.push(
            `⛔ HEAT PPL VFR NO-GO (${todayVisibility.date}): Visibility drops below 5.0 km [${todayVisibility.belowMinHours.join(", ")}]. PPL VFR flights prohibited.`
          );
        }
        if (nextDayVisibility && !nextDayVisibility.vfrOkForPpl) {
          parts.push(
            `⚠️ NEXT DAY (${nextDayVisibility.date}) HEAT VISIBILITY ALERT: Min ${nextDayVisibility.minVisibilityKm.toFixed(1)} km [${nextDayVisibility.belowMinHours.join(", ")}] — below 5.0 km PPL VFR min.`
          );
        }
        if (metarTaf.metarVisKm !== null && metarTaf.metarVisKm !== undefined && metarTaf.metarVisKm < PPL_VFR_MIN_KM) {
          parts.push(`⛔ Live HEAT METAR reports ${metarTaf.metarVisKm.toFixed(1)} km (< 5.0 km PPL VFR min).`);
        }
        if (maxCrosswindKt >= 15) {
          parts.push(`⚠️ HIGH CROSSWIND (~${maxCrosswindKt} kt RWY 13/31) — review SOLO clearances.`);
        } else if (maxCrosswindKt >= 12) {
          parts.push(`⚠️ Moderate crosswind (~${maxCrosswindKt} kt RWY 13/31).`);
        }

        const advisory =
          parts.length > 0
            ? parts.join(" ")
            : usedFallbackCurrent
            ? `✅ Date outside forecast window — showing current HEAT (${day1Date}) VFR OK: Min ${todayVisibility?.minVisibilityKm.toFixed(1) ?? "10.0"} km · Next day (${day2Date}) min ${nextDayVisibility?.minVisibilityKm.toFixed(1) ?? "10.0"} km · RWY 13/31 x-wind ~${maxCrosswindKt} kt.`
            : `✅ HEAT Assiut VFR OK (≥ 5.0 km): Today min ${todayVisibility?.minVisibilityKm.toFixed(1) ?? "10.0"} km · Next day (${day2Date}) min ${nextDayVisibility?.minVisibilityKm.toFixed(1) ?? "10.0"} km · RWY 13/31 max x-wind ~${maxCrosswindKt} kt.`;

        return jsonResponse({
          ok: true,
          station: "HEAT",
          source: "open-meteo",
          slots: slots.map(({ time, wind, temp, visibilityKm }) => ({ time, wind, temp, visibilityKm })),
          maxCrosswindKt,
          advisory,
          fetchedAt: new Date().toISOString(),
          metarRaw: metarTaf.metarRaw,
          metarVisKm: metarTaf.metarVisKm ?? null,
          tafRaw: metarTaf.tafRaw,
          tafMinVisKm: metarTaf.tafMinVisKm ?? null,
          todayVisibility,
          nextDayVisibility,
          vfrMinKm: PPL_VFR_MIN_KM,
        });
      }
    }

    if (metarTaf.metarRaw && metarTaf.metarWind) {
      const visKm = metarTaf.metarVisKm ?? 10.0;
      const vfrOk = visKm >= PPL_VFR_MIN_KM;
      const xwind = metarTaf.metarXwind ?? 0;
      const points: HourlyVisibilityPoint[] = [9, 12, 15].map((h) => ({
        hour: h,
        label: formatHour12(h),
        visibilityKm: visKm,
      }));
      return jsonResponse({
        ok: true,
        station: "HEAT",
        source: "aviationweather-metar",
        slots: [
          { time: "9 AM", wind: metarTaf.metarWind, temp: metarTaf.metarTemp || "22", visibilityKm: visKm },
          { time: "12 PM", wind: metarTaf.metarWind, temp: metarTaf.metarTemp || "22", visibilityKm: visKm },
          { time: "3 PM", wind: metarTaf.metarWind, temp: metarTaf.metarTemp || "22", visibilityKm: visKm },
        ],
        maxCrosswindKt: xwind,
        advisory: vfrOk
          ? `✅ HEAT METAR VFR OK (${visKm.toFixed(1)} km · x-wind ~${xwind} kt).`
          : `⛔ HEAT METAR PPL VFR NO-GO (${visKm.toFixed(1)} km < 5.0 km minimum).`,
        fetchedAt: new Date().toISOString(),
        metarRaw: metarTaf.metarRaw,
        metarVisKm: metarTaf.metarVisKm ?? null,
        tafRaw: metarTaf.tafRaw,
        tafMinVisKm: metarTaf.tafMinVisKm ?? null,
        todayVisibility: {
          date: dateParam,
          minVisibilityKm: visKm,
          maxVisibilityKm: visKm,
          vfrOkForPpl: vfrOk,
          belowMinHours: vfrOk ? [] : [`METAR (${visKm.toFixed(1)} km)`],
          hourly: points,
        },
        vfrMinKm: PPL_VFR_MIN_KM,
      });
    }

    return jsonResponse({ ok: false, error: "Could not fetch HEAT Assiut weather right now." }, 502);
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Weather fetch failed" },
      500
    );
  }
};
