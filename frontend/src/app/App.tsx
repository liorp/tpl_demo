import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/component/ui/button';
import { TooltipProvider } from '@/component/ui/tooltip';
import type {
  CrossingAlert,
  MapBounds,
  MapPolicy,
} from '../domain/monitor/model/types';
import { playAlarmSound } from '../domain/monitor/service/alarmSound';
import { useMonitorSocket } from '../domain/monitor/service/monitorSocket';
import { CommandStatusPanel } from '../domain/monitor/ui/CommandStatusPanel';
import { ConfigMenu } from '../domain/monitor/ui/ConfigMenu';
import { ConnectionIndicator } from '../domain/monitor/ui/ConnectionIndicator';
import { CrossingAlertBanner } from '../domain/monitor/ui/CrossingAlertBanner';
import { EventLog } from '../domain/monitor/ui/EventLog';
import { MonitorMap } from '../domain/monitor/ui/MonitorMap';
import { PairingPanel } from '../domain/monitor/ui/PairingPanel';
import { StatusStrip } from '../domain/monitor/ui/StatusStrip';

const DEFAULT_MAP_BOUNDS: [[number, number], [number, number]] = [
  [29.2, 34.1],
  [33.55, 36.05],
];

function toLeafletBounds(
  bounds: MapBounds | null,
  bufferKm: number | null,
): [[number, number], [number, number]] | null {
  if (!bounds) {
    return null;
  }
  if (
    !Number.isFinite(bounds.north) ||
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.east) ||
    !Number.isFinite(bounds.west)
  ) {
    return null;
  }

  const north = Math.max(bounds.north, bounds.south);
  const south = Math.min(bounds.north, bounds.south);
  const east = Math.max(bounds.east, bounds.west);
  const west = Math.min(bounds.east, bounds.west);
  const safeBufferKm =
    typeof bufferKm === 'number' && Number.isFinite(bufferKm)
      ? Math.max(bufferKm, 0)
      : 0;

  const midLat = (north + south) / 2;
  const latBuffer = safeBufferKm / 111;
  const lngScale = Math.max(0.1, Math.abs(Math.cos((midLat * Math.PI) / 180)));
  const lngBuffer = safeBufferKm / (111 * lngScale);

  return [
    [south - latBuffer, west - lngBuffer],
    [north + latBuffer, east + lngBuffer],
  ];
}

