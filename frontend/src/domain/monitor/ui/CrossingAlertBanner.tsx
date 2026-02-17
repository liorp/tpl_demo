import { Button } from '@/component/ui/button';

import type { CrossingAlert } from '../model/types';

type Props = {
  alerts: CrossingAlert[];
  onAcknowledge: (alert: CrossingAlert) => void;
  onFocus?: (alert: CrossingAlert) => void;
};

function hasLocation(alert: CrossingAlert): boolean {
  return alert.lat !== null && alert.lng !== null;
}

function formatLocation(alert: CrossingAlert): string | null {
  if (!hasLocation(alert)) {
    return null;
  }
  return `${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)}`;
}

export function CrossingAlertBanner({ alerts, onAcknowledge, onFocus }: Props) {
  if (!alerts.length) {
    return null;
  }

  return (
    <section className="space-y-1 border-b border-red-800/60 bg-gradient-to-r from-red-950/80 via-red-900/50 to-red-950/80 px-6 py-2 shadow-[inset_0_0_30px_oklch(0.45_0.2_25/0.15)]">
      {alerts.map((alert) => {
        const location = formatLocation(alert);
        return (
          <div
            key={`${alert.sensorA}-${alert.sensorB}-${alert.at}`}
            className="flex items-center justify-between gap-3 border border-red-800/60 bg-red-950/50 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="glow-pulse translate-y-px text-xl leading-none">
                  &#x26A0;
                </span>
                <span className="self-baseline font-display text-xs font-semibold tracking-[0.18em] text-red-300 uppercase">
                  Crossing
                </span>
                <span className="self-baseline font-display text-sm font-medium tracking-wide text-red-200">
                  S{alert.sensorA} &times; S{alert.sensorB}
                </span>
              </div>
              {location ? (
                <p className="mt-0.5 pl-8 font-body text-xs tracking-wide text-red-200/85">
                  {location}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {hasLocation(alert) && onFocus ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="gap-1.5 border-red-700/60 bg-red-900/30 font-display text-sm font-semibold tracking-wide text-red-200 hover:border-red-600 hover:bg-red-800/40"
                  onClick={() => onFocus(alert)}
                  aria-label={`Focus S${alert.sensorA} × S${alert.sensorB}`}
                >
                  Focus
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="gap-1.5 border-red-700/60 bg-red-900/50 font-display text-sm font-semibold tracking-wide text-red-200 hover:border-red-600 hover:bg-red-800/50"
                onClick={() => onAcknowledge(alert)}
                aria-label={`OK S${alert.sensorA} × S${alert.sensorB}`}
              >
                OK
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
