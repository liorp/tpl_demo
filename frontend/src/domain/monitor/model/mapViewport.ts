import type { MapBounds, UnitPlacement } from './types';

export const ISRAEL_MAP_BOUNDS: [[number, number], [number, number]] = [
  [29.2, 34.1],
  [33.55, 36.05],
];

export function getUnitBounds(
  units: UnitPlacement[],
): [[number, number], [number, number]] | null {
  if (units.length === 0) {
    return null;
  }

  let minLat = units[0].lat;
  let maxLat = units[0].lat;
  let minLng = units[0].lng;
  let maxLng = units[0].lng;

  for (const unit of units) {
    if (unit.lat < minLat) minLat = unit.lat;
    if (unit.lat > maxLat) maxLat = unit.lat;
    if (unit.lng < minLng) minLng = unit.lng;
    if (unit.lng > maxLng) maxLng = unit.lng;
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

export function toUnixSeconds(timestamp: number): number {
  return timestamp > 1_000_000_000_000
    ? Math.floor(timestamp / 1000)
    : Math.floor(timestamp);
}

export function toLeafletBounds(
  bounds: MapBounds | null,
  bufferKm: number | null,
): [[number, number], [number, number]] | null {
  if (!bounds) {
    return null;
  }
  if (
    !Number.isFinite(bounds.north) ||
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.east) ||
    !Number.isFinite(bounds.west)
  ) {
    return null;
  }

  const north = Math.max(bounds.north, bounds.south);
  const south = Math.min(bounds.north, bounds.south);
  const east = Math.max(bounds.east, bounds.west);
  const west = Math.min(bounds.east, bounds.west);
  const safeBufferKm =
    typeof bufferKm === 'number' && Number.isFinite(bufferKm)
      ? Math.max(bufferKm, 0)
      : 0;

  const midLat = (north + south) / 2;
  const latBuffer = safeBufferKm / 111;
  const lngScale = Math.max(0.1, Math.abs(Math.cos((midLat * Math.PI) / 180)));
  const lngBuffer = safeBufferKm / (111 * lngScale);

  return [
    [south - latBuffer, west - lngBuffer],
    [north + latBuffer, east + lngBuffer],
  ];
}
