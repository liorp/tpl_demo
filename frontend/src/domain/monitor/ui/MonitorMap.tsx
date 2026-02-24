import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { divIcon } from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';

import { getUnitBounds, ISRAEL_MAP_BOUNDS } from '../model/mapViewport';
import type {
  CrossingAlert,
  PairLink,
  SignalLinkState,
  UnitPlacement,
} from '../model/types';

const DEFAULT_CENTER: [number, number] = [33.31, 35.78];
const ONLINE_TILE_NATIVE_MAX_ZOOM = 19;
const OFFLINE_DEFAULT_NATIVE_MAX_ZOOM = 14;
const PIN_SIZE_SCALE = 2;
const PIN_PADDING_Y_PX = 2 * PIN_SIZE_SCALE;
const PIN_PADDING_X_PX = 8 * PIN_SIZE_SCALE;
const PIN_FONT_SIZE_PX = 14;
const PIN_ANCHOR_Y = 12 * PIN_SIZE_SCALE;
dayjs.extend(relativeTime);

type Props = {
  units: UnitPlacement[];
  pairings?: PairLink[];
  links?: SignalLinkState[];
  crossingAlerts: CrossingAlert[];
  focusPoint: { lat: number; lng: number } | null;
  tileRoot: string | null;
  offlineRequired: boolean;
  offlineModeEnabled: boolean;
  mapBounds: [[number, number], [number, number]] | null;
  onMoveUnit: (unitId: number, lat: number, lng: number) => void;
  onSelectUnit: (unitId: number) => void;
};

type CommandPeerLink = {
  side1: number;
  side2: number;
  peerId: number;
  direction: 'IN' | 'OUT';
  threshold: number;
  rssi: number;
  dt: number;
  updatedAt: number;
};

function MapFocusController({
  focusPoint,
}: {
  focusPoint: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focusPoint) {
      return;
    }
    map.flyTo([focusPoint.lat, focusPoint.lng], Math.max(13, map.getZoom()));
  }, [focusPoint, map]);
  return null;
}

function MapUnitsViewportController({ units }: { units: UnitPlacement[] }) {
  const map = useMap();
  const lastUnitsIdentity = useRef('');

  useEffect(() => {
    const identity = units
      .map((unit) => unit.id)
      .sort((a, b) => a - b)
      .join('|');

    if (!identity || identity === lastUnitsIdentity.current) {
      return;
    }

    lastUnitsIdentity.current = identity;
    const bounds = getUnitBounds(units);
    if (!bounds) {
      return;
    }

    if (units.length === 1) {
      const [lat, lng] = bounds[0];
      map.setView([lat, lng], Math.max(map.getZoom(), 13));
      return;
    }

    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, units]);

  return null;
}

function toTileUrl(tileRoot: string | null, useOfflineTiles: boolean): string {
  if (!useOfflineTiles) {
    return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  }
  const root = (tileRoot ?? '/tiles').replace(/\/+$/, '');
  return `${root}/{z}/{x}/{y}.png`;
}
const PIN_STYLE = `display:flex;align-items:center;justify-content:center;padding:${PIN_PADDING_Y_PX}px ${PIN_PADDING_X_PX}px;border-radius:9999px;font-size:${PIN_FONT_SIZE_PX}px;font-weight:600;white-space:nowrap;color:#fff;line-height:1.4;box-shadow:0 0 0 2px rgba(15,23,42,0.35);transform:translateX(-50%);`;

function unitPinIcon(label: string) {
  const html = `<span style="${PIN_STYLE}border:2px solid #67e8f9;background:#06b6d4;">${label}</span>`;
  return divIcon({
    className: '',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, PIN_ANCHOR_Y],
  });
}

function stalePinIcon(label: string) {
  const html = `<span style="${PIN_STYLE}border:2px solid #fde047;background:#eab308;">${label}</span>`;
  return divIcon({
    className: '',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, PIN_ANCHOR_Y],
  });
}

function alertPinIcon(label: string) {
  const html = `<span style="${PIN_STYLE}border:2px solid #fca5a5;background:#ef4444;">${label}</span>`;
  return divIcon({
    className: '',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, PIN_ANCHOR_Y],
  });
}

function toLastHeartbeat(lastSeenAt: number | undefined): string {
  if (typeof lastSeenAt !== 'number') {
    return '--';
  }
  return dayjs.unix(lastSeenAt).fromNow();
}

