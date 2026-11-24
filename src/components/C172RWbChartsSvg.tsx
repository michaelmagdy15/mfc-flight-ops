import React from "react";
import {
  C172R_NORMAL_ENVELOPE,
  C172RWbResult,
} from "../data/opsReferenceData";

const LB_IN_TO_KG_MM = 11.521246;
const KG_TO_LB = 2.2046226;

interface C172RWbChartProps {
  wb: C172RWbResult;
  compact?: boolean;
}

/**
 * Cessna Model 172R Section 6 — Figure 6-7. Center of Gravity Moment Envelope
 * Full dense engineering grid (1 lb-in/1000 x 10 lb) with dual Imperial & Metric axes.
 */
export const C172RCgEnvelopeSvg: React.FC<C172RWbChartProps> = ({ wb, compact }) => {
  // ViewBox 440 x 430 leaves ample margins for all 4 axis scales + rotated titles
  const vbW = 440;
  const vbH = 430;
  const gx = 58;
  const gy = 50;
  const gw = 310;
  const gh = 316;

  const mapX = (mom: number) => gx + ((mom - 50) / (120 - 50)) * gw;
  const mapY = (wt: number) => gy + gh - ((wt - 1500) / (2500 - 1500)) * gh;

  const clampM = (m: number) => Math.max(50, Math.min(120, m));
  const clampW = (w: number) => Math.max(1500, Math.min(2500, w));

  const rampX = mapX(clampM(wb.rampMom));
  const rampY = mapY(clampW(wb.rampLb));
  const towX = mapX(clampM(wb.towMom));
  const towY = mapY(clampW(wb.towLb));
  const towOnLeft = wb.towMom > 94;

  // Vertical grid: every 1 lb-in/1000 from 50..120
  const xLines: number[] = [];
  for (let m = 50; m <= 120; m++) xLines.push(m);

  // Horizontal grid: every 10 lb from 1500..2500
  const yLines: number[] = [];
  for (let w = 1500; w <= 2500; w += 10) yLines.push(w);

  // Metric Top ticks: 580..1380 step 20 kg-mm/1000
  const metricTopTicks: number[] = [];
  for (let km = 580; km <= 1380; km += 20) {
    const mLbIn = km / LB_IN_TO_KG_MM;
    if (mLbIn >= 50 && mLbIn <= 120) metricTopTicks.push(km);
  }

  // Metric Right ticks: 690..1130 step 10 kg
  const metricRightTicks: number[] = [];
  for (let kg = 690; kg <= 1130; kg += 10) {
    const wLb = kg * KG_TO_LB;
    if (wLb >= 1500 && wLb <= 2500) metricRightTicks.push(kg);
  }

  // Utility aft + top divider (forward boundary matches Normal polygon)
  const utilityDividerPts = [
    [60.75, 1500],
    [85.05, 2100],
    [76.65, 2100],
  ]
    .map(([m, w]) => `${mapX(m).toFixed(1)},${mapY(w).toFixed(1)}`)
    .join(" ");

  const normalPolygonPts = C172R_NORMAL_ENVELOPE.map(
    ([m, w]) => `${mapX(m).toFixed(1)},${mapY(w).toFixed(1)}`
  ).join(" ");

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className={`w-full rounded-lg border border-slate-300 bg-white ${
        compact ? "max-h-[340px]" : ""
      }`}
      role="img"
      aria-label="Figure 6-7 Center of Gravity Moment Envelope"
    >
      {/* Plot white background */}
      <rect x={gx} y={gy} width={gw} height={gh} fill="#FFFFFF" />

      {/* Dense Vertical Grid (every 1 unit, medium at 5, major at 10) */}
      {xLines.map((m) => {
        const x = mapX(m);
        const isMajor = m % 10 === 0;
        const isMed = !isMajor && m % 5 === 0;
        return (
          <line
            key={`vx-${m}`}
            x1={x}
            y1={gy}
            x2={x}
            y2={gy + gh}
            stroke={isMajor ? "#475569" : isMed ? "#94A3B8" : "#CBD5E1"}
            strokeWidth={isMajor ? 0.85 : isMed ? 0.55 : 0.3}
          />
        );
      })}

      {/* Dense Horizontal Grid (every 10 lb, medium at 50, major at 100) */}
      {yLines.map((w) => {
        const y = mapY(w);
        const isMajor = w % 100 === 0;
        const isMed = !isMajor && w % 50 === 0;
        return (
          <line
            key={`hy-${w}`}
            x1={gx}
            y1={y}
            x2={gx + gw}
            y2={y}
            stroke={isMajor ? "#475569" : isMed ? "#94A3B8" : "#CBD5E1"}
            strokeWidth={isMajor ? 0.85 : isMed ? 0.55 : 0.3}
          />
        );
      })}

      {/* Outer Axis Frame */}
      <rect
        x={gx}
        y={gy}
        width={gw}
        height={gh}
        fill="none"
        stroke="#0F172A"
        strokeWidth="1.4"
      />

      {/* Bottom Imperial Axis Labels */}
      {[50, 60, 70, 80, 90, 100, 110, 120].map((m) => {
        const x = mapX(m);
        return (
          <g key={`bx-${m}`}>
            <line x1={x} y1={gy + gh} x2={x} y2={gy + gh + 4} stroke="#0F172A" strokeWidth="1" />
            <text
              x={x}
              y={gy + gh + 14}
              fontSize="9"
              fontWeight="700"
              textAnchor="middle"
              fill="#0F172A"
            >
              {m}
            </text>
          </g>
        );
      })}
      <text
        x={gx + gw / 2}
        y={gy + gh + 29}
        fontSize="8.5"
        fontWeight="800"
        textAnchor="middle"
        fill="#0F172A"
      >
        LOADED AIRPLANE MOMENT/1000 (POUND-INCHES)
      </text>
      <text
        x={gx + gw / 2}
        y={vbH - 8}
        fontSize="9.5"
        fontWeight="700"
        textAnchor="middle"
        fill="#1E293B"
      >
        Figure 6-7. Center of Gravity Moment Envelope
      </text>

      {/* Left Imperial Axis Labels */}
      {[1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500].map((w) => {
        const y = mapY(w);
        return (
          <g key={`ly-${w}`}>
            <line x1={gx - 4} y1={y} x2={gx} y2={y} stroke="#0F172A" strokeWidth="1" />
            <text
              x={gx - 7}
              y={y + 3}
              fontSize="8.5"
              fontWeight="700"
              textAnchor="end"
              fill="#0F172A"
            >
              {w}
            </text>
          </g>
        );
      })}
      <text
        x={15}
        y={gy + gh / 2}
        fontSize="8.5"
        fontWeight="800"
        textAnchor="middle"
        fill="#0F172A"
        transform={`rotate(-90 15 ${gy + gh / 2})`}
      >
        LOADED AIRPLANE WEIGHT (POUNDS)
      </text>

      {/* Top Metric Axis (kg-mm/1000) */}
      {metricTopTicks.map((km) => {
        const x = mapX(km / LB_IN_TO_KG_MM);
        const major = km % 100 === 0;
        return (
          <g key={`mt-${km}`}>
            <line
              x1={x}
              y1={major ? gy - 5.5 : gy - 3}
              x2={x}
              y2={gy}
              stroke="#0F172A"
              strokeWidth={major ? 1 : 0.65}
            />
            {major && (
              <text
                x={x}
                y={gy - 9}
                fontSize="8.5"
                fontWeight="700"
                textAnchor="middle"
                fill="#0F172A"
              >
                {km}
              </text>
            )}
          </g>
        );
      })}
      <text
        x={gx + gw / 2}
        y={17}
        fontSize="8.5"
        fontWeight="800"
        textAnchor="middle"
        fill="#0F172A"
      >
        LOADED AIRPLANE MOMENT/1000 (KILOGRAM-MILLIMETERS)
      </text>

      {/* Right Metric Axis (kg) */}
      {metricRightTicks.map((kg) => {
        const y = mapY(kg * KG_TO_LB);
        const major = kg % 50 === 0;
        return (
          <g key={`mr-${kg}`}>
            <line
              x1={gx + gw}
              y1={y}
              x2={gx + gw + (major ? 5.5 : 3)}
              y2={y}
              stroke="#0F172A"
              strokeWidth={major ? 1 : 0.65}
            />
            {major && (
              <text
                x={gx + gw + 8}
                y={y + 3}
                fontSize="8.5"
                fontWeight="700"
                textAnchor="start"
                fill="#0F172A"
              >
                {kg}
              </text>
            )}
          </g>
        );
      })}
      <text
        x={vbW - 14}
        y={gy + gh / 2}
        fontSize="8.5"
        fontWeight="800"
        textAnchor="middle"
        fill="#0F172A"
        transform={`rotate(-90 ${vbW - 14} ${gy + gh / 2})`}
      >
        LOADED AIRPLANE WEIGHT (KILOGRAMS)
      </text>

      {/* Envelope Shading & Polygons */}
      <polygon
        points={normalPolygonPts}
        fill="rgba(27, 54, 93, 0.06)"
        stroke="#1B365D"
        strokeWidth="2.1"
      />
      <polyline
        points={utilityDividerPts}
        fill="none"
        stroke="#057A55"
        strokeWidth="1.7"
        strokeDasharray="5 3"
      />

      {/* POH Callout Boxes inside Grid */}
      <g>
        <rect
          x={mapX(52)}
          y={mapY(2405)}
          width={mapX(82.5) - mapX(52)}
          height={mapY(2325) - mapY(2405)}
          fill="#FFFFFF"
          stroke="#0F172A"
          strokeWidth="0.9"
        />
        <text
          x={mapX(67.25)}
          y={mapY(2373)}
          fontSize="7.6"
          fontWeight="800"
          textAnchor="middle"
          fill="#0F172A"
        >
          CENTER OF GRAVITY
        </text>
        <text
          x={mapX(67.25)}
          y={mapY(2340)}
          fontSize="7.6"
          fontWeight="800"
          textAnchor="middle"
          fill="#0F172A"
        >
          MOMENT ENVELOPE
        </text>
      </g>

      <g>
        <rect
          x={mapX(97.5)}
          y={mapY(2385)}
          width={mapX(113) - mapX(97.5)}
          height={mapY(2310) - mapY(2385)}
          rx="2"
          fill="rgba(255,255,255,0.94)"
        />
        <text
          x={mapX(105.25)}
          y={mapY(2354)}
          fontSize="7.6"
          fontWeight="800"
          textAnchor="middle"
          fill="#1B365D"
        >
          NORMAL
        </text>
        <text
          x={mapX(105.25)}
          y={mapY(2324)}
          fontSize="7.6"
          fontWeight="800"
          textAnchor="middle"
          fill="#1B365D"
        >
          CATEGORY
        </text>
      </g>

      <g transform={`rotate(-58 ${mapX(71.5)} ${mapY(1885)})`}>
        <rect
          x={mapX(71.5) - 27}
          y={mapY(1885) - 11}
          width="54"
          height="20"
          rx="2"
          fill="rgba(255,255,255,0.9)"
        />
        <text
          x={mapX(71.5)}
          y={mapY(1885) - 2}
          fontSize="7.5"
          fontWeight="800"
          textAnchor="middle"
          fill="#057A55"
        >
          UTILITY
        </text>
        <text
          x={mapX(71.5)}
          y={mapY(1885) + 7}
          fontSize="7.5"
          fontWeight="800"
          textAnchor="middle"
          fill="#057A55"
        >
          CATEGORY
        </text>
      </g>

      {/* Live Ramp -> Takeoff Aircraft Point */}
      <line x1={rampX} y1={rampY} x2={towX} y2={towY} stroke="#C00000" strokeWidth="1.6" />
      <circle cx={rampX} cy={rampY} r="3.4" fill="#475569" stroke="#FFFFFF" strokeWidth="0.9" />
      <circle cx={towX} cy={towY} r="5" fill="#C00000" stroke="#FFFFFF" strokeWidth="1.5" />
      <rect
        x={towOnLeft ? towX - 96 : towX + 7}
        y={Math.max(gy + 4, towY - 17)}
        width="89"
        height="15"
        rx="3"
        fill="rgba(255,255,255,0.94)"
        stroke="#C00000"
        strokeWidth="0.8"
      />
      <text
        x={towOnLeft ? towX - 51.5 : towX + 51.5}
        y={Math.max(gy + 14, towY - 7)}
        fontSize="7.8"
        fontWeight="800"
        textAnchor="middle"
        fill="#C00000"
      >
        TOW {wb.towLb.toFixed(0)}lb / {wb.towMom.toFixed(1)}
      </text>
    </svg>
  );
};

