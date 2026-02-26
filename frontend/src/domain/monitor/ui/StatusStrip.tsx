import React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import type { AlarmState } from '../model/types';

type Props = {
  alarm: AlarmState;
  serverOnline: boolean;
};

const alarmConfig: Record<
  AlarmState,
  { bg: string; icon: string; glow: string }
> = {
  clear: {
    bg: 'bg-gradient-to-r from-emerald-900/80 via-emerald-800/60 to-emerald-900/80',
    icon: '\u2713',
    glow: 'shadow-[inset_0_-1px_0_0_oklch(0.65_0.19_155/0.3)]',
  },
  alarm: {
    bg: 'alarm-pulse',
    icon: '\u26A0',
    glow: 'shadow-[inset_0_0_40px_oklch(0.55_0.25_25/0.2),0_2px_20px_oklch(0.55_0.25_25/0.3)]',
  },
  comm_loss: {
    bg: 'bg-gradient-to-r from-amber-900/80 via-amber-800/60 to-amber-900/80',
    icon: '\u2022',
    glow: 'shadow-[inset_0_-1px_0_0_oklch(0.72_0.17_70/0.3)]',
  },
  disconnected: {
    bg: 'bg-gradient-to-r from-slate-800/80 via-slate-700/60 to-slate-800/80',
    icon: '\u2715',
    glow: '',
  },
};

function resolveLabel(
  alarm: AlarmState,
  serverOnline: boolean,
  t: (key: string) => string,
): string {
  if (alarm === 'clear') {
    return t('statusStrip.clear');
  }
  if (alarm === 'alarm') {
    return t('statusStrip.alarm');
  }
  if (alarm === 'comm_loss') {
    return t('statusStrip.commLoss');
  }
  if (alarm !== 'disconnected') {
    return t('statusStrip.disconnected');
  }
  return serverOnline
    ? t('statusStrip.noSensor')
    : t('statusStrip.serverOffline');
}

export const StatusStrip = React.memo(function StatusStrip({
  alarm,
  serverOnline,
}: Props) {
  const { t } = useTranslation();
  const config = alarmConfig[alarm];

  return (
    <section
      className={cn(
        'flex h-16 items-center gap-4 border-b border-white/5 px-6 transition-all',
        config.bg,
        config.glow,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl leading-none opacity-80">{config.icon}</span>
        <h1 className="font-display text-xl font-bold tracking-[0.12em] text-white/95 sm:text-2xl">
          {resolveLabel(alarm, serverOnline, t)}
        </h1>
      </div>
      <span className="ml-auto font-display text-xs font-medium tracking-[0.2em] text-white/30 uppercase">
        {t('statusStrip.productName')}
      </span>
    </section>
  );
});
