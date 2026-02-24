import { useCallback, useEffect, useMemo, useState } from 'react';

import { ErrorBoundary } from '@/component/ErrorBoundary';
import { Button } from '@/component/ui/button';
import { SENSOR_STALE_AFTER_SECONDS } from '@/config';
import {
  ISRAEL_MAP_BOUNDS,
  toLeafletBounds,
  toUnixSeconds,
} from '../domain/monitor/model/mapViewport';
import type { CrossingAlert, MapPolicy } from '../domain/monitor/model/types';
import {
  startAlarmSound,
  stopAlarmSound,
} from '../domain/monitor/service/alarmSound';
import { useMonitorSocket } from '../domain/monitor/service/monitorSocket';
import { ConfigMenu } from '../domain/monitor/ui/ConfigMenu';
import { ConnectionIndicator } from '../domain/monitor/ui/ConnectionIndicator';
import { CrossingAlertBanner } from '../domain/monitor/ui/CrossingAlertBanner';
import { EventLog } from '../domain/monitor/ui/EventLog';
import { MonitorMap } from '../domain/monitor/ui/MonitorMap';
import { PairingPanel } from '../domain/monitor/ui/PairingPanel';
import { StatusStrip } from '../domain/monitor/ui/StatusStrip';

export function App() {
  const {
    state,
    requestMap,
    acknowledgeCrossing,
    sendThreshold,
    sendDetectionThreshold,
    sendGain,
    setAlarmSoundEnabled,
    setOfflineModeEnabled,
    resetAll,
    placeUnit,
    setUnitPairing,
  } = useMonitorSocket();
  const [focusedAlertPoint, setFocusedAlertPoint] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() =>
    Math.floor(Date.now() / 1000),
  );
  const mapPolicy: MapPolicy = state.mapPolicy ?? {
    bounds: null,
    bufferKm: null,
    tileRoot: '/tiles',
    offlineRequired: true,
  };
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 5_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const visibleUnits = useMemo(
    () =>
      state.units
        .filter((unit) => {
          if (typeof unit.lastSeenAt !== 'number') {
            return false;
          }
          return true;
        })
        .map((unit) => {
          const lastSeen = unit.lastSeenAt as number;
          const elapsedSeconds = nowSeconds - toUnixSeconds(lastSeen);
          if (elapsedSeconds > SENSOR_STALE_AFTER_SECONDS) {
            return {
              ...unit,
              status: 'stale' as const,
            };
          }
          return unit;
        }),
    [nowSeconds, state.units],
  );
  const mapBounds = useMemo(
    () =>
      toLeafletBounds(mapPolicy.bounds, mapPolicy.bufferKm) ??
      ISRAEL_MAP_BOUNDS,
    [mapPolicy.bounds, mapPolicy.bufferKm],
  );

  useEffect(() => {
    if (
      state.globalSettings.alarmSoundEnabled &&
      state.crossingAlerts.length > 0
    ) {
      startAlarmSound();
      return () => stopAlarmSound();
    }
    stopAlarmSound();
  }, [state.crossingAlerts.length, state.globalSettings.alarmSoundEnabled]);

  const handleMoveUnit = useCallback(
    (unitId: number, lat: number, lng: number) => {
      const unit = visibleUnits.find((candidate) => candidate.id === unitId);
      if (!unit) {
        return;
      }
      placeUnit({
        ...unit,
        lat,
        lng,
      });
    },
    [visibleUnits, placeUnit],
  );

  const handleFocusAlert = useCallback((alert: CrossingAlert) => {
    if (alert.lat === null || alert.lng === null) {
      return;
    }
    setFocusedAlertPoint({ lat: alert.lat, lng: alert.lng });
  }, []);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <StatusStrip alarm={state.alarm} serverOnline={state.serverOnline} />
      <ErrorBoundary section="Alerts">
        <CrossingAlertBanner
          alerts={state.crossingAlerts}
          onAcknowledge={acknowledgeCrossing}
          onFocus={handleFocusAlert}
        />
      </ErrorBoundary>
      <ErrorBoundary section="Map">
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
            </div>
          </div>
          <MonitorMap
            units={visibleUnits}
            pairings={state.pairings}
            links={state.links}
            crossingAlerts={state.crossingAlerts}
            events={state.events}
            config={state.config}
            focusPoint={focusedAlertPoint}
            tileRoot={mapPolicy.tileRoot}
            offlineRequired={mapPolicy.offlineRequired}
            offlineModeEnabled={state.globalSettings.offlineModeEnabled}
            mapBounds={mapBounds}
            onMoveUnit={handleMoveUnit}
            onSelectUnit={() => {}}
          />
        </div>
      </ErrorBoundary>
      <ErrorBoundary section="Pairing">
        <PairingPanel
          units={visibleUnits}
          pairings={state.pairings}
          onTogglePairing={setUnitPairing}
        />
      </ErrorBoundary>
      <ErrorBoundary section="Event Log">
        <EventLog events={state.events} />
      </ErrorBoundary>
      <ErrorBoundary section="Controls">
        <footer className="flex h-12 items-center justify-between border-t border-border bg-card/80 px-4 backdrop-blur-sm">
          <ConfigMenu
            config={state.config}
            alarmSoundEnabled={state.globalSettings.alarmSoundEnabled}
            offlineModeEnabled={state.globalSettings.offlineModeEnabled}
            onSendThreshold={sendThreshold}
            onSendDetectionThreshold={sendDetectionThreshold}
            onSendGain={sendGain}
            onAlarmSoundEnabledChange={setAlarmSoundEnabled}
            onOfflineModeEnabledChange={setOfflineModeEnabled}
            onResetAll={resetAll}
          />
          <ConnectionIndicator
            connected={state.connected}
            serverOnline={state.serverOnline}
            port={state.port}
          />
        </footer>
      </ErrorBoundary>
    </main>
  );
}
