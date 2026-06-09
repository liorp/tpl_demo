import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAppWebSocketUrl } from '@/config';
import type { Annotation } from '../model/annotations';
import {
  acknowledgeCrossingAlert,
  createInitialServerState,
  crossingPairKey,
  isPairEnabled,
  mergeCrossingAlerts,
  mergeTelemetryUnits,
  pruneAcknowledgedPairs,
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
  AntennaMode,
  CrossingAlert,
  DetectionMode,
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

type MonitorSocketApi = {
  state: MonitorState;
  acknowledgeCrossing: (alert: CrossingAlert) => void;
  requestMap: () => void;
  sendPairThreshold: (unitA: number, unitB: number, value: number) => boolean;
  sendPairGain: (unitA: number, unitB: number, value: number) => boolean;
  sendPing: (unit?: number) => boolean;
  sendSetActiveAntenna: (unit: number, antenna: AntennaMode) => boolean;
  sendRequestActiveAntenna: (unit?: number) => boolean;
  sendSetDetectionMode: (mode: DetectionMode) => boolean;
  sendRequestDetectionMode: () => boolean;
  sendReset: () => boolean;
  setAlarmSoundEnabled: (enabled: boolean) => void;
  setOfflineModeEnabled: (enabled: boolean) => void;
  resetAll: () => void;
  placeUnit: (unit: UnitPlacement) => void;
  setUnitPairing: (side1Id: number, side2Id: number, enabled: boolean) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  undoAnnotation: () => void;
  redoAnnotation: () => void;
  canUndoAnnotations: boolean;
  canRedoAnnotations: boolean;
};

export function useMonitorSocket(): MonitorSocketApi {
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
  const clientStateRef = useRef(clientState);
  clientStateRef.current = clientState;
  const annotationUndoStackRef = useRef<Annotation[][]>([]);
  const annotationRedoStackRef = useRef<Annotation[][]>([]);
  const [, setAnnotationHistoryVersion] = useState(0);

  // Transient state
  const [crossingAlerts, setCrossingAlerts] = useState<CrossingAlert[]>([]);
  // Pairs the operator has dismissed for the *current* crossing. Held until the
  // backend stops reporting that pair (auto-reset = crossing ended), after
  // which a fresh crossing of the same pair alarms again.
  const acknowledgedPairsRef = useRef<Set<string>>(new Set());

  const socketRef = useRef<WebSocket | null>(null);
  const pairingsRef = useRef(clientState.pairings);
  pairingsRef.current = clientState.pairings;
  const pendingPositionsRef = useRef(
    new Map<number, { lat: number; lng: number }>(),
  );
  // Optimistic antenna selections, reconciled against device reports on each
  // snapshot. The SG firmware acks AT#SETACTANT but does not echo #EVTACTANT,
  // so without this the toggle would never reflect the user's choice.
  const antennaOverridesRef = useRef(new Map<number, AntennaMode>());

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

          // Reconcile optimistic antenna selections with what the device
          // reports. Confirmed or contradicted -> drop the override; not
          // reported at all -> keep showing the user's pending choice.
          const antennaOverrides = antennaOverridesRef.current;
          for (const [unitId, mode] of [...antennaOverrides.entries()]) {
            const key = String(unitId);
            const entry = nextServer.sensorStatus[key];
            const reported = entry?.activeAntenna ?? null;
            if (reported === mode) {
              antennaOverrides.delete(unitId);
            } else if (reported !== null) {
              antennaOverrides.delete(unitId);
            } else if (entry) {
              nextServer.sensorStatus[key] = { ...entry, activeAntenna: mode };
            }
          }

          queryClient.setQueryData<ServerState>(SERVER_QUERY_KEY, nextServer);

          const incomingAlert = toCrossingAlert(payload.crossing_alert);
          const activePairKey = incomingAlert
            ? crossingPairKey(incomingAlert.sensorA, incomingAlert.sensorB)
            : null;
          // Drop dismissals for any pair the device no longer reports as
          // crossing, so its next crossing alarms again.
          acknowledgedPairsRef.current = pruneAcknowledgedPairs(
            acknowledgedPairsRef.current,
            activePairKey,
          );
          const pairedAlert =
            incomingAlert &&
            isPairEnabled(
              pairingsRef.current,
              incomingAlert.sensorA,
              incomingAlert.sensorB,
            )
              ? incomingAlert
              : null;
          if (
            pairedAlert &&
            activePairKey !== null &&
            !acknowledgedPairsRef.current.has(activePairKey)
          ) {
            setCrossingAlerts((prev) => mergeCrossingAlerts(prev, pairedAlert));
          }

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
        antennaOverridesRef.current.clear();
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
    // Dismissal is purely a frontend concern: hide the banner and remember the
    // pair so the ongoing crossing stays dismissed. The backend is dumb here —
    // its `crossing_alert` keeps reflecting the live device state until the
    // crossing ends, at which point we re-arm in the snapshot handler.
    setCrossingAlerts((prev) => acknowledgeCrossingAlert(prev, alert));
    const next = new Set(acknowledgedPairsRef.current);
    next.add(crossingPairKey(alert.sensorA, alert.sensorB));
    acknowledgedPairsRef.current = next;
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

  const bumpAnnotationHistoryVersion = useCallback(() => {
    setAnnotationHistoryVersion((version) => version + 1);
  }, []);

  const setAnnotationsDirect = useCallback(
    (annotations: Annotation[]) => {
      clientStateRef.current = {
        ...clientStateRef.current,
        annotations,
      };
      setClientStateAndPersist((prev) => ({
        ...prev,
        annotations,
      }));
    },
    [setClientStateAndPersist],
  );

  const setAnnotationsWithHistory = useCallback(
    (updater: (prev: Annotation[]) => Annotation[]) => {
      const previous = clientStateRef.current.annotations;
      const next = updater(previous);
      if (next === previous) {
        return;
      }
      annotationUndoStackRef.current = [
        ...annotationUndoStackRef.current,
        previous,
      ];
      annotationRedoStackRef.current = [];
      bumpAnnotationHistoryVersion();
      setAnnotationsDirect(next);
    },
    [bumpAnnotationHistoryVersion, setAnnotationsDirect],
  );

  const requestMap = useCallback(() => {
    sendCommand('map');
  }, [sendCommand]);

  const sendPairThreshold = useCallback(
    (unitA: number, unitB: number, value: number): boolean =>
      sendCommand('set_threshold', {
        unit_a: unitA,
        unit_b: unitB,
        value,
      }),
    [sendCommand],
  );

  const sendPairGain = useCallback(
    (unitA: number, unitB: number, value: number): boolean =>
      sendCommand('set_gain', {
        unit_a: unitA,
        unit_b: unitB,
        value,
      }),
    [sendCommand],
  );

  const sendPing = useCallback(
    (unit = 0): boolean => sendCommand('ping', { unit }),
    [sendCommand],
  );

  const sendSetActiveAntenna = useCallback(
    (unit: number, antenna: AntennaMode): boolean => {
      const ok = sendCommand('set_active_antenna', { unit, antenna });
      if (!ok) {
        return false;
      }
      // Reflect the choice immediately; reconciled on the next snapshot.
      antennaOverridesRef.current.set(unit, antenna);
      queryClient.setQueryData<ServerState>(SERVER_QUERY_KEY, (prev) => {
        if (!prev) {
          return prev;
        }
        const key = String(unit);
        const existing = prev.sensorStatus[key];
        const entry = existing
          ? { ...existing, activeAntenna: antenna }
          : { lastSeen: null, connectedPeers: [], activeAntenna: antenna };
        return {
          ...prev,
          sensorStatus: { ...prev.sensorStatus, [key]: entry },
        };
      });
      return true;
    },
    [sendCommand, queryClient],
  );

  const sendRequestActiveAntenna = useCallback(
    (unit = 0): boolean => sendCommand('request_active_antenna', { unit }),
    [sendCommand],
  );

  const sendSetDetectionMode = useCallback(
    (mode: DetectionMode): boolean =>
      sendCommand('set_detection_mode', { mode }),
    [sendCommand],
  );

  const sendRequestDetectionMode = useCallback(
    (): boolean => sendCommand('request_detection_mode'),
    [sendCommand],
  );

  const sendReset = useCallback(
    (): boolean => sendCommand('reset'),
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
    annotationUndoStackRef.current = [];
    annotationRedoStackRef.current = [];
    bumpAnnotationHistoryVersion();
    const next: ClientState = {
      units: [],
      pairings: [],
      globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
      annotations: [],
    };
    clientStateRef.current = next;
    setClientState(next);
  }, [bumpAnnotationHistoryVersion]);

  const addAnnotation = useCallback(
    (annotation: Annotation) => {
      setAnnotationsWithHistory((prev) => [...prev, annotation]);
    },
    [setAnnotationsWithHistory],
  );

  const updateAnnotation = useCallback(
    (id: string, patch: Partial<Annotation>) => {
      setAnnotationsWithHistory((prev) => {
        const idx = prev.findIndex((a) => a.id === id);
        if (idx === -1) {
          return prev;
        }
        const current = prev[idx];
        const merged = { ...current, ...patch } as Annotation;
        const annotations = [...prev];
        annotations[idx] = merged;
        return annotations;
      });
    },
    [setAnnotationsWithHistory],
  );

  const removeAnnotation = useCallback(
    (id: string) => {
      setAnnotationsWithHistory((prev) => {
        const next = prev.filter((a) => a.id !== id);
        if (next.length === prev.length) {
          return prev;
        }
        return next;
      });
    },
    [setAnnotationsWithHistory],
  );

  const clearAnnotations = useCallback(() => {
    setAnnotationsWithHistory((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      return [];
    });
  }, [setAnnotationsWithHistory]);

  const undoAnnotation = useCallback(() => {
    const previous = annotationUndoStackRef.current.at(-1);
    if (!previous) {
      return;
    }
    const current = clientStateRef.current.annotations;
    annotationUndoStackRef.current = annotationUndoStackRef.current.slice(
      0,
      -1,
    );
    annotationRedoStackRef.current = [
      ...annotationRedoStackRef.current,
      current,
    ];
    bumpAnnotationHistoryVersion();
    setAnnotationsDirect(previous);
  }, [bumpAnnotationHistoryVersion, setAnnotationsDirect]);

  const redoAnnotation = useCallback(() => {
    const next = annotationRedoStackRef.current.at(-1);
    if (!next) {
      return;
    }
    const current = clientStateRef.current.annotations;
    annotationRedoStackRef.current = annotationRedoStackRef.current.slice(
      0,
      -1,
    );
    annotationUndoStackRef.current = [
      ...annotationUndoStackRef.current,
      current,
    ];
    bumpAnnotationHistoryVersion();
    setAnnotationsDirect(next);
  }, [bumpAnnotationHistoryVersion, setAnnotationsDirect]);

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
  const canUndoAnnotations = annotationUndoStackRef.current.length > 0;
  const canRedoAnnotations = annotationRedoStackRef.current.length > 0;

  return {
    state,
    acknowledgeCrossing,
    requestMap,
    sendPairThreshold,
    sendPairGain,
    sendPing,
    sendSetActiveAntenna,
    sendRequestActiveAntenna,
    sendSetDetectionMode,
    sendRequestDetectionMode,
    sendReset,
    setAlarmSoundEnabled,
    setOfflineModeEnabled,
    resetAll,
    placeUnit,
    setUnitPairing,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    clearAnnotations,
    undoAnnotation,
    redoAnnotation,
    canUndoAnnotations,
    canRedoAnnotations,
  };
}
