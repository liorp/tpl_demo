import { useState } from 'react';
import { Switch } from '@/component/ui/switch';
import { cn } from '@/lib/utils';

import type { PairLink, UnitPlacement } from '../model/types';

type Props = {
  units: UnitPlacement[];
  pairings: PairLink[];
  onTogglePairing: (side1Id: number, side2Id: number, enabled: boolean) => void;
};

function hasPair(
  pairings: PairLink[],
  side1Id: number,
  side2Id: number,
): boolean {
  return pairings.some(
    (pair) =>
      ((pair.side1Id === side1Id && pair.side2Id === side2Id) ||
        (pair.side1Id === side2Id && pair.side2Id === side1Id)) &&
      pair.enabled,
  );
}

export function PairingPanel({ units, pairings, onTogglePairing }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const sortedUnits = [...units].sort((a, b) => a.id - b.id);

  return (
    <section
      className={cn(
        'flex flex-col border-t border-border bg-card transition-[height] duration-200',
        collapsed ? 'h-[30px]' : 'h-40',
      )}
    >
      <button
        type="button"
        className="flex shrink-0 cursor-pointer select-none items-center gap-2 border-b border-border bg-card-elevated px-4 py-1.5 transition-colors hover:bg-card-elevated/80"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'text-muted-foreground/50 transition-transform duration-200',
            collapsed && '-rotate-90',
          )}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary/60"
        >
          <circle cx="8" cy="8" r="2" />
          <circle cx="16" cy="16" r="2" />
          <path d="m9.5 9.5 5 5" />
          <path d="M14 8h6" />
          <path d="M4 16h6" />
        </svg>
        <span className="font-display text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          Sensor Pairings
        </span>
      </button>
      {!collapsed &&
        (units.length < 2 ? (
          <p className="px-4 py-2 text-sm text-muted-foreground/60 italic">
            Waiting for at least 2 units...
          </p>
        ) : (
          <div className="grid gap-1 overflow-y-auto px-4 py-2.5">
            {sortedUnits.map((side1, side1Index) =>
              sortedUnits.slice(side1Index + 1).map((side2) => {
                const enabled = hasPair(pairings, side1.id, side2.id);
                return (
                  <div
                    key={`${side1.id}-${side2.id}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-muted/40',
                      enabled && 'bg-primary/5',
                    )}
                  >
                    <Switch
                      size="sm"
                      checked={enabled}
                      onCheckedChange={(checked) =>
                        onTogglePairing(side1.id, side2.id, checked === true)
                      }
                    />
                    <span className="text-sm text-foreground/80">
                      <span className="font-medium text-foreground">
                        {side1.label}
                      </span>
                      <span className="mx-1.5 text-muted-foreground/50">
                        &harr;
                      </span>
                      <span className="font-medium text-foreground">
                        {side2.label}
                      </span>
                    </span>
                  </div>
                );
              }),
            )}
          </div>
        ))}
    </section>
  );
}
