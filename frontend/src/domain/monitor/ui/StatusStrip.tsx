import { Button } from '@/component/ui/button';
import { cn } from '@/lib/utils';

import { shouldShowAck } from '../model/monitorState';
import type { AlarmState, MonitorState } from '../model/types';

type Props = {
  state: MonitorState;
  onAcknowledge: () => void;
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

const alarmLabel: Record<AlarmState, string> = {
  clear: 'ALL CLEAR',
  alarm: 'ALARM',
  comm_loss: 'COMM LOSS',
  disconnected: 'DISCONNECTED',
};

export function StatusStrip({ state, onAcknowledge }: Props) {
  const config = alarmConfig[state.alarm];

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
          {alarmLabel[state.alarm]}
        </h1>
      </div>
      {shouldShowAck(state) ? (
        <Button
          className="ml-auto border border-white/20 font-display tracking-wider uppercase"
          onClick={onAcknowledge}
        >
          Acknowledge
        </Button>
      ) : (
        <span className="ml-auto font-display text-xs font-medium tracking-[0.2em] text-white/30 uppercase">
          TPL SIGNUM
        </span>
      )}
    </section>
  );
}
