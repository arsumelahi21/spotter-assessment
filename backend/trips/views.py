from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from timezonefinder import TimezoneFinder

from .serializers import TripPlanRequestSerializer
from .services.geo import GeoError, Place, geocode, route
from .services.hos_engine import Leg, plan_trip
from .services.log_builder import build_response

_tf = TimezoneFinder()


def _resolve(loc: dict) -> Place:
    if "query" in loc:
        return geocode(loc["query"])
    return Place(loc["label"], loc["lat"], loc["lng"])


def _home_tz(place: Place) -> ZoneInfo:
    name = _tf.timezone_at(lat=place.lat, lng=place.lng) or "America/Chicago"
    return ZoneInfo(name)


def _start_time(requested: datetime | None, tz: ZoneInfo) -> datetime:
    """Requested wall-clock time in the home-terminal zone, or now rounded up to 15 min."""
    if requested is None:
        now = datetime.now(tz).replace(second=0, microsecond=0)
        return now + timedelta(minutes=(-now.minute) % 15)
    if requested.tzinfo is not None:
        requested = requested.astimezone(tz).replace(tzinfo=None)
    t = requested.replace(second=0, microsecond=0, tzinfo=tz)
    return t + timedelta(minutes=(-t.minute) % 15)


@api_view(["GET"])
def health(_request):
    return Response({"status": "ok"})


@api_view(["POST"])
def plan(request):
    ser = TripPlanRequestSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data

    try:
        places = {
            "current": _resolve(data["current_location"]),
            "pickup": _resolve(data["pickup_location"]),
            "dropoff": _resolve(data["dropoff_location"]),
        }
        r = route([places["current"], places["pickup"], places["dropoff"]])
    except GeoError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

    tz = _home_tz(places["current"])
    start = _start_time(data.get("start_time"), tz)
    trip = plan_trip(
        Leg(r.leg_miles[0], r.leg_minutes[0]),
        Leg(r.leg_miles[1], r.leg_minutes[1]),
        data["current_cycle_used"],
    )
    return Response(build_response(trip, r, places, start))
