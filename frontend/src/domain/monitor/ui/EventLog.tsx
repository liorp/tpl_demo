import { useState } from 'react';

import { Badge } from '@/component/ui/badge';
import { cn } from '@/lib/utils';

import { isDetectionEvent } from '../model/monitorState';
import type { MonitorEvent } from '../model/types';

type Props = {
  events: MonitorEvent[];
};

function formatEventValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return String(value);
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function EventLog({ events }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section
      className={cn(
        'flex flex-col border-t border-border bg-card transition-[height] duration-200',
        collapsed ? 'h-[30px]' : 'h-[25vh] min-h-36',
      )}
    >
      <button
        type="button"
        className="flex shrink-0 cursor-pointer select-none items-center gap-2 border-b border-border bg-card-elevated px-4 py-1.5 text-left transition-colors hover:bg-card-elevated/80"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <svg
          aria-hidden="true"
          focusable="false"
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
          focusable="false"
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
          <path d="M12 12h.01" />
          <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <path d="M22 13a18.15 18.15 0 0 1-20 0" />
          <rect width="20" height="14" x="2" y="6" rx="2" />
        </svg>
        <span className="font-display text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          System Events
        </span>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground/40">
          {events.length} entries
        </span>
      </button>
      {!collapsed && (
        <div
          className="flex-1 overflow-y-auto text-sm"
          role="log"
          aria-live="polite"
        >
          {events.map((event) => {
            const isAlarm = isDetectionEvent(event.msg);
            const detailEntries = Object.entries(event)
              .filter(([key]) => key !== 'time' && key !== 'msg')
              .sort(([left], [right]) => left.localeCompare(right));
            return (
              <div
                key={`${event.time}-${event.msg}`}
                className={cn(
                  'group flex items-start gap-3 border-b border-white/[0.03] px-4 py-1.5 transition-colors hover:bg-white/[0.02]',
                  isAlarm && 'bg-danger/5 hover:bg-danger/8',
                )}
              >
                <span className="min-w-[5.5rem] shrink-0 font-mono text-sm tabular-nums text-muted-foreground/50">
                  {event.time}
                </span>
                {isAlarm ? (
                  <Badge
                    variant="destructive"
                    className="mt-px h-4 shrink-0 rounded-sm px-1 font-display text-[9px] font-bold tracking-wider"
                  >
                    DET
                  </Badge>
                ) : null}
                <span
                  className={cn(
                    'leading-relaxed text-foreground/70',
                    isAlarm && 'font-medium text-red-300',
                  )}
                >
                  {event.msg}
                </span>
                {detailEntries.length > 0 ? (
                  <div className="ml-auto flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground/70">
                    {detailEntries.map(([key, value]) => (
                      <span key={key} className="font-mono">
                        {key}: {formatEventValue(value)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
