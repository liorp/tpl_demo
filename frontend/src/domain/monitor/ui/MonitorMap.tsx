import { divIcon } from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';

import { getUnitBounds } from '../model/mapViewport';
import type { PairLink, SignalLinkState, UnitPlacement } from '../model/types';

const DEFAULT_CENTER: [number, number] = [33.31, 35.78];
const ONLINE_TILE_NATIVE_MAX_ZOOM = 19;
const OFFLINE_DEFAULT_NATIVE_MAX_ZOOM = 14;
const ISRAEL_BOUNDS: [[number, number], [number, number]] = [
  [29.2, 34.1],
  [33.55, 36.05],
];

type Props = {
  units: UnitPlacement[];
  pairings: PairLink[];
  links: SignalLinkState[];
  focusPoint: { lat: number; lng: number } | null;
  tileRoot: string | null;
  offlineRequired: boolean;
  offlineModeEnabled: boolean;
  mapBounds: [[number, number], [number, number]] | null;
  onMoveUnit: (unitId: number, lat: number, lng: number) => void;
  onSelectUnit: (unitId: number) => void;
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

function toSignalColor(link: SignalLinkState | undefined): string {
  if (!link) {
    return '#475569';
  }
  if (link.quality >= 80) {
    return '#22c55e';
  }
  if (link.quality >= 60) {
    return '#eab308';
  }
  return '#ef4444';
}

function toTileUrl(tileRoot: string | null, useOfflineTiles: boolean): string {
  if (!useOfflineTiles) {
    return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  }
  const root = (tileRoot ?? '/tiles').replace(/\/+$/, '');
  return `${root}/{z}/{x}/{y}.png`;
}
const unitPinIcon = divIcon({
  className: '',
  html: '<span style="display:block;width:14px;height:14px;border-radius:9999px;border:2px solid #67e8f9;background:#06b6d4;box-shadow:0 0 0 2px rgba(15,23,42,0.35);"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export function MonitorMap({
  units,
  pairings,
  links,
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
  const unitById = new Map(units.map((unit) => [unit.id, unit] as const));
  const tileUrl = toTileUrl(tileRoot, useOfflineTiles);
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
        maxBounds={mapBounds ?? ISRAEL_BOUNDS}
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
        {pairings.map((pair) => {
          const side1 = unitById.get(pair.side1Id);
          const side2 = unitById.get(pair.side2Id);
          if (!side1 || !side2 || !pair.enabled) {
            return null;
          }
          const signal = links.find(
            (link) =>
              (link.side1 === pair.side1Id && link.side2 === pair.side2Id) ||
              (link.side1 === pair.side2Id && link.side2 === pair.side1Id),
          );
          return (
            <Polyline
              key={`${pair.side1Id}-${pair.side2Id}`}
              positions={[
                [side1.lat, side1.lng],
                [side2.lat, side2.lng],
              ]}
              pathOptions={{
                color: toSignalColor(signal),
                weight: signal ? 2 + Math.round(signal.intensity / 35) : 2,
                opacity: 0.85,
                dashArray: signal ? undefined : '6 4',
              }}
            />
          );
        })}
        {units.map((unit) => (
          <Marker
            key={unit.id}
            position={[unit.lat, unit.lng]}
            draggable={true}
            icon={unitPinIcon}
            eventHandlers={{
              click: () => onSelectUnit(unit.id),
              dragend: (event) => {
                const next = event.target.getLatLng();
                onMoveUnit(unit.id, next.lat, next.lng);
              },
            }}
          >
            <Popup>
              <div className="font-body text-xs">
                <strong className="font-display">{unit.label}</strong>
                <br />
                <span className="text-muted-foreground">Sensor #{unit.id}</span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {offlineModeEnabled && offlineTilePackMissing ? (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[1300] rounded border border-red-500/50 bg-red-950/90 px-3 py-2 text-xs text-red-100">
          Offline map tiles are unavailable.
        </div>
      ) : null}
    </section>
  );
}