function getSensorLinks(
  sensorId: number,
  links: SignalLinkState[],
): CommandPeerLink[] {
  const peers: CommandPeerLink[] = [];
  for (const link of links) {
    if (link.side1 === sensorId) {
      peers.push({
        side1: link.side1,
        side2: link.side2,
        peerId: link.side2,
        direction: 'OUT',
        threshold: link.threshold,
        rssi: link.rssi,
        dt: link.dt,
        updatedAt: link.updatedAt,
      });
    }
    if (link.side2 === sensorId) {
      peers.push({
        side1: link.side1,
        side2: link.side2,
        peerId: link.side1,
        direction: 'IN',
        threshold: link.threshold,
        rssi: link.rssi,
        dt: link.dt,
        updatedAt: link.updatedAt,
      });
    }
  }
  return peers.sort((a, b) => a.peerId - b.peerId);
}

export function MonitorMap({
  units,
  pairings = [],
  links = [],
  crossingAlerts,
  focusPoint,
  tileRoot,
  offlineRequired,
  offlineModeEnabled,
  mapBounds,
  onMoveUnit,
  onSelectUnit,
}: Props) {
  const [offlineTilePackMissing, setOfflineTilePackMissing] = useState(false);
  const [offlineZoomRange, setOfflineZoomRange] = useState<{
    minZoom: number;
    maxZoom: number;
  } | null>(null);
  const policyForcesOffline =
    offlineRequired &&
    typeof navigator !== 'undefined' &&
    navigator.onLine === false;
  const useOfflineTiles = offlineModeEnabled || policyForcesOffline;
  const alertingSensorIds = new Set(
    crossingAlerts
      .filter((alert) => !alert.acknowledged)
      .flatMap((alert) => [alert.sensorA, alert.sensorB]),
  );

  // Cache divIcon instances so Leaflet doesn't replace the DOM element on
  // every re-render (which would interrupt an in-progress drag).
  const iconCacheRef = useRef(new Map<string, ReturnType<typeof divIcon>>());
  const getCachedIcon = useCallback(
    (label: string, type: 'normal' | 'stale' | 'alert') => {
      const key = `${label}\0${type}`;
      let icon = iconCacheRef.current.get(key);
      if (!icon) {
        icon =
          type === 'alert'
            ? alertPinIcon(label)
            : type === 'stale'
              ? stalePinIcon(label)
              : unitPinIcon(label);
        iconCacheRef.current.set(key, icon);
      }
      return icon;
    },
    [],
  );

  const tileUrl = toTileUrl(tileRoot, useOfflineTiles);
  const unitsById = new Map(units.map((unit) => [unit.id, unit] as const));
  const pairingLines = pairings.flatMap((pair) => {
    if (!pair.enabled) {
      return [];
    }
    const side1 = unitsById.get(pair.side1Id);
    const side2 = unitsById.get(pair.side2Id);
    if (!side1 || !side2) {
      return [];
    }
    return [
      {
        key: `${pair.side1Id}-${pair.side2Id}`,
        positions: [
          [side1.lat, side1.lng] as [number, number],
          [side2.lat, side2.lng] as [number, number],
        ],
      },
    ];
  });
  const minZoom = offlineZoomRange ? offlineZoomRange.minZoom : 7;
  const maxNativeZoom = offlineZoomRange
    ? offlineZoomRange.maxZoom
    : useOfflineTiles
      ? OFFLINE_DEFAULT_NATIVE_MAX_ZOOM
      : ONLINE_TILE_NATIVE_MAX_ZOOM;
  const onlineHighZoomFallbackMinZoom = maxNativeZoom + 1;

  useEffect(() => {
    if (!useOfflineTiles) {
      setOfflineTilePackMissing(false);
      setOfflineZoomRange(null);
      return;
    }

    const controller = new AbortController();
    const manifestUrl = `${(tileRoot ?? '/tiles').replace(/\/+$/, '')}/manifest.json`;
    fetch(manifestUrl, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('missing manifest');
        }
        return response.json() as Promise<{
          format?: unknown;
          min_zoom?: unknown;
          max_zoom?: unknown;
        }>;
      })
      .then((manifest) => {
        setOfflineTilePackMissing(manifest.format === 'placeholder');
        if (
          typeof manifest.min_zoom === 'number' &&
          Number.isFinite(manifest.min_zoom) &&
          typeof manifest.max_zoom === 'number' &&
          Number.isFinite(manifest.max_zoom)
        ) {
          const nextMin = Math.max(0, Math.floor(manifest.min_zoom));
          const nextMax = Math.max(nextMin, Math.floor(manifest.max_zoom));
          setOfflineZoomRange({ minZoom: nextMin, maxZoom: nextMax });
          return;
        }
        setOfflineZoomRange(null);
      })
      .catch(() => {
        setOfflineTilePackMissing(true);
        setOfflineZoomRange(null);
      });

    return () => {
      controller.abort();
    };
  }, [tileRoot, useOfflineTiles]);

  return (
    <section className="relative min-h-0 flex-1">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={12}
        minZoom={minZoom}
        maxBounds={mapBounds ?? ISRAEL_MAP_BOUNDS}
        maxBoundsViscosity={1}
        attributionControl={false}
        className="h-full w-full"
      >
        <TileLayer
          url={tileUrl}
          maxZoom={useOfflineTiles ? maxNativeZoom : undefined}
          maxNativeZoom={maxNativeZoom}
          eventHandlers={{
            tileerror: () => {
              if (useOfflineTiles) {
                setOfflineTilePackMissing(true);
              }
            },
          }}
        />
        {useOfflineTiles ? (
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            minZoom={onlineHighZoomFallbackMinZoom}
            maxNativeZoom={ONLINE_TILE_NATIVE_MAX_ZOOM}
          />
        ) : null}
        <MapUnitsViewportController units={units} />
        <MapFocusController focusPoint={focusPoint} />
        {pairingLines.map((line) => (
          <Polyline
            key={line.key}
            positions={line.positions}
            pathOptions={{
              color: '#67e8f9',
              dashArray: '6 6',
              weight: 2,
              opacity: 0.85,
            }}
          />
        ))}
        {units.map((unit) => {
          const sensorLinks = getSensorLinks(unit.id, links);
          return (
            <Marker
              key={unit.id}
              position={[unit.lat, unit.lng]}
              draggable={true}
              icon={getCachedIcon(
                unit.label,
                alertingSensorIds.has(unit.id)
                  ? 'alert'
                  : unit.status === 'stale'
                    ? 'stale'
                    : 'normal',
              )}
              eventHandlers={{
                click: () => onSelectUnit(unit.id),
                dragend: (event) => {
                  const next = event.target.getLatLng();
                  onMoveUnit(unit.id, next.lat, next.lng);
                },
              }}
            >
              <Popup>
                <div className="w-80 max-w-[90vw] rounded-md border border-border-bright bg-card/90 p-3 font-body text-xs backdrop-blur-sm">
                  <p className="font-display text-[11px] tracking-[0.2em] text-muted-foreground">
                    STATUS
                  </p>
                  <p className="mt-1 font-display text-sm text-foreground">
                    Sensor #{unit.id}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Last heartbeat: {toLastHeartbeat(unit.lastSeenAt)}
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {sensorLinks.length === 0 ? (
                      <p className="font-body text-xs text-muted-foreground">
                        No peer links
                      </p>
                    ) : (
                      sensorLinks.map((link) => (
                        <div
                          key={`${link.direction}-${link.peerId}`}
                          className="rounded border border-border bg-card-elevated/60 px-2 py-1"
                        >
                          <p className="font-body text-xs text-foreground">
                            Link {link.side1} {'->'} {link.side2}
                          </p>
                          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                            <p className="font-body text-[11px] text-muted-foreground">
                              Direction: {link.direction}
                            </p>
                            <p className="font-body text-[11px] text-muted-foreground">
                              RSSI: {link.rssi}dBm
                            </p>
                            <p className="font-body text-[11px] text-muted-foreground">
                              Threshold: {link.threshold}
                            </p>
                            <p className="font-body text-[11px] text-muted-foreground">
                              DT: {link.dt}
                            </p>
                            <p className="font-body text-[11px] text-muted-foreground">
                              Updated at: {link.updatedAt}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      {offlineModeEnabled && offlineTilePackMissing ? (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[1300] rounded border border-red-500/50 bg-red-950/90 px-3 py-2 text-xs text-red-100">
          Offline map tiles are unavailable.
        </div>
      ) : null}
    </section>
  );
}
