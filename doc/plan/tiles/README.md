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
- The script downloads missing PNG assets from the internet using the source template in `manifest.json` (default: OpenStreetMap tile server).
- Example (`z14 -> z15`):
  - `python3 frontend/tools/seed_zoom_from_existing.py --from-zoom 14 --to-zoom 15 --workers 16`
- The script updates `frontend/public/tiles/manifest.json` (`max_zoom`, `tile_count`, `generated_at_unix`) after completion.

## Downloading Assets From The Internet

1. Run from repository root.
2. Ensure the current parent zoom exists locally (for example `frontend/public/tiles/14/**`).
3. Execute one step at a time:
   - `python3 frontend/tools/seed_zoom_from_existing.py --from-zoom 14 --to-zoom 15 --workers 16`
4. If you need a different tile provider URL template:
   - `python3 frontend/tools/seed_zoom_from_existing.py --from-zoom 14 --to-zoom 15 --source-template 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'`
5. Re-run the same command to resume and fetch only still-missing files.

Notes:
- `--to-zoom` must be exactly `--from-zoom + 1`.
- Increase/decrease `--workers` based on network stability.
- Failed downloads are reported; rerunning the command retries remaining files.
