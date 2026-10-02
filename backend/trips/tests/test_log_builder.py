from datetime import datetime
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from trips.services.geo import Place, Route
from trips.services.hos_engine import Leg, plan_trip
from trips.services.log_builder import build_response

TZ = ZoneInfo("America/Chicago")


def straight_route(miles_a, miles_b, mph=60):
    # A due-east line from Kansas; ~0.0145 deg longitude per mile at this latitude.
    deg = 1 / 53.0
    n = 200
    total = miles_a + miles_b
    coords = [(38.5, -100 + deg * total * i / n) for i in range(n + 1)]
    cum = [total * i / n for i in range(n + 1)]
    return Route(coords, cum, [miles_a, miles_b], [miles_a / mph * 60, miles_b / mph * 60])


PLACES = {
    "current": Place("A", 38.5, -100),
    "pickup": Place("B", 38.5, -99),
    "dropoff": Place("C", 38.5, -90),
}


def build(miles_a, miles_b, cycle, start=datetime(2026, 10, 3, 8, 0, tzinfo=TZ)):
    r = straight_route(miles_a, miles_b)
    plan = plan_trip(Leg(r.leg_miles[0], r.leg_minutes[0]), Leg(r.leg_miles[1], r.leg_minutes[1]), cycle)
    return plan, build_response(plan, r, PLACES, start)


@pytest.mark.parametrize("miles,cycle", [(150, 0), (900, 10), (2600, 40), (1800, 69)])
def test_every_sheet_totals_24_hours(miles, cycle):
    _, resp = build(50, miles, cycle)
    for day in resp["daily_logs"]:
        assert sum(day["totals"].values()) == pytest.approx(24)
        segs = day["segments"]
        assert segs[0]["start"] == 0 and segs[-1]["end"] == 1440
        assert all(a["end"] == b["start"] for a, b in zip(segs, segs[1:]))


def test_daily_miles_add_up_to_trip_miles():
    _, resp = build(100, 1500, 0)
    assert sum(d["total_miles"] for d in resp["daily_logs"]) == pytest.approx(1600, abs=0.5)


def test_first_day_is_off_duty_until_start_and_dates_are_consecutive():
    _, resp = build(100, 1500, 0)
    first = resp["daily_logs"][0]
    assert first["segments"][0] == {"status": "OFF", "start": 0, "end": 8 * 60}
    assert first["date"] == "2026-10-03"
    assert [d["day_number"] for d in resp["daily_logs"]] == list(range(1, len(resp["daily_logs"]) + 1))


def test_recap_tracks_cycle_and_restart():
    plan, resp = build(100, 1500, 65)
    last = resp["daily_logs"][-1]["recap"]
    assert last["last_8_days"] == pytest.approx(plan.final_cycle_minutes / 60)
    assert last["available_tomorrow"] == pytest.approx(70 - plan.final_cycle_minutes / 60)


def test_remark_for_every_status_change():
    _, resp = build(100, 1500, 0)
    events = resp["events"]
    remarks = [r for d in resp["daily_logs"] for r in d["remarks"]]
    # one remark per event plus the final "off duty" remark
    assert len(remarks) == len(events) + 1
    assert all(r["location"] for r in remarks)


def test_api_plan_endpoint_with_mocked_geo():
    r = straight_route(100, 700)
    with mock.patch("trips.views.route", return_value=r):
        resp = APIClient().post(
            "/api/trips/plan/",
            {
                "current_location": {"label": "A", "lat": 38.5, "lng": -100},
                "pickup_location": {"label": "B", "lat": 38.5, "lng": -99},
                "dropoff_location": {"label": "C", "lat": 38.5, "lng": -90},
                "current_cycle_used": 20,
                "start_time": "2026-10-03T06:00",
            },
            format="json",
        )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["summary"]["start"].startswith("2026-10-03T06:00")
    assert body["summary"]["total_miles"] == pytest.approx(800)
    assert body["daily_logs"]


def test_api_validation_errors():
    resp = APIClient().post("/api/trips/plan/", {"current_cycle_used": 90}, format="json")
    assert resp.status_code == 400
    assert {"current_location", "pickup_location", "dropoff_location", "current_cycle_used"} <= set(resp.json())
