import { useEffect, useRef, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';

import { getUnitBounds } from '../model/mapViewport';
import type { PairLink, SignalLinkState, UnitPlacement } from '../model/types';

const DEFAULT_CENTER: [number, number] = [33.31, 35.78];
const ONLINE_MAX_ZOOM = 19;
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
  placementMode: boolean;
  onPlaceAt: (lat: number, lng: number) => void;
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
  const lastUnitsSignature = useRef('');

  useEffect(() => {
    const signature = units
      .map((unit) => `${unit.id}:${unit.lat.toFixed(5)}:${unit.lng.toFixed(5)}`)
      .join('|');

    if (!signature || signature === lastUnitsSignature.current) {
      return;
    }

    lastUnitsSignature.current = signature;
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

function MapPlacementController({
  placementMode,
  onPlaceAt,
}: {
  placementMode: boolean;
  onPlaceAt: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click: (event) => {
      if (!placementMode) {
        return;
      }
      onPlaceAt(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

export function MonitorMap({
  units,
  pairings,
  links,
  focusPoint,
  tileRoot,
  offlineRequired,
  offlineModeEnabled,
  mapBounds,
  placementMode,
  onPlaceAt,
  onSelectUnit,
}: Props) {
  const [offlineTilePackMissing, setOfflineTilePackMissing] = useState(false);
  const [offlineZoomRange, setOfflineZoomRange] = useState<{
    minZoom: number;
    maxZoom: number;
  } | null>(null);
  const useOfflineTiles = offlineRequired || offlineModeEnabled;
  const unitById = new Map(units.map((unit) => [unit.id, unit] as const));
  const tileUrl = toTileUrl(tileRoot, useOfflineTiles);
  const minZoom = offlineZoomRange ? offlineZoomRange.minZoom : 7;
  const maxZoom = offlineZoomRange
    ? offlineZoomRange.maxZoom
    : useOfflineTiles
      ? 12
      : ONLINE_MAX_ZOOM;

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
        maxZoom={maxZoom}
        maxBounds={mapBounds ?? ISRAEL_BOUNDS}
        maxBoundsViscosity={1}
        attributionControl={false}
        className="h-full w-full"
      >
        <TileLayer
          url={tileUrl}
          maxZoom={maxZoom}
          maxNativeZoom={maxZoom}
          eventHandlers={{
            tileerror: () => {
              if (useOfflineTiles) {
                setOfflineTilePackMissing(true);
              }
            },
          }}
        />
        <MapUnitsViewportController units={units} />
        <MapFocusController focusPoint={focusPoint} />
        <MapPlacementController
          placementMode={placementMode}
          onPlaceAt={onPlaceAt}
        />
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
          <CircleMarker
            key={unit.id}
            center={[unit.lat, unit.lng]}
            radius={7}
            pathOptions={{
              color: '#67e8f9',
              weight: 2,
              fillColor: '#06b6d4',
              fillOpacity: 0.65,
            }}
            eventHandlers={{
              click: () => onSelectUnit(unit.id),
            }}
          >
            <Popup>
              <div className="font-body text-xs">
                <strong className="font-display">{unit.label}</strong>
                <br />
                <span className="text-muted-foreground">Sensor #{unit.id}</span>
              </div>
            </Popup>
          </CircleMarker>
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
