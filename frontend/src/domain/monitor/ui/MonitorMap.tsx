import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { divIcon } from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  MonitorConfig,
  MonitorEvent,
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
const BETWEEN_THRESHOLD_WINDOW_MS = 10_000;
dayjs.extend(relativeTime);

type Props = {
  units: UnitPlacement[];
  pairings?: PairLink[];
  links?: SignalLinkState[];
  crossingAlerts: CrossingAlert[];
  events?: MonitorEvent[];
  config?: MonitorConfig;
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

function toPairKey(side1: number, side2: number): string {
  const [a, b] = side1 <= side2 ? [side1, side2] : [side2, side1];
  return `${a}-${b}`;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseClockTimeMs(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(
    value.trim(),
  );
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number((match[4] ?? '0').padEnd(3, '0'));
  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

function toYellowPairKeys(
  events: MonitorEvent[],
  config: MonitorConfig | undefined,
  nowMs: number,
): Set<string> {
  const yellowKeys = new Set<string>();
  const seenPairs = new Set<string>();
  const configuredNoise = toFiniteNumber(config?.noise_threshold);
  const configuredDetection = toFiniteNumber(config?.detection_threshold);

  for (const event of events) {
    if (event.type !== 'detection') {
      continue;
    }
    const unitA = toFiniteNumber(event.unit_a);
    const unitB = toFiniteNumber(event.unit_b);
    const value = toFiniteNumber(event.value);
    if (unitA === null || unitB === null || value === null) {
      continue;
    }
    const key = toPairKey(unitA, unitB);
    if (seenPairs.has(key)) {
      continue;
    }
    seenPairs.add(key);

    const noiseThreshold = configuredNoise ?? toFiniteNumber(event.threshold);
    const detectionThreshold = configuredDetection;
    if (noiseThreshold === null || detectionThreshold === null) {
      continue;
    }
    if (value < noiseThreshold || value >= detectionThreshold) {
      continue;
    }

    const eventClockMs = parseClockTimeMs(event.time);
    if (eventClockMs === null) {
      continue;
    }
    const nowClockMs = nowMs - new Date(nowMs).setHours(0, 0, 0, 0);
    const deltaMs =
      nowClockMs >= eventClockMs
        ? nowClockMs - eventClockMs
        : nowClockMs + 86_400_000 - eventClockMs;
    if (deltaMs <= BETWEEN_THRESHOLD_WINDOW_MS) {
      yellowKeys.add(key);
    }
  }
  return yellowKeys;
}

function toPairingEllipsePositions(
  side1: UnitPlacement,
  side2: UnitPlacement,
): [number, number][] {
  const midpointLat = (side1.lat + side2.lat) / 2;
  const midpointLng = (side1.lng + side2.lng) / 2;
  const cosLat = Math.max(Math.cos((midpointLat * Math.PI) / 180), 0.00001);

  const dx = (side2.lng - side1.lng) * cosLat;
  const dy = side2.lat - side1.lat;
  const baseDistance = Math.max(Math.hypot(dx, dy), 0.001);
  const angle = Math.atan2(dy, dx);

  const focalDistance = baseDistance / 2;
  const semiMajorAxis = Math.max(baseDistance * 0.72, focalDistance + 0.0008);
  const semiMinorAxis = Math.max(
    Math.sqrt(
      Math.max(
        semiMajorAxis * semiMajorAxis - focalDistance * focalDistance,
        0,
      ),
    ),
    0.0015,
  );
  const segments = 36;

  const ellipse: [number, number][] = [];
  for (let index = 0; index <= segments; index += 1) {
    const theta = (2 * Math.PI * index) / segments;
    const localX = semiMajorAxis * Math.cos(theta);
    const localY = semiMinorAxis * Math.sin(theta);
    const rotatedX = localX * Math.cos(angle) - localY * Math.sin(angle);
    const rotatedY = localX * Math.sin(angle) + localY * Math.cos(angle);

    ellipse.push([midpointLat + rotatedY, midpointLng + rotatedX / cosLat]);
  }
  return ellipse;
}

export function MonitorMap({
  units,
  pairings = [],
  links = [],
  crossingAlerts,
  events = [],
  config,
  focusPoint,
  tileRoot,
  offlineRequired,
  offlineModeEnabled,
  mapBounds,
  onMoveUnit,
  onSelectUnit,
}: Props) {
  const { t } = useTranslation();
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
  const alertingPairKeys = new Set(
    crossingAlerts
      .filter((alert) => !alert.acknowledged)
      .map((alert) => toPairKey(alert.sensorA, alert.sensorB)),
  );
  const yellowPairKeys = toYellowPairKeys(events, config, Date.now());

  // Cache divIcon instances so Leaflet doesn't replace the DOM element on
  // every re-render (which would interrupt an in-progress drag).
  const iconCacheRef = useRef(new Map<string, ReturnType<typeof divIcon>>());
  const getCachedIcon = useCallback(
    (label: string, type: 'normal' | 'stale') => {
      const key = `${label}\0${type}`;
      let icon = iconCacheRef.current.get(key);
      if (!icon) {
        icon = type === 'stale' ? stalePinIcon(label) : unitPinIcon(label);
        iconCacheRef.current.set(key, icon);
      }
      return icon;
    },
    [],
  );

  const tileUrl = toTileUrl(tileRoot, useOfflineTiles);
  const unitsById = new Map(units.map((unit) => [unit.id, unit] as const));
  const pairingEllipses = pairings.flatMap((pair) => {
    if (!pair.enabled) {
      return [];
    }
    const side1 = unitsById.get(pair.side1Id);
    const side2 = unitsById.get(pair.side2Id);
    if (!side1 || !side2) {
      return [];
    }
    const key = toPairKey(pair.side1Id, pair.side2Id);
    return [
      {
        key,
        positions: toPairingEllipsePositions(side1, side2),
        alerting: alertingPairKeys.has(key),
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
        {pairingEllipses.map((ellipse) => (
          <Polyline
            key={ellipse.key}
            positions={ellipse.positions}
            pathOptions={{
              color: ellipse.alerting
                ? '#ef4444'
                : yellowPairKeys.has(ellipse.key)
                  ? '#eab308'
                  : '#67e8f9',
              weight: 3,
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
                unit.status === 'stale' ? 'stale' : 'normal',
              )}
              eventHandlers={{
                click: () => onSelectUnit(unit.id),
                dragend: (event) => {
                  const next = event.target.getLatLng();
                  onMoveUnit(unit.id, next.lat, next.lng);
                },
              }}
            >
              <Popup className="sensor-popup" maxWidth={360}>
                <div className="w-full rounded-md border border-border-bright bg-card p-2 font-body text-xs md:max-h-[300px] md:overflow-y-auto lg:max-h-none lg:overflow-visible">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-sm text-foreground">
                      {t('map.sensorTitle', { id: unit.id })}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t('map.lastHeartbeat', {
                        value: toLastHeartbeat(unit.lastSeenAt),
                      })}
                    </p>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {sensorLinks.length === 0 ? (
                      <p className="font-body text-xs text-muted-foreground">
                        {t('map.noPeerLinks')}
                      </p>
                    ) : (
                      sensorLinks.map((link) => (
                        <div
                          key={`${link.direction}-${link.peerId}`}
                          className="rounded border border-border bg-card-elevated p-1"
                        >
                          <p className="font-body text-xs text-foreground">
                            {t('map.link', {
                              side1: link.side1,
                              side2: link.side2,
                            })}
                          </p>
                          <div className="mt-0.5 grid grid-cols-2 gap-x-0.5 gap-y-0">
                            <p className="font-body text-[11px] leading-none text-muted-foreground">
                              {t('map.direction', { value: link.direction })}
                            </p>
                            <p className="font-body text-[11px] leading-none text-muted-foreground">
                              {t('map.rssi', { value: link.rssi })}
                            </p>
                            <p className="font-body text-[11px] leading-none text-muted-foreground">
                              {t('map.threshold', { value: link.threshold })}
                            </p>
                            <p className="font-body text-[11px] leading-none text-muted-foreground">
                              {t('map.dt', { value: link.dt })}
                            </p>
                            <p className="font-body text-[11px] leading-none text-muted-foreground">
                              {t('map.updatedAt', { value: link.updatedAt })}
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
          {t('map.offlineMissing')}
        </div>
      ) : null}
    </section>
  );
}
