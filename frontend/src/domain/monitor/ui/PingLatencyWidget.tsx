import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/component/ui/button';

import type { PingLatencyMap } from '../model/types';

type Props = {
  pingLatencies: PingLatencyMap;
  onSendPing: (unit?: number) => boolean;
};

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
          {entries.map((entry) => (
            <li
              key={entry.unit}
              className="flex items-center justify-between text-foreground/80"
            >
              <span>S{entry.unit}</span>
              <span className="text-muted-foreground">
                {t('ping.rttLabel', { value: entry.roundTripMs })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
