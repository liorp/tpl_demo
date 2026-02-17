# Offline Tiles

This directory documents the local offline tile scaffold used by the backend `/tiles` static route.

## Files

- `frontend/public/tiles/manifest.json`: tile metadata consumed by map policy and local tooling.
- `frontend/public/tiles/0/0/0.txt`: placeholder tile file proving local static serving.

## Notes

- The backend mounts `frontend/public/tiles` at `/tiles`.
- `map_policy.tile_root` is expected to be `/tiles`.
- Replace placeholder content with real tile packs when available.
