import { useMemo, useState } from 'react';

import { TooltipProvider } from '@/component/ui/tooltip';

import { useMonitorSocket } from '../domain/monitor/service/monitorSocket';
import { ConfigMenu } from '../domain/monitor/ui/ConfigMenu';
import { ConnectionIndicator } from '../domain/monitor/ui/ConnectionIndicator';
import { CrossingAlertBanner } from '../domain/monitor/ui/CrossingAlertBanner';
import { EventLog } from '../domain/monitor/ui/EventLog';
import { MonitorMap } from '../domain/monitor/ui/MonitorMap';
import { PairingPanel } from '../domain/monitor/ui/PairingPanel';
import { StatusStrip } from '../domain/monitor/ui/StatusStrip';

export function App() {
  const { state, acknowledge, requestMap, applyConfig, resetAll, setUnitPairing } =
    useMonitorSocket();
  const [focusTick, setFocusTick] = useState(0);
  const activeUnits = useMemo(
    () => state.units.filter((unit) => unit.status !== 'inactive'),
    [state.units],
  );

  const focusPoint = useMemo(() => {
    if (
      !state.crossingAlert ||
      state.crossingAlert.acknowledged ||
      focusTick === 0
    ) {
      return null;
    }
    if (state.crossingAlert.lat === null || state.crossingAlert.lng === null) {
      return null;
    }
    return { lat: state.crossingAlert.lat, lng: state.crossingAlert.lng };
  }, [focusTick, state.crossingAlert]);

  return (
    <TooltipProvider>
      <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <StatusStrip state={state} onAcknowledge={acknowledge} />
        <CrossingAlertBanner
          alert={state.crossingAlert}
          onFocus={() => setFocusTick((value) => value + 1)}
        />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <section className="flex items-center gap-3 border-b border-border bg-card/60 px-4 py-2">
            <button
              className="inline-flex items-center gap-2 rounded-md border border-border-bright bg-card px-3 py-1.5 font-display text-sm font-medium tracking-wide text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              type="button"
              onClick={() => requestMap()}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
              REFRESH MAP
            </button>
            <div className="ml-auto flex items-center gap-2 text-xs font-medium tracking-widest text-muted-foreground/60 uppercase">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/40" />
              Live Feed
            </div>
          </section>
          <MonitorMap
            units={activeUnits}
            pairings={state.pairings}
            links={state.links}
            focusPoint={focusPoint}
          />
        </div>
        <PairingPanel
          units={activeUnits}
          pairings={state.pairings}
          onTogglePairing={setUnitPairing}
        />
        <EventLog events={state.events} />
        <footer className="flex h-12 items-center justify-between border-t border-border bg-card/80 px-4 backdrop-blur-sm">
          <ConfigMenu
            config={state.config}
            onApply={applyConfig}
            onResetAll={resetAll}
          />
          <ConnectionIndicator state={state} />
        </footer>
      </main>
    </TooltipProvider>
  );
}
