import { useMemo } from 'react';

import { Button } from '@/component/ui/button';
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
  const {
    state,
    requestMap,
    acknowledgeCrossing,
    applyConfig,
    resetAll,
    setUnitPairing,
  } = useMonitorSocket();
  const activeUnits = useMemo(
    () => state.units.filter((unit) => unit.status !== 'inactive'),
    [state.units],
  );

  return (
    <TooltipProvider>
      <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <StatusStrip state={state} />
        <CrossingAlertBanner
          alerts={state.crossingAlerts}
          onAcknowledge={acknowledgeCrossing}
        />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="pointer-events-none absolute bottom-4 left-4 z-[1200]">
            <Button
              variant="outline"
              size="sm"
              className="pointer-events-auto border-border-bright bg-card/90 font-display text-sm font-medium tracking-wide text-muted-foreground shadow-sm backdrop-blur-sm hover:border-primary/50 hover:text-primary"
              type="button"
              onClick={() => requestMap()}
            >
              <svg
                aria-hidden="true"
                focusable="false"
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
            </Button>
          </div>
          <MonitorMap
            units={activeUnits}
            pairings={state.pairings}
            links={state.links}
            focusPoint={null}
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
