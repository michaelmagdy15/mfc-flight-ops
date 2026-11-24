# MFC Flight Operations — Daily Schedule & Ops Documents Platform (`v4.2`)

Web platform for **Misr Flying College (MFC)** / **Egyptian Aviation Academy (EAA)** built with React, TypeScript, Tailwind CSS, jsPDF vector document generators, client-side **Word (`.docx`) export**, **Cloudflare Pages + D1** sync, and live AviationWeather METAR/TAF integration.

## Key Capabilities
- **Admin Login & Read-Only Viewer Mode:** Server-enforced HMAC-SHA256 admin session (`PUT /api/state` protected with HTTP `401`). Viewers can inspect schedules, filter/highlight students, and fill/print/download operational documents safely in Read-Only mode.
- **Interactive Flight Schedule Board:** 1-click sortie assignment, drag-and-drop/touch slot swaps, student program switching (`PPL` / `IRCPL`), instructor/aircraft conflict & readiness checks, and auto-drafting.
- **Official MFC Operational Forms (`Ops Forms`):**
  - **C172R Flight Release + W&B & CG Charts:** Official MFC C172R Flight Release (Page 1) plus full dense-grid **Figure 6-6 Loading Graph** & **Figure 6-7 CG Moment Envelope** (Page 2 PDF, live interactive SVG switcher, and print view).
  - **24-Aircraft EAA Fleet Weight & Balance Database (`SU-BNT`–`SU-BTS`):** Selecting or auto-filling any aircraft automatically populates its exact Basic Empty Weight, Empty Arm (in), Moment/1000, Weighing Date, and Due Date.
  - **International Flight Plan (Egypt NANSC / ICAO Doc 4444):** Exact paper replica with English/MFC Logo/RTL Arabic header, comb-tick cells, AFTN builder, and Item 19 crossable checkboxes.
  - **Clearance, Meteorological Report, VOR & Comms Frequencies:** Official MFC 2-column frequency list (`HEAT`, `HELX`, `HESG`, `HEKG`, `HESH`), live 5-airport METAR/TAF monitor, AIP matrix, Great-Circle leg calculator, Crosswind/Headwind & Density Altitude calculators, and C172R V-Speeds/Squawks/Light Gun quick reference.
- **Official Exports & Mobile UI:** Bilingual EN/AR Word (`.docx`), vector PDF, PNG image, WhatsApp summary, and portrait-friendly mobile navigation (`iPhone 13`–`18 Pro Max` & iPad).

## Run Locally
```bash
npm install
npm run dev
```

## Build & Deploy on Cloudflare Pages + D1
```bash
npm run build
npx wrangler d1 migrations apply mfc-flight-ops-db --remote
npx wrangler pages deploy dist --project-name mfc-flight-ops
```
Optional Cloudflare Pages environment secrets: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AUTH_SECRET` (defaults to `admin` / `mfc0000` when unset).
