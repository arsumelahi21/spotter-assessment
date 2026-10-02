"""Turn OSRM route steps into readable turn-by-turn instructions.

OSRM returns one step per maneuver with a type ("turn", "merge", "off ramp",
...), an optional modifier ("left", "slight right", ...), the road name/ref and
sign destinations. This module phrases them the way a GPS would and collapses
noise such as a highway changing its name while the route stays on it.
"""
from __future__ import annotations

import re

METERS_PER_MILE = 1609.344

COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]


def _compass(bearing: float) -> str:
    return COMPASS[int((bearing % 360) / 45 + 0.5) % 8]


_SHIELD = re.compile(r"\b(I|US|SR|CR|[A-Z]{2}) (\d+[A-Z]?)\b")


def _ref(ref: str | None) -> str:
    """'I 55; US 40' -> 'I-55 / US-40'."""
    if not ref:
        return ""
    return " / ".join(_SHIELD.sub(r"\1-\2", p.strip()) for p in ref.split(";") if p.strip())


def _road(step: dict) -> str:
    ref, name = _ref(step.get("ref")), (step.get("name") or "").strip()
    if ref and name and name.lower() not in ref.lower():
        return f"{ref} ({name})"
    return ref or name


def _signs(step: dict) -> tuple[str, str]:
    """Sign text 'I 55 South, IL 3: St. Louis, Cahokia' -> ('I-55 South / IL-3', 'St. Louis, Cahokia')."""
    dest = (step.get("destinations") or "").strip()
    if not dest:
        return "", ""
    if ":" in dest:
        road_part, _, place_part = dest.partition(":")
        roads = [r.strip() for r in road_part.split(",") if r.strip()]
        places = [p.strip() for p in place_part.split(",") if p.strip()]
    else:  # no separator: route shields are roads, the rest are places
        parts = [p.strip() for p in dest.split(",") if p.strip()]
        roads = [p for p in parts if _SHIELD.match(p)]
        places = [p for p in parts if not _SHIELD.match(p)]
    return " / ".join(_SHIELD.sub(r"\1-\2", r) for r in roads), ", ".join(places)


def _target(step: dict, prefer_road: bool = True) -> str:
    """' onto I-55 South toward St. Louis' built from signs, falling back to the road name."""
    sign_road, place = _signs(step)
    road = sign_road or (_road(step) if prefer_road else "")
    out = f" onto {road}" if road else ""
    return out + (f" toward {place}" if place else "")


def _side(modifier: str) -> str:
    return "left" if "left" in modifier else "right" if "right" in modifier else ""


def instruction(step: dict, arrive_label: str = "") -> str:
    m = step["maneuver"]
    kind, mod = m["type"], (m.get("modifier") or "").strip()
    road = _road(step)
    onto = f" onto {road}" if road else ""

    if kind == "depart":
        return f"Head {_compass(m.get('bearing_after', 0))}{(' on ' + road) if road else ''}"
    if kind == "arrive":
        return f"Arrive at {arrive_label}" if arrive_label else "Arrive at your destination"
    if kind == "off ramp":
        exit_no = step["exits"].split(";")[0] if step.get("exits") else ""
        side = f" on the {_side(mod)}" if _side(mod) else ""
        return f"Take {'exit ' + exit_no if exit_no else 'the exit'}{side}{_target(step, prefer_road=False) or onto}"
    if kind == "on ramp":
        side = f" on the {_side(mod)}" if _side(mod) else ""
        return f"Take the ramp{side}{_target(step)}"
    if kind == "fork":
        return f"Keep {_side(mod) or 'straight'} at the fork{_target(step)}"
    if kind == "merge":
        side = f" {_side(mod)}" if _side(mod) else ""
        return f"Merge{side}{onto or _target(step)}"
    if kind in ("roundabout", "rotary", "roundabout turn"):
        exit_n = m.get("exit")
        return f"At the roundabout, take the {_ordinal(exit_n)} exit{onto}" if exit_n else f"Go through the roundabout{onto}"
    if kind == "end of road":
        return f"At the end of the road, turn {mod or 'right'}{onto}"
    if kind in ("new name", "continue", "notification", "use lane"):
        if mod in ("", "straight"):
            return f"Continue{onto}" if road else "Continue straight"
        if "uturn" in mod:
            return f"Make a U-turn{onto}"
        return f"Keep {_side(mod)}{onto}" if "slight" in mod else f"Turn {mod}{onto}"
    # "turn" and anything unknown
    if "uturn" in mod:
        return f"Make a U-turn{onto}"
    if mod in ("", "straight"):
        return f"Continue straight{onto}"
    if not road and step.get("destinations"):
        return f"Turn {mod}{_target(step)}"
    return f"Turn {mod}{onto}"


def _ordinal(n: int) -> str:
    return {1: "1st", 2: "2nd", 3: "3rd"}.get(n, f"{n}th")


def build_steps(osrm_steps: list[dict], arrive_label: str = "") -> list[dict]:
    """Readable steps for one leg. Each step's distance is the distance driven *after* the maneuver."""
    out: list[dict] = []
    for step in osrm_steps:
        m = step["maneuver"]
        kind = m["type"]
        miles = step.get("distance", 0) / METERS_PER_MILE
        minutes = step.get("duration", 0) / 60
        prev = out[-1] if out else None
        same_road = prev and _ref(step.get("ref")) and _ref(step.get("ref")) == prev["road_ref"]
        # Stay-on-the-same-highway noise: fold into the previous instruction.
        if prev and kind in ("new name", "continue", "notification", "use lane") and (
            same_road or (m.get("modifier") in (None, "straight") and not _road(step))
        ):
            prev["distance_mi"] += miles
            prev["duration_min"] += minutes
            continue
        lng, lat = m["location"]
        out.append({
            "instruction": instruction(step, arrive_label),
            "type": kind,
            "modifier": m.get("modifier") or "",
            "distance_mi": miles,
            "duration_min": minutes,
            "lat": round(lat, 5),
            "lng": round(lng, 5),
            "road_ref": _ref(step.get("ref")),
        })
    for s in out:
        s["distance_mi"] = round(s["distance_mi"], 1)
        s["duration_min"] = round(s["duration_min"], 1)
    return out
