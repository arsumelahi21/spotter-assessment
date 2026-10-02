"""Turn an HOS TripPlan into the API payload: map stops, timeline and daily log sheets.

Daily logs follow the paper RODS conventions: each sheet covers one calendar
day (midnight to midnight, home-terminal time), the four duty rows add up to
24 hours, and every change of duty status gets a "City, ST" remark.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

from .geo import Place, Route, nearest_city
from .hos_engine import CYCLE_LIMIT, D, OFF, ON, SB, Event, TripPlan

DAY = 24 * 60
STOP_KINDS = {"pickup", "dropoff", "fuel", "break", "rest", "restart"}


def _hours(minutes: float) -> float:
    return round(minutes / 60, 2)


class _Locator:
    def __init__(self, route: Route):
        self.route = route
        self._cache: dict[int, dict] = {}

    def at(self, mile: float) -> dict:
        key = round(mile * 10)
        if key not in self._cache:
            lat, lng = self.route.point_at(mile)
            self._cache[key] = {"lat": round(lat, 5), "lng": round(lng, 5), "location": nearest_city(lat, lng)}
        return self._cache[key]


def build_response(plan: TripPlan, route: Route, places: dict[str, Place], start: datetime) -> dict:
    loc = _Locator(route)
    wall_start = start.replace(tzinfo=None)

    def iso(minute: int) -> str:
        return (start + timedelta(minutes=minute)).isoformat()

    events = []
    for e in plan.events:
        here = loc.at(e.start_mile)
        item = {
            "status": e.status,
            "kind": e.kind,
            "note": e.note,
            "start": iso(e.start),
            "end": iso(e.end),
            "duration_hours": _hours(e.duration),
            "start_mile": round(e.start_mile, 1),
            "end_mile": round(e.end_mile, 1),
            **here,
        }
        if e.status == D:
            item["miles"] = round(e.end_mile - e.start_mile, 1)
            item["to_location"] = loc.at(e.end_mile)["location"]
        events.append(item)

    stops = [ev for ev in events if ev["kind"] in STOP_KINDS]
    # Pickup / drop-off markers should sit exactly on the user's places.
    for ev in stops:
        if ev["kind"] in ("pickup", "dropoff"):
            p = places[ev["kind"]]
            ev.update(lat=p.lat, lng=p.lng)

    by_kind = defaultdict(int)
    for ev in stops:
        by_kind[ev["kind"]] += 1

    daily_logs = _daily_logs(plan, wall_start, loc)

    return {
        "summary": {
            "total_miles": round(plan.total_miles, 1),
            "driving_hours": _hours(plan.minutes_in(D)),
            "on_duty_hours": _hours(plan.minutes_in(D) + plan.minutes_in(ON)),
            "off_duty_hours": _hours(plan.minutes_in(OFF) + plan.minutes_in(SB)),
            "trip_hours": _hours(plan.total_minutes),
            "start": iso(0),
            "end": iso(plan.total_minutes),
            "cycle_used_start": _hours(plan.initial_cycle_minutes),
            "cycle_used_end": _hours(plan.final_cycle_minutes),
            "cycle_available_end": _hours(max(0, CYCLE_LIMIT - plan.final_cycle_minutes)),
            "stop_counts": dict(by_kind),
            "days": len(daily_logs),
            "timezone": str(start.tzinfo),
        },
        "places": {k: {"label": p.label, "lat": p.lat, "lng": p.lng} for k, p in places.items()},
        "route": {
            "geometry": route.simplified(),
            "legs": [
                {"from": "current", "to": "pickup", "miles": round(route.leg_miles[0], 1),
                 "drive_hours": _hours(route.leg_minutes[0])},
                {"from": "pickup", "to": "dropoff", "miles": round(route.leg_miles[1], 1),
                 "drive_hours": _hours(route.leg_minutes[1])},
            ],
        },
        "events": events,
        "stops": stops,
        "daily_logs": daily_logs,
    }


def _daily_logs(plan: TripPlan, wall_start: datetime, loc: _Locator) -> list[dict]:
    """Slice the trip into midnight-to-midnight sheets on the home-terminal clock."""
    midnight = wall_start.replace(hour=0, minute=0, second=0, microsecond=0)
    offset = int((wall_start - midnight).total_seconds() // 60)
    trip_end = offset + plan.total_minutes
    n_days = max(1, -(-trip_end // DAY))

    # Absolute timeline (minutes since midnight of day 1) padded with off duty.
    first_mile = plan.events[0].start_mile if plan.events else 0.0
    last_mile = plan.events[-1].end_mile if plan.events else 0.0
    timeline: list[tuple[int, int, Event | None, str]] = []
    if offset > 0:
        timeline.append((0, offset, Event(OFF, -offset, 0, first_mile, first_mile, "off", "Off duty"), OFF))
    for e in plan.events:
        timeline.append((offset + e.start, offset + e.end, e, e.status))
    if trip_end < n_days * DAY:
        tail = Event(OFF, plan.total_minutes, n_days * DAY - offset, last_mile, last_mile, "off", "Off duty")
        timeline.append((trip_end, n_days * DAY, tail, OFF))

    def mile_at(t_abs: int) -> float:
        for s, en, e, _ in timeline:
            if s <= t_abs <= en:
                if e.status == D and en > s:
                    return e.start_mile + (e.end_mile - e.start_mile) * (t_abs - s) / (en - s)
                return e.start_mile if t_abs < en else e.end_mile
        return last_mile

    cycle = plan.initial_cycle_minutes
    logs = []
    for day in range(n_days):
        d0, d1 = day * DAY, (day + 1) * DAY
        segments: list[dict] = []
        totals = {OFF: 0, SB: 0, D: 0, ON: 0}
        miles = 0.0
        remarks = []
        for s, en, e, status in timeline:
            a, b = max(s, d0), min(en, d1)
            if a >= b:
                continue
            totals[status] += b - a
            if status == D:
                miles += (e.end_mile - e.start_mile) * (b - a) / (en - s)
            if status in (D, ON):
                cycle += b - a
            if e.kind == "restart" and en <= d1:
                cycle = 0
            if segments and segments[-1]["status"] == status and segments[-1]["end"] == a - d0:
                segments[-1]["end"] = b - d0
            else:
                segments.append({"status": status, "start": a - d0, "end": b - d0})
            # Every duty-status change gets a remark; the padding before the trip does not.
            if d0 <= s < d1 and (e.kind != "off" or s == trip_end):
                remarks.append({
                    "minute": s - d0,
                    "status": status,
                    "kind": e.kind,
                    "location": loc.at(e.start_mile)["location"],
                    "note": e.note if e.kind != "off" else "Off duty — trip complete",
                })

        on_duty_today = totals[D] + totals[ON]
        date = (midnight + timedelta(days=day)).date()
        logs.append({
            "date": date.isoformat(),
            "day_number": day + 1,
            "total_miles": round(miles, 1),
            "from_location": loc.at(mile_at(d0 if day else offset))["location"],
            "to_location": loc.at(mile_at(min(d1, trip_end)))["location"],
            "segments": segments,
            "totals": {k: _hours(v) for k, v in totals.items()},
            "remarks": remarks,
            "recap": {
                "on_duty_today": _hours(on_duty_today),
                "last_8_days": _hours(cycle),
                "available_tomorrow": _hours(max(0, CYCLE_LIMIT - cycle)),
            },
        })
    return logs
