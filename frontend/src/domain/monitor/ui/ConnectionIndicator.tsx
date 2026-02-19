import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/component/ui/tooltip';
import { cn } from '@/lib/utils';

import type { MonitorState } from '../model/types';

type Props = {
  state: MonitorState;
};

export function ConnectionIndicator({ state }: Props) {
  const dotColor = state.connected
    ? 'bg-emerald-400 shadow-[0_0_6px_oklch(0.65_0.19_155/0.5)]'
    : state.serverOnline
      ? 'bg-amber-400/80'
      : 'bg-red-500/80';

  const tooltip = state.connected
    ? `Connected to sensor on port ${state.port}`
    : state.serverOnline
      ? 'Server online — waiting for sensor'
      : 'Server offline — retrying...';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="ml-auto flex cursor-default items-center gap-2.5 text-sm">
          <span className="relative flex h-2.5 w-2.5">
            {state.connected ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            ) : null}
            <span
              className={cn(
                'relative inline-flex h-2.5 w-2.5 rounded-full',
                dotColor,
              )}
            />
          </span>
          <span className="font-display text-sm font-medium tracking-wide text-muted-foreground">
            {state.connected ? (
              <>
                <span className="text-emerald-400/90">Online</span>
                <span className="mx-1 text-muted-foreground/30">|</span>
                <span className="font-mono tabular-nums text-foreground/50">
                  {state.port}
                </span>
              </>
            ) : state.serverOnline ? (
              <span className="text-amber-400/80">No sensor</span>
            ) : (
              <span className="text-red-400/80">Server offline</span>
            )}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