/**
 * Cessna Model 172R Section 6 — Figure 6-6. Loading Graph
 * Full dense engineering grid (1 lb-in/1000 x 10 lb) with dual Imperial & Metric axes
 * and live aircraft station markers.
 */
export const C172RLoadingGraphSvg: React.FC<C172RWbChartProps> = ({ wb, compact }) => {
  const vbW = 440;
  const vbH = 430;
  const gx = 54;
  const gy = 50;
  const gw = 312;
  const gh = 304;

  const mapX = (mom: number) => gx + (mom / 35) * gw;
  const mapY = (wt: number) => gy + gh - (wt / 450) * gh;

  const xLines: number[] = [];
  for (let m = 0; m <= 35; m++) xLines.push(m);

  const yLines: number[] = [];
  for (let w = 0; w <= 450; w += 10) yLines.push(w);

  const metricTopTicks: number[] = [];
  for (let km = 0; km <= 400; km += 10) {
    const mLbIn = km / LB_IN_TO_KG_MM;
    if (mLbIn <= 35) metricTopTicks.push(km);
  }

  const metricRightTicks: number[] = [];
  for (let kg = 0; kg <= 200; kg += 5) {
    const wLb = kg * KG_TO_LB;
    if (wLb <= 450) metricRightTicks.push(kg);
  }

  const loadRays = [
    { arm: 37, maxW: 400, label: "PILOT & FRONT PASSENGER", lx: 8.4, ly: 270, angle: -64 },
    { arm: 48, maxW: 318, label: "FUEL (6 LBS/GAL)", lx: 12.9, ly: 258, angle: -57.5 },
    { arm: 73, maxW: 400, label: "REAR PASSENGERS", lx: 22.8, ly: 325, angle: -46 },
    { arm: 95, maxW: 120, label: "BAGGAGE AREA 1", lx: 12.2, ly: 102, angle: -38.5 },
    { arm: 123, maxW: 50, label: "BAGGAGE AREA 2", lx: 7.2, ly: 36, angle: -32 },
  ];

  const stations = [
    { tag: "Front", w: wb.frontPaxLb, m: wb.frontPaxMom },
    { tag: "Fuel", w: wb.fuelLb, m: wb.fuelMom },
    { tag: "Rear", w: wb.rearPaxLb, m: wb.rearPaxMom },
    { tag: "BagA", w: wb.bagALb, m: wb.bagAMom },
    { tag: "BagB", w: wb.bagBLb, m: wb.bagBMom },
  ].filter((s) => s.w > 0 && s.m > 0 && s.w <= 450 && s.m <= 35);

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className={`w-full rounded-lg border border-slate-300 bg-white ${
        compact ? "max-h-[340px]" : ""
      }`}
      role="img"
      aria-label="Figure 6-6 Loading Graph"
    >
      <rect x={gx} y={gy} width={gw} height={gh} fill="#FFFFFF" />

      {/* Dense Vertical Grid */}
      {xLines.map((m) => {
        const x = mapX(m);
        const major = m % 5 === 0;
        return (
          <line
            key={`gx-${m}`}
            x1={x}
            y1={gy}
            x2={x}
            y2={gy + gh}
            stroke={major ? "#475569" : "#CBD5E1"}
            strokeWidth={major ? 0.8 : 0.32}
          />
        );
      })}

      {/* Dense Horizontal Grid */}
      {yLines.map((w) => {
        const y = mapY(w);
        const major = w % 50 === 0;
        return (
          <line
            key={`gy-${w}`}
            x1={gx}
            y1={y}
            x2={gx + gw}
            y2={y}
            stroke={major ? "#475569" : "#CBD5E1"}
            strokeWidth={major ? 0.8 : 0.32}
          />
        );
      })}

      <rect
        x={gx}
        y={gy}
        width={gw}
        height={gh}
        fill="none"
        stroke="#0F172A"
        strokeWidth="1.4"
      />

      {/* Bottom Imperial X Axis */}
      {[0, 5, 10, 15, 20, 25, 30, 35].map((m) => {
        const x = mapX(m);
        return (
          <g key={`bx-${m}`}>
            <line x1={x} y1={gy + gh} x2={x} y2={gy + gh + 4} stroke="#0F172A" strokeWidth="1" />
            <text
              x={x}
              y={gy + gh + 14}
              fontSize="9"
              fontWeight="700"
              textAnchor="middle"
              fill="#0F172A"
            >
              {m}
            </text>
          </g>
        );
      })}
      <text
        x={gx + gw / 2}
        y={gy + gh + 29}
        fontSize="8.5"
        fontWeight="800"
        textAnchor="middle"
        fill="#0F172A"
      >
        LOAD MOMENT/1000 (POUNDS - INCHES)
      </text>
      <text
        x={gx + gw / 2}
        y={vbH - 8}
        fontSize="9.5"
        fontWeight="700"
        textAnchor="middle"
        fill="#1E293B"
      >
        Figure 6-6. Loading Graph
      </text>

      {/* Left Imperial Y Axis */}
      {[0, 50, 100, 150, 200, 250, 300, 350, 400].map((w) => {
        const y = mapY(w);
        return (
          <g key={`ly-${w}`}>
            <line x1={gx - 4} y1={y} x2={gx} y2={y} stroke="#0F172A" strokeWidth="1" />
            <text
              x={gx - 7}
              y={y + 3}
              fontSize="8.5"
              fontWeight="700"
              textAnchor="end"
              fill="#0F172A"
            >
              {w}
            </text>
          </g>
        );
      })}
      <text
        x={15}
        y={gy + gh / 2}
        fontSize="8.5"
        fontWeight="800"
        textAnchor="middle"
        fill="#0F172A"
        transform={`rotate(-90 15 ${gy + gh / 2})`}
      >
        WEIGHT (POUNDS)
      </text>

      {/* Top Metric Axis */}
      {metricTopTicks.map((km) => {
        const x = mapX(km / LB_IN_TO_KG_MM);
        const major = km % 50 === 0;
        return (
          <g key={`mt-${km}`}>
            <line
              x1={x}
              y1={major ? gy - 5.5 : gy - 3}
              x2={x}
              y2={gy}
              stroke="#0F172A"
              strokeWidth={major ? 1 : 0.65}
            />
            {major && (
              <text
                x={x}
                y={gy - 9}
                fontSize="8.5"
                fontWeight="700"
                textAnchor="middle"
                fill="#0F172A"
              >
                {km}
              </text>
            )}
          </g>
        );
      })}
      <text
        x={gx + gw / 2}
        y={17}
        fontSize="8.5"
        fontWeight="800"
        textAnchor="middle"
        fill="#0F172A"
      >
        LOAD MOMENT/1000 (KILOGRAM - MILLIMETERS)
      </text>

      {/* Right Metric Axis */}
      {metricRightTicks.map((kg) => {
        const y = mapY(kg * KG_TO_LB);
        const major = kg % 25 === 0;
        return (
          <g key={`mr-${kg}`}>
            <line
              x1={gx + gw}
              y1={y}
              x2={gx + gw + (major ? 5.5 : 3)}
              y2={y}
              stroke="#0F172A"
              strokeWidth={major ? 1 : 0.65}
            />
            {major && (
              <text
                x={gx + gw + 8}
                y={y + 3}
                fontSize="8.5"
                fontWeight="700"
                textAnchor="start"
                fill="#0F172A"
              >
                {kg}
              </text>
            )}
          </g>
        );
      })}
      <text
        x={vbW - 14}
        y={gy + gh / 2}
        fontSize="8.5"
        fontWeight="800"
        textAnchor="middle"
        fill="#0F172A"
        transform={`rotate(-90 ${vbW - 14} ${gy + gh / 2})`}
      >
        WEIGHT (KILOGRAMS)
      </text>

      {/* 5 Diagonal Station Lines */}
      {loadRays.map((ray) => {
        const clampedM = (Math.min(ray.maxW, (35 * 1000) / ray.arm) * ray.arm) / 1000;
        const clampedW = (clampedM * 1000) / ray.arm;
        const x2 = mapX(clampedM);
        const y2 = mapY(clampedW);
        const labelX = mapX(ray.lx);
        const labelY = mapY(ray.ly);
        return (
          <g key={ray.label}>
            <line x1={gx} y1={gy + gh} x2={x2} y2={y2} stroke="#1B365D" strokeWidth="1.65" />
            <text
              x={labelX}
              y={labelY}
              fontSize="6.7"
              fontWeight="800"
              textAnchor="middle"
              fill="#1B365D"
              stroke="#FFFFFF"
              strokeWidth="2.8"
              paintOrder="stroke"
              transform={`rotate(${ray.angle} ${labelX} ${labelY})`}
            >
              {ray.label}
            </text>
          </g>
        );
      })}

      {/* Framed LOADING GRAPH Callout Box */}
      <g>
        <rect
          x={mapX(22.5)}
          y={mapY(205)}
          width={mapX(31.5) - mapX(22.5)}
          height={mapY(155) - mapY(205)}
          fill="#FFFFFF"
          stroke="#0F172A"
          strokeWidth="1"
        />
        <text
          x={mapX(27)}
          y={mapY(185)}
          fontSize="8"
          fontWeight="800"
          textAnchor="middle"
          fill="#0F172A"
        >
          LOADING
        </text>
        <text
          x={mapX(27)}
          y={mapY(165)}
          fontSize="8"
          fontWeight="800"
          textAnchor="middle"
          fill="#0F172A"
        >
          GRAPH
        </text>
      </g>

      {/* Live Station Points */}
      {stations.map((st) => {
        const px = mapX(st.m);
        const py = mapY(st.w);
        return (
          <g key={st.tag}>
            <circle cx={px} cy={py} r="4.2" fill="#C00000" stroke="#FFFFFF" strokeWidth="1.3" />
            <text
              x={px + 6}
              y={py + 3}
              fontSize="7.4"
              fontWeight="800"
              fill="#C00000"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              paintOrder="stroke"
            >
              {st.tag} ({st.w}lb)
            </text>
          </g>
        );
      })}
    </svg>
  );
};
