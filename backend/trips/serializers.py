from datetime import datetime

from rest_framework import serializers


class LocationField(serializers.Field):
    """Accepts free text ("Dallas, TX") or a pre-geocoded {label, lat, lng} object."""

    default_error_messages = {"invalid": "Enter a location name or {label, lat, lng}."}

    def to_internal_value(self, data):
        if isinstance(data, str):
            if not data.strip():
                raise serializers.ValidationError("This field may not be blank.")
            return {"query": data.strip()}
        if isinstance(data, dict):
            try:
                lat, lng = float(data["lat"]), float(data["lng"])
            except (KeyError, TypeError, ValueError):
                self.fail("invalid")
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                self.fail("invalid")
            return {"label": str(data.get("label") or f"{lat:.4f}, {lng:.4f}"), "lat": lat, "lng": lng}
        self.fail("invalid")

    def to_representation(self, value):
        return value


class TripPlanRequestSerializer(serializers.Serializer):
    current_location = LocationField()
    pickup_location = LocationField()
    dropoff_location = LocationField()
    current_cycle_used = serializers.FloatField(min_value=0, max_value=70)
    # Wall-clock time at the home terminal ("2026-10-03T08:00"); blank means now.
    start_time = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate_start_time(self, value):
        if not value:
            return None
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            raise serializers.ValidationError("Use ISO format, e.g. 2026-10-03T08:00.")
