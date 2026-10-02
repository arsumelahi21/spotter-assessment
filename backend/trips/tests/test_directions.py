from trips.services.directions import build_steps, instruction


def step(kind, modifier="", name="", ref=None, destinations=None, exits=None, distance=1609.344, bearing=180):
    return {
        "name": name, "ref": ref, "destinations": destinations, "exits": exits,
        "distance": distance, "duration": 60,
        "maneuver": {"type": kind, "modifier": modifier, "location": [-90.0, 38.0], "bearing_after": bearing},
    }


def test_phrasing():
    assert instruction(step("depart", name="Main Street", bearing=0)) == "Head north on Main Street"
    assert instruction(step("turn", "left", name="Oak Ave")) == "Turn left onto Oak Ave"
    assert instruction(step("merge", "slight left", name="Stevenson Expy", ref="I 55")) == "Merge left onto I-55 (Stevenson Expy)"
    assert (
        instruction(step("fork", "slight right", destinations="I 55 South: St. Louis"))
        == "Keep right at the fork onto I-55 South toward St. Louis"
    )
    assert instruction(step("turn", "left", destinations="I 55 South")) == "Turn left onto I-55 South"
    assert (
        instruction(step("off ramp", "slight right", exits="40A", destinations="Stadium, 9th Street"))
        == "Take exit 40A on the right toward Stadium, 9th Street"
    )
    assert instruction(step("arrive"), "Dallas, TX") == "Arrive at Dallas, TX"


def test_same_highway_name_changes_are_folded():
    steps = build_steps([
        step("merge", "slight left", ref="I 44", name="A Hwy", distance=1609.344 * 10),
        step("new name", "straight", ref="I 44", name="B Hwy", distance=1609.344 * 200),
        step("arrive", distance=0),
    ], "Tulsa, OK")
    assert [s["instruction"] for s in steps] == ["Merge left onto I-44 (A Hwy)", "Arrive at Tulsa, OK"]
    assert steps[0]["distance_mi"] == 210
