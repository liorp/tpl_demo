import { Badge } from '@/component/ui/badge';
import { Button } from '@/component/ui/button';

import type { CrossingAlert } from '../model/types';

type Props = {
  alert: CrossingAlert | null;
  onFocus: () => void;
  onAcknowledge: () => void;
};

export function CrossingAlertBanner({ alert, onFocus, onAcknowledge }: Props) {
  if (!alert || alert.acknowledged) {
    return null;
  }
  const hasPair =
    Number.isFinite(alert.sensorA) && Number.isFinite(alert.sensorB);

  return (
    <section className="slide-down border-b border-red-800/60 bg-gradient-to-r from-red-950/80 via-red-900/50 to-red-950/80 px-6 py-3 shadow-[inset_0_0_30px_oklch(0.45_0.2_25/0.15)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="glow-pulse translate-y-px text-2xl leading-none">
            &#x26A0;
          </span>
          <Badge
            variant="destructive"
            className="self-baseline rounded-sm px-1 py-0 font-display text-sm leading-none font-medium tracking-wide uppercase"
          >
            CROSSING
          </Badge>
          {hasPair ? (
            <span className="self-baseline font-display text-sm font-medium tracking-wide text-red-200">
              S{alert.sensorA} &times; S{alert.sensorB}
            </span>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="border-red-700/60 bg-red-900/50 font-display text-sm font-semibold tracking-wide text-red-200 hover:border-red-600 hover:bg-red-800/50"
            onClick={onAcknowledge}
          >
            OK
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="gap-1.5 border-red-700/60 bg-red-900/50 font-display text-sm font-semibold tracking-wide text-red-200 hover:border-red-600 hover:bg-red-800/50"
            onClick={onFocus}
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
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
              <path d="M11 8v6" />
              <path d="M8 11h6" />
            </svg>
            Focus
          </Button>
        </div>
      </div>
    </section>
  );
}
