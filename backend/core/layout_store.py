import json
import logging
import math
import os
import tempfile
from pathlib import Path
from typing import Any, TypedDict

ISRAEL_BOUNDS = {
    "north": 33.35,
    "south": 29.55,
    "east": 35.85,
    "west": 34.3,
}
MAP_BUFFER_KM = 10.0
logger = logging.getLogger(__name__)


def _buffer_lat_degrees(buffer_km: float) -> float:
    return buffer_km / 111.0


def _buffer_lng_degrees(buffer_km: float, reference_lat: float) -> float:
    lat_cos = max(math.cos(math.radians(reference_lat)), 0.1)
    return buffer_km / (111.0 * lat_cos)


def _with_buffer(bounds: dict[str, float], buffer_km: float) -> dict[str, float]:
    reference_lat = (bounds["north"] + bounds["south"]) / 2
    lat_delta = _buffer_lat_degrees(buffer_km)
    lng_delta = _buffer_lng_degrees(buffer_km, reference_lat)
    return {
        "north": round(bounds["north"] + lat_delta, 2),
        "south": round(bounds["south"] - lat_delta, 2),
        "east": round(bounds["east"] + lng_delta, 2),
        "west": round(bounds["west"] - lng_delta, 2),
    }


ALLOWED_BOUNDS = _with_buffer(ISRAEL_BOUNDS, MAP_BUFFER_KM)


class LayoutState(TypedDict):
    units: list[dict[str, Any]]
    map_policy: dict[str, Any]


def _default_layout_state() -> LayoutState:
    return {
        "units": [],
        "map_policy": {
            "bounds": dict(ALLOWED_BOUNDS),
            "buffer_km": MAP_BUFFER_KM,
            "tile_root": "/tiles",
            "offline_required": True,
        },
    }


def _is_valid_coordinate(lat: float, lng: float) -> bool:
    return (
        ALLOWED_BOUNDS["south"] <= lat <= ALLOWED_BOUNDS["north"]
        and ALLOWED_BOUNDS["west"] <= lng <= ALLOWED_BOUNDS["east"]
    )


def _normalize_units(units: Any) -> list[dict[str, Any]]:
    if not isinstance(units, list):
        return []

    normalized: list[dict[str, Any]] = []
    for unit in units:
        if not isinstance(unit, dict):
            continue
        lat = unit.get("lat")
        lng = unit.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            continue
        if not _is_valid_coordinate(float(lat), float(lng)):
            raise ValueError("Unit coordinate is outside allowed map bounds")
        normalized.append(
            {
                "id": unit.get("id"),
                "label": unit.get("label"),
                "lat": float(lat),
                "lng": float(lng),
            }
        )
    return normalized


def load_layout_state(path: str | Path) -> LayoutState:
    file_path = Path(path)
    defaults = _default_layout_state()
    if not file_path.exists():
        return defaults

    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        logger.warning("Failed to load layout state from %s. Using defaults.", file_path)
        return defaults

    if not isinstance(payload, dict):
        return defaults

    try:
        units = _normalize_units(payload.get("units", []))
    except ValueError:
        logger.warning("Layout state %s contains invalid coordinates. Using defaults.", file_path)
        return defaults

    raw_policy = payload.get("map_policy")
    map_policy = dict(defaults["map_policy"])
    if isinstance(raw_policy, dict):
        map_policy.update(raw_policy)
        map_policy["bounds"] = dict(ALLOWED_BOUNDS)
        map_policy["buffer_km"] = MAP_BUFFER_KM

    return {"units": units, "map_policy": map_policy}


def save_layout_state(path: str | Path, state: dict[str, Any]) -> LayoutState:
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)

    normalized: LayoutState = {
        "units": _normalize_units(state.get("units", [])),
        "map_policy": dict(_default_layout_state()["map_policy"]),
    }
    raw_policy = state.get("map_policy")
    if isinstance(raw_policy, dict):
        normalized["map_policy"].update(raw_policy)
        normalized["map_policy"]["bounds"] = dict(ALLOWED_BOUNDS)
        normalized["map_policy"]["buffer_km"] = MAP_BUFFER_KM

    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=str(file_path.parent),
            prefix=f"{file_path.name}.",
            suffix=".tmp",
            delete=False,
        ) as tmp:
            temp_name = tmp.name
            json.dump(normalized, tmp, ensure_ascii=True)
        os.replace(temp_name, file_path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)

    return normalized
