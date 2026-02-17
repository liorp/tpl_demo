import { useEffect, useRef } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';

import { getUnitBounds } from '../model/mapViewport';
import type { PairLink, SignalLinkState, UnitPlacement } from '../model/types';

const DEFAULT_CENTER: [number, number] = [33.31, 35.78];
const ISRAEL_BOUNDS: [[number, number], [number, number]] = [
  [29.2, 34.1],
  [33.55, 36.05],
];

type Props = {
  units: UnitPlacement[];
  pairings: PairLink[];
  links: SignalLinkState[];
  focusPoint: { lat: number; lng: number } | null;
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

export function MonitorMap({ units, pairings, links, focusPoint }: Props) {
  const unitById = new Map(units.map((unit) => [unit.id, unit] as const));

  return (
    <section className="min-h-0 flex-1">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={12}
        minZoom={7}
        maxZoom={16}
        maxBounds={ISRAEL_BOUNDS}
        maxBoundsViscosity={1}
        attributionControl={false}
        className="h-full w-full"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={16}
        />
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
    </section>
  );
}
