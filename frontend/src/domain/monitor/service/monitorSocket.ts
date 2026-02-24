import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAppWebSocketUrl } from '@/config';
import {
  acknowledgeCrossingAlert,
  addCrossingAckWindow,
  createInitialServerState,
  isCrossingAlertSuppressed,
  isPairEnabled,
  mergeCrossingAlerts,
  mergeTelemetryUnits,
  setPairingInList,
  toCrossingAlert,
  toPayloadUnits,
  toServerStateFromPayload,
  upsertUnitInList,
} from '../model/monitorState';
import {
  clearPersistedMonitorConfig,
  loadPersistedMonitorConfig,
  savePersistedMonitorConfig,
} from '../model/persistence';
import type {
  CrossingAckWindow,
  CrossingAlert,
  GlobalSettings,
  MonitorPayload,
  MonitorState,
  PairLink,
  ServerState,
  UnitPlacement,
} from '../model/types';

const SERVER_QUERY_KEY = ['monitor', 'server'] as const;

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
  sendThreshold: (value: number) => void;
  sendGain: (value: number) => void;
  setAlarmSoundEnabled: (enabled: boolean) => void;
  setOfflineModeEnabled: (enabled: boolean) => void;
  resetAll: () => void;
  placeUnit: (unit: UnitPlacement) => void;
  setUnitPairing: (side1Id: number, side2Id: number, enabled: boolean) => void;
} {
  const queryClient = useQueryClient();

  // Server state lives in the React Query cache, fed by the WebSocket below.
  // skipToken = "data arrives via subscription (setQueryData), not via fetch".
  const { data: serverState } = useQuery<ServerState>({
    queryKey: SERVER_QUERY_KEY,
    queryFn: skipToken,
    initialData: createInitialServerState,
  });

  // Client state (persisted to localStorage)
  const [clientState, setClientState] = useState(() => {
    const persisted = loadPersistedMonitorConfig();
    return {
      units: persisted.units as UnitPlacement[],
      pairings: persisted.pairings as PairLink[],
      globalSettings: persisted.globalSettings as GlobalSettings,
    };
  });

  // Transient state
  const [crossingAlerts, setCrossingAlerts] = useState<CrossingAlert[]>([]);
  const crossingAckWindowsRef = useRef<CrossingAckWindow[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const pairingsRef = useRef(clientState.pairings);
  pairingsRef.current = clientState.pairings;
  const pendingPositionsRef = useRef(
    new Map<number, { lat: number; lng: number }>(),
  );

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
        queryClient.setQueryData<ServerState>(SERVER_QUERY_KEY, (prev) =>
          prev
            ? { ...prev, serverOnline: true }
            : { ...createInitialServerState(), serverOnline: true },
        );
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const payload: unknown = JSON.parse(event.data);
          if (isPayload(payload)) {
            // Update server state in React Query cache
            const nextServer = toServerStateFromPayload(payload);
            queryClient.setQueryData<ServerState>(SERVER_QUERY_KEY, nextServer);

            // Handle crossing alerts (transient)
            const incomingAlert = toCrossingAlert(payload.crossing_alert);
            const pairedAlert =
              incomingAlert &&
              isPairEnabled(
                pairingsRef.current,
                incomingAlert.sensorA,
                incomingAlert.sensorB,
              )
                ? incomingAlert
                : null;
            const allowedAlert = isCrossingAlertSuppressed(
              pairedAlert,
              crossingAckWindowsRef.current,
            )
              ? null
              : pairedAlert;
            setCrossingAlerts((prev) =>
              mergeCrossingAlerts(prev, allowedAlert),
            );

            // Handle units (client state)
            const hasServerUnits = Array.isArray(payload.units);
            if (hasServerUnits) {
              setClientState((prev) => {
                const serverUnits = toPayloadUnits(
                  payload.units,
                  nextServer.sensorStatus,
                );
                const pending = pendingPositionsRef.current;
                if (pending.size === 0) {
                  return { ...prev, units: serverUnits };
                }
                const units = serverUnits.map((unit) => {
                  const pendingPos = pending.get(unit.id);
                  if (!pendingPos) return unit;
                  if (
                    Math.abs(unit.lat - pendingPos.lat) < 1e-6 &&
                    Math.abs(unit.lng - pendingPos.lng) < 1e-6
                  ) {
                    pending.delete(unit.id);
                    return unit;
                  }
                  return { ...unit, lat: pendingPos.lat, lng: pendingPos.lng };
                });
                return { ...prev, units };
              });
            } else {
              setClientState((prev) => ({
                ...prev,
                units: mergeTelemetryUnits(prev.units, payload),
              }));
            }
          }
        } catch {
          // Ignore malformed websocket payloads.
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        queryClient.setQueryData<ServerState>(
          SERVER_QUERY_KEY,
          createInitialServerState(),
        );
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
  }, [queryClient]);

  const acknowledgeCrossing = useCallback((alert: CrossingAlert) => {
    setCrossingAlerts((prev) => acknowledgeCrossingAlert(prev, alert));
    crossingAckWindowsRef.current = addCrossingAckWindow(
      crossingAckWindowsRef.current,
      alert,
    );
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send('ack');
    }
  }, []);

  const requestMap = useCallback(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ cmd: 'map' }));
    }
  }, []);

  const sendThreshold = useCallback((value: number) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ cmd: 'set_threshold', value }));
    }
  }, []);

  const sendGain = useCallback((value: number) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ cmd: 'set_gain', value }));
    }
  }, []);

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

    pendingPositionsRef.current.set(unit.id, {
      lat: unit.lat,
      lng: unit.lng,
    });

    setClientState((prev) => {
      const units = upsertUnitInList(prev.units, unit);
      const next = { ...prev, units };
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
      setClientState((prev) => {
        const pairings = setPairingInList(
          prev.units,
          prev.pairings,
          side1Id,
          side2Id,
          enabled,
        );
        const next = { ...prev, pairings };
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
    setClientState((prev) => {
      const next = {
        ...prev,
        globalSettings: { ...prev.globalSettings, alarmSoundEnabled: enabled },
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
    setClientState((prev) => {
      const next = {
        ...prev,
        globalSettings: {
          ...prev.globalSettings,
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
    setClientState({
      units: [],
      pairings: [],
      globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
    });
  }, []);

  // Compose final MonitorState from the three sources
  const safeServerState = serverState ?? createInitialServerState();
  const state: MonitorState = useMemo(
    () => ({
      ...safeServerState,
      crossingAlerts,
      units: clientState.units,
      pairings: clientState.pairings,
      globalSettings: clientState.globalSettings,
    }),
    [safeServerState, crossingAlerts, clientState],
  );

  return {
    state,
    acknowledgeCrossing,
    requestMap,
    sendThreshold,
    sendGain,
    setAlarmSoundEnabled,
    setOfflineModeEnabled,
    resetAll,
    placeUnit,
    setUnitPairing,
  };
}
