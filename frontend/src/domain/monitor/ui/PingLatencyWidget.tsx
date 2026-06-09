import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/component/ui/button';

import type { PingLatencyMap } from '../model/types';

type Props = {
  pingLatencies: PingLatencyMap;
  onSendPing: (unit?: number) => boolean;
};

function formatReceivedTime(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const seconds = value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString();
}

export function PingLatencyWidget({ pingLatencies, onSendPing }: Props) {
  const { t } = useTranslation();
  const entries = Object.values(pingLatencies)
    .slice()
    .sort((a, b) => a.unit - b.unit);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border-bright bg-card/90 p-2 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          {t('ping.title')}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="border-border-bright bg-card/90 font-display text-xs font-medium tracking-wide text-muted-foreground hover:border-primary/50 hover:text-primary"
          onClick={() => {
            if (onSendPing()) {
              toast.success(t('configFeedback.pingSent'));
            } else {
              toast.error(t('configFeedback.pingNotConnected'));
            }
          }}
        >
          {t('ping.pingAll')}
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs italic text-muted-foreground/70">
          {t('ping.noData')}
        </p>
      ) : (
        <ul className="grid gap-0.5 font-mono text-xs tabular-nums">
          {entries.map((entry) => {
            const receivedTime = formatReceivedTime(entry.receivedAt);
            return (
              <li
                key={entry.unit}
                className="flex items-center justify-between text-foreground/80"
              >
                <span>S{entry.unit}</span>
                <span className="flex items-baseline gap-2 text-muted-foreground">
                  <span>
                    {t('ping.rttLabel', { value: entry.roundTripMs })}
                  </span>
                  {receivedTime ? (
                    <span className="text-[0.7rem] text-muted-foreground/70">
                      {t('ping.receivedLabel', { time: receivedTime })}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
