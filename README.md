# ELD Trip Planner

Plan a property-carrying truck trip under FMCSA Hours-of-Service rules and get:

- **turn-by-turn route instructions** for each leg (current → pickup → drop-off), and
- a **route map** with every pickup, drop-off, fuel stop, 30-minute break, 10-hour rest and 34-hour restart, and
- **filled-out Driver's Daily Log sheets**, one per calendar day, drawn on the standard paper-log grid (print or download as PDF).

**Inputs:** current location, pickup location, drop-off location, current cycle used (hrs), optional departure time.

**Stack:** Django 5 + Django REST Framework (API, HOS engine) · React 18 + TypeScript + Vite + Tailwind (UI) · Leaflet + OpenStreetMap tiles · OSRM routing · Photon/Nominatim geocoding — all free and keyless.

---

## HOS rules applied (49 CFR 395, 70 hr / 8 day)

| Rule | Behaviour |
| --- | --- |
| 11-hour driving limit | Max 11 h driving per shift, then a 10-h sleeper-berth rest |
| 14-hour window | No driving after hour 14 of the shift (breaks don't extend it) |
| 30-minute break | After 8 cumulative driving hours; any ≥30 min non-driving stop (fuel, pickup…) counts |
| 70 h / 8 days | All on-duty time counts; when exhausted a 34-h restart resets the cycle |
| Fuel | 30 min on duty at least every 1,000 miles (taken early if it can double as the 30-min break) |
| Pickup / drop-off | 1 h on duty each |
| Inspections | 30 min pre-trip at departure, 30 min post-trip at arrival |

**Assumptions:** driver starts after a full 10-h rest; "cycle used" hours all sit inside the rolling 8-day window; drive times come from OSRM and are rounded to 15-minute log increments; home-terminal time zone = time zone of the current location; no split sleeper-berth pairings; no adverse conditions.

## How it works

```
React ──POST /api/trips/plan/──► Django
                                 ├─ geo.py          geocode (Nominatim → Photon) + OSRM route
                                 ├─ directions.py   OSRM maneuvers → readable turn-by-turn steps
                                 ├─ hos_engine.py   pure-Python clock simulation of the rules above
                                 └─ log_builder.py  midnight-to-midnight sheets, totals, remarks, recap
```

- **`backend/trips/services/hos_engine.py`** walks the clock forward leg by leg. Before each driving chunk it computes how much time is left under every limit (11 h, 14 h, 8 h-since-break, 70 h, miles-to-fuel), drives the minimum, and inserts whichever stop the binding limit requires.
- **`backend/trips/services/log_builder.py`** pads the trip with off-duty time to whole days, slices it at midnight, totals each duty row (always 24 h), places a "City, ST" remark at every status change (offline nearest-city lookup over a bundled GeoNames extract, so long trips stay fast), and fills the 70-hour recap.
- **`frontend/src/components/LogSheet.tsx`** draws the paper form as SVG — header, 15-minute-tick grid, duty line, totals, angled remarks, shipping documents and recap — with entries in "handwriting".

## Run locally

```bash
# API  (http://localhost:8000)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver

# UI   (http://localhost:5173)
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:8000
npm install && npm run dev
```

Tests (HOS engine + log builder + API; includes 300 randomized trips replayed by an independent rule checker):

```bash
cd backend && pytest -q
```

## Deploy

- **API → Render:** "New → Blueprint" on this repo uses `render.yaml` (root dir `backend`, gunicorn, health check `/api/health/`). Free tier sleeps when idle; the UI pings `/api/health/` on load and explains the wake-up delay.
- **UI → Vercel:** import the repo with root directory `frontend`, framework Vite, and set `VITE_API_URL` to the Render URL. Any `*.vercel.app` origin is allowed by CORS (override with `CORS_ALLOWED_ORIGINS` / `CORS_ALLOWED_ORIGIN_REGEXES`).

## API

`POST /api/trips/plan/`

```json
{
  "current_location": "Chicago, IL",
  "pickup_location": { "label": "St. Louis, MO", "lat": 38.627, "lng": -90.1994 },
  "dropoff_location": "Dallas, TX",
  "current_cycle_used": 12,
  "start_time": "2026-10-03T08:00"
}
```

Locations may be free text or `{label, lat, lng}`. `start_time` is wall-clock time at the home terminal; omit it to leave now (rounded up to the next 15 minutes). The response contains `summary`, `places`, `route.geometry`, `route.legs[].steps` (turn-by-turn), `events` (full duty timeline), `stops` (map markers) and `daily_logs` (grid segments, totals, remarks, recap per day).
