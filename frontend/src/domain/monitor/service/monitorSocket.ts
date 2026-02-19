import { useCallback, useEffect, useRef, useState } from 'react';
import { createAppWebSocketUrl } from '@/config';
import {
  acknowledgeCrossingAlert,
  addCrossingAckWindow,
  createInitialMonitorState,
  isCrossingAlertSuppressed,
  mergeCrossingAlerts,
  mergeTelemetryUnits,
  setPairing,
  toMonitorStateFromPayload,
  upsertUnit,
} from '../model/monitorState';
import {
  clearPersistedMonitorConfig,
  loadPersistedMonitorConfig,
  savePersistedMonitorConfig,
} from '../model/persistence';
import type {
  CrossingAlert,
  MonitorPayload,
  MonitorState,
  UnitPlacement,
} from '../model/types';

function isPayload(data: unknown): data is MonitorPayload {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const value = data as Record<string, unknown>;
  return (
    typeof value.connected === 'boolean' &&
    typeof value.port === 'string' &&
    typeof value.alarm === 'string' &&
    Array.isArray(value.events) &&
    Array.isArray(value.links)
  );
}

export function useMonitorSocket(): {
  state: MonitorState;
  acknowledgeCrossing: (alert: CrossingAlert) => void;
  requestMap: () => void;
  applyConfig: (value: { threshold: number; val: number }) => void;
  setAlarmSoundEnabled: (enabled: boolean) => void;
  setOfflineModeEnabled: (enabled: boolean) => void;
  resetAll: () => void;
  placeUnit: (unit: UnitPlacement) => void;
  setUnitPairing: (side1Id: number, side2Id: number, enabled: boolean) => void;
} {
  const [state, setState] = useState<MonitorState>(() => {
    const next = createInitialMonitorState();
    const persisted = loadPersistedMonitorConfig();
    return {
      ...next,
      units: persisted.units,
      pairings: persisted.pairings,
      globalSettings: persisted.globalSettings,
    };
  });
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (disposed) return;

      const socket = new WebSocket(createAppWebSocketUrl('/ws'));
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) {
          socket.close();
          return;
        }
        setState((previous) => ({ ...previous, serverOnline: true }));
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const payload: unknown = JSON.parse(event.data);
          if (isPayload(payload)) {
            setState((previous) => {
              const base = toMonitorStateFromPayload(payload);
              const incomingAlert = base.crossingAlerts[0] ?? null;
              const allowedAlert = isCrossingAlertSuppressed(
                incomingAlert,
                previous.crossingAckWindows,
              )
                ? null
                : incomingAlert;
              const hasServerUnits = Array.isArray(payload.units);
              return {
                ...base,
                crossingAlerts: mergeCrossingAlerts(
                  previous.crossingAlerts,
                  allowedAlert,
                ),
                crossingAckWindows: previous.crossingAckWindows,
                units: hasServerUnits
                  ? base.units
                  : mergeTelemetryUnits(previous.units, payload),
                pairings: previous.pairings,
                globalSettings: previous.globalSettings,
              };
            });
          }
        } catch {
          // Ignore malformed websocket payloads.
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        setState((previous) => ({
          ...createInitialMonitorState(),
          units: previous.units,
          pairings: previous.pairings,
          config: previous.config,
          globalSettings: previous.globalSettings,
        }));
        if (!disposed) {
          retryTimer = setTimeout(connect, 5_000);
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      const socket = socketRef.current;
      if (socket) {
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.onopen = () => socket.close();
        } else if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }
      socketRef.current = null;
    };
  }, []);

  const acknowledgeCrossing = useCallback((alert: CrossingAlert) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send('ack');
      setState((previous) => ({
        ...previous,
        crossingAlerts: acknowledgeCrossingAlert(
          previous.crossingAlerts,
          alert,
        ),
        crossingAckWindows: addCrossingAckWindow(
          previous.crossingAckWindows,
          alert,
        ),
      }));
    }
  }, []);

  const requestMap = useCallback(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ cmd: 'map' }));
    }
  }, []);

  const applyConfig = useCallback(
    (value: { threshold: number; val: number }) => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({ cmd: 'set_threshold', value: value.threshold }),
        );
        socket.send(JSON.stringify({ cmd: 'set_val', value: value.val }));
      }
    },
    [],
  );

  const placeUnit = useCallback((unit: UnitPlacement) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          cmd: 'set_unit_position',
          unit_id: unit.id,
          lat: unit.lat,
          lng: unit.lng,
        }),
      );
    }

    setState((previous) => {
      const next = upsertUnit(previous, unit);
      savePersistedMonitorConfig({
        units: next.units,
        pairings: next.pairings,
        globalSettings: next.globalSettings,
      });
      return next;
    });
  }, []);

  const setUnitPairing = useCallback(
    (side1Id: number, side2Id: number, enabled: boolean) => {
      setState((previous) => {
        const next = setPairing(previous, side1Id, side2Id, enabled);
        savePersistedMonitorConfig({
          units: next.units,
          pairings: next.pairings,
          globalSettings: next.globalSettings,
        });
        return next;
      });
    },
    [],
  );

  const setAlarmSoundEnabled = useCallback((enabled: boolean) => {
    setState((previous) => {
      const next = {
        ...previous,
        globalSettings: {
          ...previous.globalSettings,
          alarmSoundEnabled: enabled,
        },
      };
      savePersistedMonitorConfig({
        units: next.units,
        pairings: next.pairings,
        globalSettings: next.globalSettings,
      });
      return next;
    });
  }, []);

  const setOfflineModeEnabled = useCallback((enabled: boolean) => {
    setState((previous) => {
      const next = {
        ...previous,
        globalSettings: {
          ...previous.globalSettings,
          offlineModeEnabled: enabled,
        },
      };
      savePersistedMonitorConfig({
        units: next.units,
        pairings: next.pairings,
        globalSettings: next.globalSettings,
      });
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    clearPersistedMonitorConfig();
    setState((previous) => ({
      ...previous,
      units: [],
      pairings: [],
      globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
    }));
  }, []);

  return {
    state,
    acknowledgeCrossing,
    requestMap,
    applyConfig,
    setAlarmSoundEnabled,
    setOfflineModeEnabled,
    resetAll,
    placeUnit,
    setUnitPairing,
  };
}
