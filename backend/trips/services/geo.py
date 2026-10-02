"""Geocoding, routing and nearest-city lookup, all on free / keyless services.

* Forward geocoding: Photon (komoot) with Nominatim as fallback.
* Routing: OSRM public demo server (driving profile).
* Reverse geocoding for log remarks: a bundled GeoNames extract of US places
  (population >= 2,000) so a long trip with dozens of duty-status changes
  resolves instantly instead of hitting Nominatim's 1 req/s limit.
"""
from __future__ import annotations

import bisect
import json
import math
import threading
import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import requests
from django.conf import settings
from django.core.cache import cache

METERS_PER_MILE = 1609.344
EARTH_RADIUS_MI = 3958.8
TIMEOUT = 12


class GeoError(Exception):
    """A user-facing problem with a location or route."""


@dataclass
class Place:
    label: str
    lat: float
    lng: float


def _session() -> requests.Session:
    sess = requests.Session()
    sess.headers["User-Agent"] = settings.GEO_USER_AGENT
    return sess


def haversine_mi(lat1, lng1, lat2, lng2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Forward geocoding
# ---------------------------------------------------------------------------
def geocode(query: str) -> Place:
    query = query.strip()
    key = f"geocode:{query.lower()}"
    if hit := cache.get(key):
        return Place(**hit)
    # Nominatim ranks "City, ST" style queries better; Photon is the fallback.
    place = _nominatim(query) or _photon(query)
    if place is None:
        raise GeoError(f'Could not find a location matching "{query}".')
    cache.set(key, place.__dict__, 60 * 60 * 24)
    return place


def _photon(query: str) -> Place | None:
    try:
        r = _session().get(
            "https://photon.komoot.io/api/",
            params={"q": query, "limit": 1, "lang": "en"},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        feats = r.json().get("features") or []
    except (requests.RequestException, ValueError):
        return None
    if not feats:
        return None
    props = feats[0]["properties"]
    lng, lat = feats[0]["geometry"]["coordinates"]
    parts = [props.get("name"), props.get("state"), props.get("country")]
    label = ", ".join(dict.fromkeys(p for p in parts if p))
    return Place(label or query, lat, lng)


_nominatim_lock = threading.Lock()
_nominatim_last = 0.0


def _nominatim(query: str) -> Place | None:
    global _nominatim_last
    with _nominatim_lock:  # usage policy: max 1 request per second
        wait = 1.0 - (time.monotonic() - _nominatim_last)
        if wait > 0:
            time.sleep(wait)
        _nominatim_last = time.monotonic()
    try:
        r = _session().get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 1, "countrycodes": "us,ca,mx", "addressdetails": 1},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        rows = r.json()
    except (requests.RequestException, ValueError):
        return None
    if not rows:
        return None
    row, addr = rows[0], rows[0].get("address", {})
    name = row.get("name") or row["display_name"].split(",")[0]
    label = ", ".join(dict.fromkeys(p for p in [name, addr.get("state")] if p))
    return Place(label, float(row["lat"]), float(row["lon"]))


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------
@dataclass
class Route:
    coords: list[tuple[float, float]]  # (lat, lng)
    cum_miles: list[float]  # cumulative miles along coords, scaled to OSRM distance
    leg_miles: list[float]
    leg_minutes: list[float]
    leg_steps: list[list[dict]] = field(default_factory=list)  # raw OSRM steps per leg

    @property
    def total_miles(self) -> float:
        return sum(self.leg_miles)

    def point_at(self, mile: float) -> tuple[float, float]:
        """Interpolate the (lat, lng) at a given distance along the route."""
        if mile <= 0:
            return self.coords[0]
        if mile >= self.cum_miles[-1]:
            return self.coords[-1]
        i = bisect.bisect_right(self.cum_miles, mile)
        m0, m1 = self.cum_miles[i - 1], self.cum_miles[i]
        f = 0 if m1 == m0 else (mile - m0) / (m1 - m0)
        (a_lat, a_lng), (b_lat, b_lng) = self.coords[i - 1], self.coords[i]
        return a_lat + (b_lat - a_lat) * f, a_lng + (b_lng - a_lng) * f

    def simplified(self, max_points: int = 2500) -> list[list[float]]:
        step = max(1, len(self.coords) // max_points)
        pts = self.coords[::step]
        if pts[-1] != self.coords[-1]:
            pts.append(self.coords[-1])
        return [[round(lat, 5), round(lng, 5)] for lat, lng in pts]


def route(places: list[Place]) -> Route:
    waypoints = ";".join(f"{p.lng:.6f},{p.lat:.6f}" for p in places)
    key = f"route:v2:{waypoints}"
    if hit := cache.get(key):
        return Route(**hit)
    try:
        r = _session().get(
            f"{settings.OSRM_URL}/route/v1/driving/{waypoints}",
            params={"overview": "full", "geometries": "geojson", "steps": "true"},
            timeout=25,
        )
        data = r.json()
    except (requests.RequestException, ValueError) as exc:
        raise GeoError("The routing service is unavailable right now. Please try again.") from exc
    if data.get("code") != "Ok" or not data.get("routes"):
        raise GeoError("No drivable route was found between these locations.")

    best = data["routes"][0]
    coords = [(lat, lng) for lng, lat in best["geometry"]["coordinates"]]
    leg_miles = [leg["distance"] / METERS_PER_MILE for leg in best["legs"]]
    leg_minutes = [leg["duration"] / 60 for leg in best["legs"]]

    cum = [0.0]
    for (a_lat, a_lng), (b_lat, b_lng) in zip(coords, coords[1:]):
        cum.append(cum[-1] + haversine_mi(a_lat, a_lng, b_lat, b_lng))
    total = sum(leg_miles)
    if cum[-1] > 0:
        scale = total / cum[-1]
        cum = [c * scale for c in cum]

    leg_steps = [
        [{k: st.get(k) for k in ("name", "ref", "destinations", "exits", "distance", "duration", "maneuver")}
         for st in leg.get("steps", [])]
        for leg in best["legs"]
    ]
    result = Route(coords, cum, leg_miles, leg_minutes, leg_steps)
    cache.set(key, result.__dict__, 60 * 60 * 6)
    return result


# ---------------------------------------------------------------------------
# Offline nearest US city (for log remarks)
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def _city_grid():
    rows = json.loads((Path(__file__).resolve().parent.parent / "data" / "us_cities.json").read_text())
    grid: dict[tuple[int, int], list] = {}
    for name, state, lat, lng in rows:
        grid.setdefault((math.floor(lat), math.floor(lng)), []).append((name, state, lat, lng))
    return grid


def nearest_city(lat: float, lng: float) -> str:
    grid = _city_grid()
    ci, cj = math.floor(lat), math.floor(lng)
    best, best_d = None, float("inf")
    for radius in range(0, 4):
        for i in range(ci - radius, ci + radius + 1):
            for j in range(cj - radius, cj + radius + 1):
                if max(abs(i - ci), abs(j - cj)) != radius:
                    continue
                for name, state, c_lat, c_lng in grid.get((i, j), ()):
                    d = haversine_mi(lat, lng, c_lat, c_lng)
                    if d < best_d:
                        best, best_d = (name, state), d
        # Cells already searched cover at least `radius` degrees (~45 mi of longitude
        # at the Canadian border) in every direction, so nothing closer can remain.
        if best and best_d < radius * 45:
            break
    if best is None:
        return f"{lat:.3f}, {lng:.3f}"
    return f"{best[0]}, {best[1]}"
