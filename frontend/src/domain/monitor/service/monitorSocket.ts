import { useCallback, useEffect, useRef, useState } from 'react';
import { createAppWebSocketUrl } from '@/config';
import {
  acknowledgeCrossingAlert,
  createInitialMonitorState,
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
  acknowledge: () => void;
  requestMap: () => void;
  applyConfig: (value: { threshold: number; val: number }) => void;
  resetAll: () => void;
  placeUnit: (unit: UnitPlacement) => void;
  setUnitPairing: (
    side1Id: number,
    side2Id: number,
    enabled: boolean,
  ) => void;
} {
  const [state, setState] = useState<MonitorState>(() => {
    const next = createInitialMonitorState();
    const persisted = loadPersistedMonitorConfig();
    return { ...next, units: [], pairings: persisted.pairings };
  });
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(createAppWebSocketUrl('/ws'));
    socketRef.current = socket;

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const payload: unknown = JSON.parse(event.data);
        if (isPayload(payload)) {
          setState((previous) => ({
            ...toMonitorStateFromPayload(payload),
            units: mergeTelemetryUnits(previous.units, payload),
            pairings: previous.pairings,
          }));
        }
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    socket.onclose = () => {
      setState((previous) => ({
        ...createInitialMonitorState(),
        units: previous.units,
        pairings: previous.pairings,
        config: previous.config,
      }));
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const acknowledge = useCallback(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send('ack');
      setState((previous) => acknowledgeCrossingAlert(previous));
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
    setState((previous) => {
      const next = upsertUnit(previous, unit);
      savePersistedMonitorConfig({
        units: [],
        pairings: next.pairings,
      });
      return next;
    });
  }, []);

  const setUnitPairing = useCallback(
    (side1Id: number, side2Id: number, enabled: boolean) => {
      setState((previous) => {
        const next = setPairing(previous, side1Id, side2Id, enabled);
        savePersistedMonitorConfig({
          units: [],
          pairings: next.pairings,
        });
        return next;
      });
    },
    [],
  );

  const resetAll = useCallback(() => {
    clearPersistedMonitorConfig();
    setState((previous) => ({ ...previous, units: [], pairings: [] }));
  }, []);

  return {
    state,
    acknowledge,
    requestMap,
    applyConfig,
    resetAll,
    placeUnit,
    setUnitPairing,
  };
}
