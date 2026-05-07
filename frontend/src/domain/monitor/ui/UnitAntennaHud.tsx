import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/component/ui/button';
import { cn } from '@/lib/utils';

import type {
  AntennaMode,
  SensorStatusMap,
  UnitPlacement,
} from '../model/types';

type Props = {
  units: UnitPlacement[];
  sensorStatus: SensorStatusMap;
  onSendSetActiveAntenna: (unit: number, antenna: AntennaMode) => boolean;
  onSendRequestActiveAntenna: (unit?: number) => boolean;
};

function isAntennaSupported(
  supported: number | null | undefined,
  mode: AntennaMode,
): boolean {
  if (typeof supported !== 'number') return true; // unknown — allow both
  if (supported === 3) return true;
  return supported === mode;
}

export function UnitAntennaHud({
  units,
  sensorStatus,
  onSendSetActiveAntenna,
  onSendRequestActiveAntenna,
}: Props) {
  const { t } = useTranslation();
  const sortedUnits = [...units].sort((a, b) => a.id - b.id);

  return (
    <div className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto rounded-md border border-border-bright bg-card/90 p-2 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          {t('map.antenna')}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="border-border-bright bg-card/90 font-display text-xs font-medium tracking-wide text-muted-foreground hover:border-primary/50 hover:text-primary"
          onClick={() => onSendRequestActiveAntenna()}
        >
          {t('map.antennaRefresh')}
        </Button>
      </div>
      {sortedUnits.length === 0 ? (
        <p className="text-xs italic text-muted-foreground/70">
          {t('pairings.waiting')}
        </p>
      ) : (
        <ul className="grid gap-1 font-mono text-xs">
          {sortedUnits.map((unit) => {
            const status = sensorStatus[String(unit.id)];
            const active: AntennaMode | null = status?.activeAntenna ?? null;
            const supported = status?.supportedAntennas ?? null;
            return (
              <li
                key={unit.id}
                className="flex items-center justify-between gap-2 rounded border border-border/40 bg-background/60 px-2 py-1"
              >
                <span className="font-display tracking-wide text-foreground">
                  {unit.label}
                </span>
                <fieldset
                  className="flex gap-1 border-0 p-0"
                  aria-label={`${unit.label} ${t('map.antenna')}`}
                >
                  {([1, 2] as AntennaMode[]).map((mode) => {
                    const enabled = isAntennaSupported(supported, mode);
                    const isActive = active === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        disabled={!enabled}
                        onClick={() => {
                          if (onSendSetActiveAntenna(unit.id, mode)) {
                            toast.success(
                              t('configFeedback.antennaSet', {
                                unit: unit.label,
                                mode:
                                  mode === 1
                                    ? t('map.antennaInternal')
                                    : t('map.antennaExternal'),
                              }),
                            );
                          } else {
                            toast.error(
                              t('configFeedback.antennaNotConnected'),
                            );
                          }
                        }}
                        className={cn(
                          'rounded px-2 py-0.5 text-[11px] font-display tracking-wide transition-colors',
                          enabled
                            ? 'cursor-pointer hover:bg-primary/10'
                            : 'cursor-not-allowed opacity-40',
                          isActive
                            ? 'bg-primary/20 text-primary'
                            : 'text-muted-foreground',
                        )}
                      >
                        {mode === 1
                          ? t('map.antennaInternal')
                          : t('map.antennaExternal')}
                      </button>
                    );
                  })}
                </fieldset>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
