import type { UnitPlacement } from './types';

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
