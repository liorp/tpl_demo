# Offline Tiles

This directory documents the local offline tile scaffold used by the backend `/tiles` static route.

## Files

- `frontend/public/tiles/manifest.json`: tile metadata consumed by map policy and local tooling.
- `frontend/public/tiles/0/0/0.txt`: placeholder tile file proving local static serving.

## Notes

- The backend mounts `frontend/public/tiles` at `/tiles`.
- `map_policy.tile_root` is expected to be `/tiles`.
- Replace placeholder content with real tile packs when available.

## Extending Zoom Coverage

- Use `frontend/tools/seed_zoom_from_existing.py` to fetch the next zoom level from an existing parent level.
- Example (`z14 -> z15`):
  - `python3 frontend/tools/seed_zoom_from_existing.py --from-zoom 14 --to-zoom 15 --workers 16`
- The script updates `frontend/public/tiles/manifest.json` (`max_zoom`, `tile_count`, `generated_at_unix`) after completion.
