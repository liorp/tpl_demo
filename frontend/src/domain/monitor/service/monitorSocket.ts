import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAppWebSocketUrl } from '@/config';
import type { Annotation } from '../model/annotations';
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
  MonitorState,
  PairLink,
  ServerState,
  UnitPlacement,
} from '../model/types';
import { isMonitorPayload } from '../model/validation';

const SERVER_QUERY_KEY = ['monitor', 'server'] as const;

type ClientState = {
  units: UnitPlacement[];
  pairings: PairLink[];
  globalSettings: GlobalSettings;
  annotations: Annotation[];
};

export function useMonitorSocket(): {
  state: MonitorState;
  acknowledgeCrossing: (alert: CrossingAlert) => void;
  requestMap: () => void;
  sendThreshold: (value: number) => boolean;
  sendDetectionThreshold: (value: number) => boolean;
  sendGain: (value: number) => boolean;
  setAlarmSoundEnabled: (enabled: boolean) => void;
  setOfflineModeEnabled: (enabled: boolean) => void;
  resetAll: () => void;
  placeUnit: (unit: UnitPlacement) => void;
  setUnitPairing: (side1Id: number, side2Id: number, enabled: boolean) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
} {
  const queryClient = useQueryClient();

  // Server state lives in the React Query cache, fed by the WebSocket below.
  // skipToken = "data arrives via subscription (setQueryData), not via fetch".
  const { data: serverState } = useQuery<ServerState>({
    queryKey: SERVER_QUERY_KEY,
    queryFn: skipToken,
    initialData: createInitialServerState,
  });

  const [clientState, setClientState] = useState<ClientState>(() => {
    const persisted = loadPersistedMonitorConfig();
    return {
      units: persisted.units as UnitPlacement[],
      pairings: persisted.pairings as PairLink[],
      globalSettings: persisted.globalSettings as GlobalSettings,
      annotations: persisted.annotations,
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
          if (!isMonitorPayload(payload)) {
            return;
          }
          const nextServer = toServerStateFromPayload(payload);
          queryClient.setQueryData<ServerState>(SERVER_QUERY_KEY, nextServer);

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
          setCrossingAlerts((prev) => mergeCrossingAlerts(prev, allowedAlert));

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
        } catch {
          // Ignore malformed websocket payloads.
        }
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) {
          return;
        }
        socketRef.current = null;
        pendingPositionsRef.current.clear();
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

  const sendCommand = useCallback(
    (cmd: string, payload: Record<string, unknown> = {}): boolean => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify({ cmd, ...payload }));
      return true;
    },
    [],
  );

  const setClientStateAndPersist = useCallback(
    (updater: (prev: ClientState) => ClientState) => {
      setClientState((prev) => {
        const next = updater(prev);
        if (next === prev) {
          return prev;
        }
        savePersistedMonitorConfig({
          units: next.units,
          pairings: next.pairings,
          globalSettings: next.globalSettings,
          annotations: next.annotations,
        });
        return next;
      });
    },
    [],
  );

  const requestMap = useCallback(() => {
    sendCommand('map');
  }, [sendCommand]);

  const sendThreshold = useCallback(
    (value: number): boolean => {
      return sendCommand('set_threshold', { value });
    },
    [sendCommand],
  );

  const sendDetectionThreshold = useCallback(
    (value: number): boolean => {
      return sendCommand('set_detection_threshold', { value });
    },
    [sendCommand],
  );

  const sendGain = useCallback(
    (value: number): boolean => {
      return sendCommand('set_gain', { value });
    },
    [sendCommand],
  );

  const placeUnit = useCallback(
    (unit: UnitPlacement) => {
      if (
        sendCommand('set_unit_position', {
          unit_id: unit.id,
          lat: unit.lat,
          lng: unit.lng,
        })
      ) {
        pendingPositionsRef.current.set(unit.id, {
          lat: unit.lat,
          lng: unit.lng,
        });
      }

      setClientStateAndPersist((prev) => {
        const units = upsertUnitInList(prev.units, unit);
        return { ...prev, units };
      });
    },
    [sendCommand, setClientStateAndPersist],
  );

  const setUnitPairing = useCallback(
    (side1Id: number, side2Id: number, enabled: boolean) => {
      setClientStateAndPersist((prev) => {
        const pairings = setPairingInList(
          prev.units,
          prev.pairings,
          side1Id,
          side2Id,
          enabled,
        );
        return { ...prev, pairings };
      });
    },
    [setClientStateAndPersist],
  );

  const setAlarmSoundEnabled = useCallback(
    (enabled: boolean) => {
      setClientStateAndPersist((prev) => ({
        ...prev,
        globalSettings: { ...prev.globalSettings, alarmSoundEnabled: enabled },
      }));
    },
    [setClientStateAndPersist],
  );

  const setOfflineModeEnabled = useCallback(
    (enabled: boolean) => {
      setClientStateAndPersist((prev) => ({
        ...prev,
        globalSettings: {
          ...prev.globalSettings,
          offlineModeEnabled: enabled,
        },
      }));
    },
    [setClientStateAndPersist],
  );

  const resetAll = useCallback(() => {
    clearPersistedMonitorConfig();
    setClientState({
      units: [],
      pairings: [],
      globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
      annotations: [],
    });
  }, []);

  const addAnnotation = useCallback(
    (annotation: Annotation) => {
      setClientStateAndPersist((prev) => ({
        ...prev,
        annotations: [...prev.annotations, annotation],
      }));
    },
    [setClientStateAndPersist],
  );

  const updateAnnotation = useCallback(
    (id: string, patch: Partial<Annotation>) => {
      setClientStateAndPersist((prev) => {
        const idx = prev.annotations.findIndex((a) => a.id === id);
        if (idx === -1) {
          return prev;
        }
        const current = prev.annotations[idx];
        const merged = { ...current, ...patch } as Annotation;
        const annotations = [...prev.annotations];
        annotations[idx] = merged;
        return { ...prev, annotations };
      });
    },
    [setClientStateAndPersist],
  );

  const removeAnnotation = useCallback(
    (id: string) => {
      setClientStateAndPersist((prev) => {
        const next = prev.annotations.filter((a) => a.id !== id);
        if (next.length === prev.annotations.length) {
          return prev;
        }
        return { ...prev, annotations: next };
      });
    },
    [setClientStateAndPersist],
  );

  const clearAnnotations = useCallback(() => {
    setClientStateAndPersist((prev) => {
      if (prev.annotations.length === 0) {
        return prev;
      }
      return { ...prev, annotations: [] };
    });
  }, [setClientStateAndPersist]);

  const safeServerState = serverState ?? createInitialServerState();
  const state: MonitorState = useMemo(
    () => ({
      ...safeServerState,
      crossingAlerts,
      units: clientState.units,
      pairings: clientState.pairings,
      globalSettings: clientState.globalSettings,
      annotations: clientState.annotations,
    }),
    [safeServerState, crossingAlerts, clientState],
  );

  return {
    state,
    acknowledgeCrossing,
    requestMap,
    sendThreshold,
    sendDetectionThreshold,
    sendGain,
    setAlarmSoundEnabled,
    setOfflineModeEnabled,
    resetAll,
    placeUnit,
    setUnitPairing,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    clearAnnotations,
  };
}
