"""
Hours-of-Service trip simulator (FMCSA 49 CFR 395, property-carrying driver, 70 hr / 8 day).

The engine is pure: it knows nothing about maps or HTTP. It takes the two
driving legs of a trip (current -> pickup, pickup -> dropoff) and walks the
clock forward, inserting the stops the rules require:

  * 11-hour driving limit per shift            -> 10 hr sleeper-berth rest
  * 14-hour on-duty window per shift           -> 10 hr sleeper-berth rest
  * 30-minute break after 8 cumulative driving hours
    (any >= 30 consecutive non-driving minutes satisfies it: fuel, pickup, ...)
  * 70 hours on duty in 8 days                 -> 34 hr restart
  * fuel at least every 1,000 miles            -> 30 min on-duty fuel stop
  * 1 hr on duty for pickup and for drop-off
  * 30 min pre-trip and post-trip inspections

All time is integer minutes from trip start, quantised to 15 minutes so the
result draws cleanly on the paper-log grid (which has 15-minute ticks).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

OFF, SB, D, ON = "OFF", "SB", "D", "ON"

QUANTUM = 15
MAX_DRIVING_PER_SHIFT = 11 * 60
MAX_WINDOW = 14 * 60
MAX_DRIVING_BEFORE_BREAK = 8 * 60
CYCLE_LIMIT = 70 * 60
DAILY_REST = 10 * 60
BREAK = 30
RESTART = 34 * 60
FUEL_INTERVAL_MILES = 1000
FUEL_STOP = 30
PICKUP = 60
DROPOFF = 60
INSPECTION = 30
# When a 30-min break is due and a fuel stop is due within this much driving,
# fuel now instead: the fuel stop satisfies the break as well.
FUEL_EARLY_WINDOW = 3 * 60


def ceil_q(minutes: float) -> int:
    return int(math.ceil(minutes / QUANTUM - 1e-9)) * QUANTUM


def floor_q(minutes: float) -> int:
    return int(math.floor(minutes / QUANTUM + 1e-9)) * QUANTUM


def round_q(minutes: float) -> int:
    return int(round(minutes / QUANTUM)) * QUANTUM


@dataclass
class Leg:
    miles: float
    minutes: float  # raw driving time from the routing engine

    @property
    def drive_minutes(self) -> int:
        if self.miles < 0.5:
            return 0
        return max(QUANTUM, round_q(self.minutes))


@dataclass
class Event:
    status: str
    start: int
    end: int
    start_mile: float
    end_mile: float
    kind: str
    note: str

    @property
    def duration(self) -> int:
        return self.end - self.start


@dataclass
class TripPlan:
    events: list[Event]
    initial_cycle_minutes: int
    final_cycle_minutes: int
    total_miles: float

    @property
    def total_minutes(self) -> int:
        return self.events[-1].end if self.events else 0

    def minutes_in(self, status: str) -> int:
        return sum(e.duration for e in self.events if e.status == status)


@dataclass
class _State:
    t: int = 0
    mile: float = 0.0
    shift_start: int | None = None
    drive_shift: int = 0
    drive_since_break: int = 0
    cycle: int = 0
    miles_since_fuel: float = 0.0
    events: list[Event] = field(default_factory=list)


class HOSSimulator:
    def __init__(self, cycle_used_hours: float):
        if not 0 <= cycle_used_hours <= 70:
            raise ValueError("Current cycle used must be between 0 and 70 hours")
        self.s = _State(cycle=min(CYCLE_LIMIT, ceil_q(cycle_used_hours * 60)))
        self.initial_cycle = self.s.cycle

    # ---- primitive recorders -------------------------------------------------
    def _record(self, status, minutes, kind, note, miles=0.0):
        s = self.s
        s.events.append(Event(status, s.t, s.t + minutes, s.mile, s.mile + miles, kind, note))
        s.t += minutes
        s.mile += miles

    def on_duty(self, minutes: int, kind: str, note: str):
        s = self.s
        if s.shift_start is None:
            s.shift_start = s.t
        self._record(ON, minutes, kind, note)
        s.cycle += minutes
        if minutes >= BREAK:
            s.drive_since_break = 0

    def off_duty(self, minutes: int, kind: str, note: str, status: str = OFF):
        s = self.s
        self._record(status, minutes, kind, note)
        if minutes >= BREAK:
            s.drive_since_break = 0
        if minutes >= DAILY_REST:
            s.shift_start = None
            s.drive_shift = 0
        if minutes >= RESTART:
            s.cycle = 0

    def _drive(self, minutes: int, miles: float):
        s = self.s
        if s.shift_start is None:
            s.shift_start = s.t
        self._record(D, minutes, "drive", "Driving", miles)
        s.drive_shift += minutes
        s.drive_since_break += minutes
        s.cycle += minutes
        s.miles_since_fuel += miles

    # ---- rule-required stops -------------------------------------------------
    def restart(self):
        self.off_duty(RESTART, "restart", "34-hr restart (70-hr/8-day limit reached)")

    def rest(self, reason: str):
        self.off_duty(DAILY_REST, "rest", f"10-hr sleeper berth rest ({reason})", status=SB)

    def fuel(self):
        self.on_duty(FUEL_STOP, "fuel", "Fuel stop")
        self.s.miles_since_fuel = 0.0

    def take_break(self):
        self.off_duty(BREAK, "break", "30-min break (8 hrs cumulative driving)")

    def ensure_cycle_available(self):
        if self.s.cycle >= CYCLE_LIMIT:
            self.restart()

    # ---- driving a leg -------------------------------------------------------
    def drive_leg(self, leg: Leg):
        remaining = leg.drive_minutes
        if remaining == 0:
            return
        remaining_miles = leg.miles
        mpm = leg.miles / remaining  # miles per (quantised) minute
        s = self.s

        while remaining > 0:
            window_used = 0 if s.shift_start is None else s.t - s.shift_start
            left_11 = MAX_DRIVING_PER_SHIFT - s.drive_shift
            left_14 = MAX_WINDOW - window_used
            left_8 = MAX_DRIVING_BEFORE_BREAK - s.drive_since_break
            left_70 = floor_q(CYCLE_LIMIT - s.cycle)
            to_fuel = floor_q((FUEL_INTERVAL_MILES - s.miles_since_fuel) / mpm)

            fuel_due = to_fuel <= 0
            # A fuel stop that would leave no drive time is pointless: rest/restart first.
            if left_70 <= 0 or (fuel_due and left_70 <= FUEL_STOP):
                self.restart()
                continue
            if left_11 <= 0 or left_14 <= 0 or (fuel_due and left_14 <= FUEL_STOP):
                self.rest("11-hr driving limit" if left_11 <= 0 else "14-hr window limit")
                continue
            if fuel_due or (left_8 <= 0 and to_fuel <= FUEL_EARLY_WINDOW and to_fuel < remaining):
                self.fuel()
                continue
            if left_8 <= 0:
                self.take_break()
                continue

            chunk = min(remaining, left_11, left_14, left_8, left_70, to_fuel)
            miles = remaining_miles if chunk == remaining else chunk * mpm
            self._drive(chunk, miles)
            remaining -= chunk
            remaining_miles -= miles

    # ---- whole trip ----------------------------------------------------------
    def plan(self, to_pickup: Leg, to_dropoff: Leg) -> TripPlan:
        self.ensure_cycle_available()
        self.on_duty(INSPECTION, "pre_trip", "Pre-trip inspection")
        self.drive_leg(to_pickup)
        self.on_duty(PICKUP, "pickup", "Pickup (loading)")
        self.drive_leg(to_dropoff)
        self.on_duty(DROPOFF, "dropoff", "Drop-off (unloading)")
        self.on_duty(INSPECTION, "post_trip", "Post-trip inspection")
        return TripPlan(
            events=_merge_drives(self.s.events),
            initial_cycle_minutes=self.initial_cycle,
            final_cycle_minutes=self.s.cycle,
            total_miles=self.s.mile,
        )


def _merge_drives(events: list[Event]) -> list[Event]:
    """Join back-to-back driving chunks (e.g. a leg ending exactly at a limit check)."""
    out: list[Event] = []
    for e in events:
        if out and e.status == D and out[-1].status == D and out[-1].end == e.start:
            prev = out[-1]
            out[-1] = Event(D, prev.start, e.end, prev.start_mile, e.end_mile, "drive", "Driving")
        else:
            out.append(e)
    return out


def plan_trip(to_pickup: Leg, to_dropoff: Leg, cycle_used_hours: float) -> TripPlan:
    return HOSSimulator(cycle_used_hours).plan(to_pickup, to_dropoff)
