import random

import pytest

from trips.services.hos_engine import D, OFF, ON, SB, HOSSimulator, Leg, TripPlan, plan_trip


def leg(miles, mph=60):
    return Leg(miles, miles / mph * 60)


def kinds(plan):
    return [e.kind for e in plan.events]


def assert_hos_compliant(plan):
    """Independent replay of the plan against the FMCSA rules."""
    events = plan.events
    assert events, "plan is empty"
    for a, b in zip(events, events[1:]):
        assert a.end == b.start, "timeline must be contiguous"
    for e in events:
        assert e.duration > 0 and e.start % 15 == 0 and e.end % 15 == 0

    shift_start = None
    drive_shift = drive_since_break = 0
    cycle = plan.initial_cycle_minutes
    miles_since_fuel = 0.0
    for e in events:
        if e.status in (OFF, SB):
            if e.duration >= 30:
                drive_since_break = 0
            if e.duration >= 600:
                shift_start, drive_shift = None, 0
            if e.duration >= 34 * 60:
                cycle = 0
            continue
        if shift_start is None:
            shift_start = e.start
        if e.status == ON:
            cycle += e.duration
            if e.duration >= 30:
                drive_since_break = 0
            if e.kind == "fuel":
                miles_since_fuel = 0
            continue
        # Driving
        assert e.end - shift_start <= 14 * 60, f"drove past 14-hr window: {e}"
        drive_shift += e.duration
        drive_since_break += e.duration
        cycle += e.duration
        miles_since_fuel += e.end_mile - e.start_mile
        assert drive_shift <= 11 * 60, f"exceeded 11-hr driving: {e}"
        assert drive_since_break <= 8 * 60, f"drove 8+ hrs without a 30-min break: {e}"
        assert cycle <= 70 * 60, f"drove past 70-hr cycle: {e}"
        assert miles_since_fuel <= 1000 + 1e-6, f"went over 1,000 miles without fuel: {e}"


def test_short_trip_single_shift():
    plan = plan_trip(leg(60), leg(120), 0)
    assert kinds(plan) == ["pre_trip", "drive", "pickup", "drive", "dropoff", "post_trip"]
    assert plan.minutes_in(D) == 180
    assert plan.minutes_in(ON) == 30 + 60 + 60 + 30
    assert plan.total_miles == pytest.approx(180)
    assert_hos_compliant(plan)


def test_pickup_resets_the_8_hour_break_clock():
    # 5 h to pickup, 1 h loading (counts as the break), then 5 h more: no separate break.
    plan = plan_trip(leg(300), leg(300), 0)
    assert "break" not in kinds(plan)
    assert_hos_compliant(plan)


def test_30_minute_break_after_8_hours_driving():
    plan = plan_trip(leg(1), leg(600), 0)  # 10 h of continuous driving after pickup
    ks = kinds(plan)
    assert "break" in ks
    drives = [e for e in plan.events if e.status == D]
    assert drives[1].duration == 8 * 60  # second leg drives exactly 8 h, then breaks
    assert_hos_compliant(plan)


def test_11_hour_limit_triggers_10_hour_rest():
    plan = plan_trip(leg(1), leg(780), 0)  # 13 h driving
    rests = [e for e in plan.events if e.kind == "rest"]
    assert len(rests) == 1
    assert rests[0].status == SB and rests[0].duration == 600
    assert "11-hr" in rests[0].note
    driven_before_rest = sum(e.duration for e in plan.events if e.status == D and e.end <= rests[0].start)
    assert driven_before_rest == 11 * 60
    assert_hos_compliant(plan)


def test_14_hour_window_hits_before_11_hour_limit():
    # 4 h of on-duty work up front: the window closes after only 9.5 h of driving.
    sim = HOSSimulator(0)
    sim.on_duty(240, "pickup", "Waiting at shipper")
    sim.drive_leg(leg(800))
    plan = TripPlan(sim.s.events, sim.initial_cycle, sim.s.cycle, sim.s.mile)
    rest = next(e for e in plan.events if e.kind == "rest")
    assert "14-hr" in rest.note
    assert rest.start == 14 * 60
    assert sum(e.duration for e in plan.events if e.status == D and e.end <= rest.start) == 9.5 * 60
    assert_hos_compliant(plan)


def test_fuel_at_least_every_1000_miles():
    plan = plan_trip(leg(10), leg(2500), 0)
    fuels = [e for e in plan.events if e.kind == "fuel"]
    assert len(fuels) >= 2
    assert all(e.status == ON and e.duration == 30 for e in fuels)
    assert_hos_compliant(plan)


def test_cycle_limit_forces_34_hour_restart():
    plan = plan_trip(leg(100), leg(1200), 62)
    restarts = [e for e in plan.events if e.kind == "restart"]
    assert len(restarts) == 1 and restarts[0].duration == 34 * 60
    assert_hos_compliant(plan)


def test_full_cycle_restarts_before_any_work():
    plan = plan_trip(leg(100), leg(100), 70)
    assert plan.events[0].kind == "restart"
    assert plan.events[1].kind == "pre_trip"
    assert_hos_compliant(plan)


def test_current_location_equals_pickup():
    plan = plan_trip(Leg(0, 0), leg(200), 10)
    assert kinds(plan) == ["pre_trip", "pickup", "drive", "dropoff", "post_trip"]
    assert_hos_compliant(plan)


def test_coast_to_coast():
    plan = plan_trip(leg(50), leg(2800, mph=55), 20)
    assert plan.total_miles == pytest.approx(2850)
    assert sum(1 for e in plan.events if e.kind == "rest") >= 4
    assert_hos_compliant(plan)


def test_invalid_cycle_rejected():
    with pytest.raises(ValueError):
        plan_trip(leg(10), leg(10), 71)


def test_fuel_does_not_push_cycle_over_70_before_restart():
    plan = plan_trip(leg(400, mph=60), leg(2400, mph=60), 50)
    fuels = [e for e in plan.events if e.kind == "fuel"]
    restart = next(e for e in plan.events if e.kind == "restart")
    cycle = plan.initial_cycle_minutes
    for e in plan.events:
        if e is restart:
            break
        if e.status in (D, ON):
            cycle += e.duration
    assert cycle <= 70 * 60
    assert fuels


@pytest.mark.parametrize("seed", range(300))
def test_randomized_trips_are_compliant(seed):
    rng = random.Random(seed)
    plan = plan_trip(
        leg(rng.choice([0, rng.uniform(1, 900)]), mph=rng.uniform(40, 68)),
        leg(rng.uniform(5, 3000), mph=rng.uniform(40, 68)),
        round(rng.uniform(0, 70), 2),
    )
    assert_hos_compliant(plan)