export function App() {
  const {
    state,
    requestMap,
    acknowledgeCrossing,
    applyConfig,
    setAlarmSoundEnabled,
    resetAll,
    placeUnit,
    setUnitPairing,
  } = useMonitorSocket();
  const [placementMode, setPlacementMode] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [focusedAlertPoint, setFocusedAlertPoint] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const mapPolicy: MapPolicy = state.mapPolicy ?? {
    bounds: null,
    bufferKm: null,
    tileRoot: null,
    offlineRequired: false,
  };
  const activeUnits = useMemo(
    () => state.units.filter((unit) => unit.status !== 'inactive'),
    [state.units],
  );
  const selectableUnits = useMemo(
    () => [...activeUnits].sort((a, b) => a.id - b.id),
    [activeUnits],
  );
  const selectedUnit = useMemo(
    () =>
      selectableUnits.find((unit) => unit.id === selectedUnitId) ??
      selectableUnits[0] ??
      null,
    [selectableUnits, selectedUnitId],
  );
  const mapBounds = useMemo(
    () =>
      toLeafletBounds(mapPolicy.bounds, mapPolicy.bufferKm) ??
      DEFAULT_MAP_BOUNDS,
    [mapPolicy.bounds, mapPolicy.bufferKm],
  );
  const selectedSensorStatus = useMemo(
    () =>
      selectedUnitId === null
        ? null
        : (state.sensorStatus[String(selectedUnitId)] ?? null),
    [selectedUnitId, state.sensorStatus],
  );
  const selectedSensorLinks = useMemo(() => {
    if (selectedUnitId === null || !selectedSensorStatus) {
      return [];
    }

    const byPeer = new Map<
      number,
      {
        peerId: number;
        direction: 'IN' | 'OUT';
        quality: number | null;
        intensity: number | null;
      }
    >();

    for (const peerId of selectedSensorStatus.connectedPeers) {
      const link = state.links.find(
        (candidate) =>
          (candidate.side1 === selectedUnitId && candidate.side2 === peerId) ||
          (candidate.side1 === peerId && candidate.side2 === selectedUnitId),
      );

      byPeer.set(peerId, {
        peerId,
        direction: link
          ? link.side1 === selectedUnitId
            ? 'OUT'
            : 'IN'
          : 'OUT',
        quality: link ? link.quality : null,
        intensity: link ? link.intensity : null,
      });
    }

    for (const link of state.links) {
      if (link.side1 === selectedUnitId) {
        byPeer.set(link.side2, {
          peerId: link.side2,
          direction: 'OUT',
          quality: link.quality,
          intensity: link.intensity,
        });
      }
      if (link.side2 === selectedUnitId) {
        byPeer.set(link.side1, {
          peerId: link.side1,
          direction: 'IN',
          quality: link.quality,
          intensity: link.intensity,
        });
      }
    }

    return [...byPeer.values()].sort((a, b) => a.peerId - b.peerId);
  }, [selectedSensorStatus, selectedUnitId, state.links]);

  useEffect(() => {
    if (selectedUnit) {
      setSelectedUnitId(selectedUnit.id);
      return;
    }
    setSelectedUnitId(null);
    setPlacementMode(false);
  }, [selectedUnit]);

  useEffect(() => {
    if (!state.globalSettings.alarmSoundEnabled) {
      return;
    }
    if (state.alarm !== 'alarm') {
      return;
    }
    playAlarmSound();
  }, [state.alarm, state.globalSettings.alarmSoundEnabled]);

  const handlePlaceAt = useCallback(
    (lat: number, lng: number) => {
      if (!placementMode || !selectedUnit) {
        return;
      }
      placeUnit({
        ...selectedUnit,
        lat,
        lng,
      });
      setPlacementMode(false);
    },
    [placeUnit, placementMode, selectedUnit],
  );

  const handleFocusAlert = useCallback((alert: CrossingAlert) => {
    if (alert.lat === null || alert.lng === null) {
      return;
    }
    setFocusedAlertPoint({ lat: alert.lat, lng: alert.lng });
  }, []);

  return (
    <TooltipProvider>
      <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <StatusStrip state={state} />
        <CrossingAlertBanner
          alerts={state.crossingAlerts}
          onAcknowledge={acknowledgeCrossing}
          onFocus={handleFocusAlert}
        />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="pointer-events-none absolute bottom-4 left-4 z-[1200]">
            <div className="pointer-events-auto flex flex-col gap-2 rounded-md border border-border-bright bg-card/90 p-2 backdrop-blur-sm">
              <Button
                variant="outline"
                size="sm"
                className="border-border-bright bg-card/90 font-display text-sm font-medium tracking-wide text-muted-foreground shadow-sm hover:border-primary/50 hover:text-primary"
                type="button"
                onClick={() => requestMap()}
              >
                <svg
                  aria-hidden="true"
                  focusable="false"
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
                REFRESH MAP
              </Button>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="placement-unit"
                  className="font-display text-xs tracking-wide text-muted-foreground"
                >
                  UNIT
                </label>
                <select
                  id="placement-unit"
                  className="rounded border border-border-bright bg-card px-2 py-1 font-body text-xs text-foreground"
                  value={selectedUnit?.id ?? ''}
                  onChange={(event) =>
                    setSelectedUnitId(Number.parseInt(event.target.value, 10))
                  }
                  disabled={selectableUnits.length === 0}
                >
                  {selectableUnits.length === 0 ? (
                    <option value="">No active units</option>
                  ) : (
                    selectableUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.label}
                      </option>
                    ))
                  )}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant={placementMode ? 'default' : 'outline'}
                  onClick={() => setPlacementMode((current) => !current)}
                  disabled={!selectedUnit}
                >
                  {placementMode ? 'Placing…' : 'Place Unit'}
                </Button>
              </div>
            </div>
          </div>
          {selectedUnitId !== null && selectedSensorStatus ? (
            <div className="pointer-events-none absolute right-4 top-4 z-[1200]">
              <div className="pointer-events-auto">
                <CommandStatusPanel
                  sensorId={selectedUnitId}
                  active={selectedSensorStatus.active}
                  links={selectedSensorLinks}
                />
              </div>
            </div>
          ) : null}
          <MonitorMap
            units={activeUnits}
            pairings={state.pairings}
            links={state.links}
            focusPoint={focusedAlertPoint}
            tileRoot={mapPolicy.tileRoot}
            mapBounds={mapBounds}
            placementMode={placementMode}
            onPlaceAt={handlePlaceAt}
            onSelectUnit={setSelectedUnitId}
          />
        </div>
        <PairingPanel
          units={activeUnits}
          pairings={state.pairings}
          onTogglePairing={setUnitPairing}
        />
        <EventLog events={state.events} />
        <footer className="flex h-12 items-center justify-between border-t border-border bg-card/80 px-4 backdrop-blur-sm">
          <ConfigMenu
            config={state.config}
            alarmSoundEnabled={state.globalSettings.alarmSoundEnabled}
            onApply={applyConfig}
            onAlarmSoundEnabledChange={setAlarmSoundEnabled}
            onResetAll={resetAll}
          />
          <ConnectionIndicator state={state} />
        </footer>
      </main>
    </TooltipProvider>
  );
}
