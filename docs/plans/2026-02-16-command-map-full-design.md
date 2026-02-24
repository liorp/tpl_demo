# Command Map Full Design (Offline + Pairing + Alerts)

## Context
This design extends the current monitor app to support a full command map workflow with offline operation.

Confirmed scope decisions:
- Source of truth: manual in UI.
- Offline map strategy: pre-bundled tiles (no runtime internet dependency).
- Alert behavior: persistent until operator acknowledge.
- Capacity: up to 32 units.

## Goals
- Enable map view offline for Israel plus 10 km border buffer.
- Allow placing all unit icons by clicking on map.
- Provide configuration menu to view/edit `threshold` and `val`.
- Keep event tracker behavior as-is.
- Add CMD map status view showing active sensors, link direction, and signal quality/intensity.
- Add sensor pairing control (configure which sensors pair with others).
- Show alert UI when crossing occurs with the 2 sensor IDs and crossing location on map.

## Non-Goals (v1)
- Global multi-operator synchronized map editing.
- Unlimited unit count.
- Online map fallback.

## Architecture
Keep the existing split:
- Backend: FastAPI websocket telemetry and command relay.
- Frontend: React + Leaflet rendering, operator interactions, local persistence.

Recommended authority model:
- Frontend authoritative for: unit placement, pairings, and config UI state.
- Backend authoritative for: live telemetry/event stream and device command execution.

This minimizes backend risk and matches the existing snapshot-driven monitor structure.

## Frontend State Model
Extend monitor domain state to include command-map data:

- `telemetry`
  - `connected`, `port`, `alarm`, `events`.
- `mapConfig`
  - `region: 'israel'`, `maxBorderKm: 10`, `tilePackVersion`.
- `units`
  - max 32 records: `{ id, label, lat, lng, status, lastSeenAt }`.
- `pairings`
  - `{ fromUnitId, toUnitId, enabled }`.
- `signalMatrix`
  - latest quality/intensity per link: `{ from, to, quality, intensity, updatedAt }`.
- `settings`
  - editable `threshold`, `val` with validation and dirty state.
- `alerts`
  - active crossing alert: `{ sensorA, sensorB, at, lat, lng, acknowledged }`.

Persistence:
- Store UI-owned slices (`units`, `pairings`, local `settings`) in `localStorage`.
- Include `schemaVersion` and migration guard.

## UI Design
Reuse current layout with expanded map interactions:
- Top: `StatusStrip` (existing alarm state + acknowledge).
- Middle: `MonitorMap` with unit markers, pairing lines, live signal overlays.
- Bottom: `EventLog` unchanged behavior.
- Footer: connection indicator unchanged.

New interaction surfaces:
- Placement mode: choose unit ID and click map to place/move.
- Unit click popover: status, last-seen, active links.
- Pairing control panel: define/edit enabled links between units.
- Config menu: view/edit/apply `threshold` and `val`.
- Alert banner: persistent until acknowledge; includes sensor IDs and map-focus action.

Mobile:
- controls collapse to sheet/tabs.
- map remains primary viewport.

## Offline Map Strategy
Tile delivery:
- Bundle Israel + 10 km border raster tile pack under static assets.
- Serve via backend static mount (e.g. `/asset/tiles/{z}/{x}/{y}.png`).
- Lock map bounds to allowed extent to avoid out-of-pack regions.

Failure handling:
- Missing tile pack shows explicit error panel.
- No silent blank-map failure.

## Data Flow
1. WebSocket payload received.
2. Parse into typed domain event (`detection`, `comm_loss`, `connected`, `signal_update`, `crossing`).
3. Reduce into store:
   - update telemetry/events/alarm.
   - update `signalMatrix` freshness per pair.
   - create/update active crossing alert.
4. UI derives marker/link/alert visuals.

Acknowledge flow:
- Operator clicks acknowledge.
- frontend sends existing `ack` command.
- alert banner and alarm state clear per backend response/state transition.

## Validation Rules
- Unit count <= 32.
- Unit IDs unique.
- Unit placement must remain within Israel+10 km bounds.
- Pairings only between existing units.
- `threshold` and `val` numeric and constrained.
- Invalid settings never become committed state.
- Stale signal timeout (e.g. 10s) downgrades link to inactive style.

## Error Handling
- WebSocket disconnect:
  - preserve local map/pairings/config.
  - mark telemetry stale/disconnected.
- Unknown sensor IDs in live events:
  - show alert/event as unresolved unit reference.
  - keep operator-visible diagnostics.
- Corrupt persisted state:
  - schema check + fallback defaults + user-facing notice.

## Testing Strategy
Frontend:
- Unit tests for reducers/selectors:
  - placement updates, pairing mutations, signal freshness decay, alert acknowledgement.
- UI tests:
  - place marker, edit pairing, receive crossing, persistent alert behavior.

Backend:
- Parser/routing tests for any new event/command message types.

Manual:
- Offline run without internet:
  - verify tile rendering, placement, pairing edits, alerts, and event log continuity.

## Delivery Plan (Phased)
1. State foundation
- Expand monitor types/store and persistence migrations.

2. Offline map integration
- Add bounded local tile layer and placement interactions.

3. Pairing + status overlays
- Add pairing editor and signal quality rendering.

4. Config menu
- Add threshold/val edit/apply with validation.

5. Crossing alert UX
- Persistent banner + map focus + event enrichment.

6. Verification
- Automated tests and offline manual pass.

## Open Implementation Notes
- If device protocol does not expose continuous signal quality, derive intensity from available payload fields until protocol expands.
- Keep pair direction explicit in model to support asymmetric transmit semantics.
