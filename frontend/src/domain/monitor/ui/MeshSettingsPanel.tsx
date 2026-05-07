import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/component/ui/button';
import { Label } from '@/component/ui/label';

import type { SensorStatusMap } from '../model/types';

type Props = {
  sensorStatus: SensorStatusMap;
  onRefreshMap: () => void;
  onSendReset: () => boolean;
};

function formatLastSeen(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const seconds = value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString();
}

export function MeshSettingsPanel({
  sensorStatus,
  onRefreshMap,
  onSendReset,
}: Props) {
  const { t } = useTranslation();
  const rows = Object.entries(sensorStatus)
    .map(([id, status]) => ({ id: Number.parseInt(id, 10), ...status }))
    .filter((row) => Number.isInteger(row.id))
    .sort((a, b) => a.id - b.id);

  return (
    <div className="grid gap-2 rounded-md border border-border-bright bg-background/70 p-3">
      <Label className="font-display text-xs tracking-wide text-muted-foreground">
        {t('settings.mesh')}
      </Label>
      <p className="font-body text-xs text-muted-foreground/85">
        {t('settings.meshDescription')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onRefreshMap}
          className="font-display tracking-wide"
        >
          {t('settings.meshRefreshMap')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            if (!window.confirm(t('settings.meshConfirmReset'))) return;
            if (onSendReset()) {
              toast.success(t('configFeedback.resetSent'));
            } else {
              toast.error(t('configFeedback.resetNotConnected'));
            }
          }}
          className="font-display tracking-wide"
        >
          {t('settings.meshResetDevice')}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="px-1 py-1 text-xs italic text-muted-foreground/70">
          {t('settings.meshNoDevices')}
        </p>
      ) : (
        <table className="w-full text-left font-mono text-xs tabular-nums">
          <thead className="text-muted-foreground/70">
            <tr>
              <th className="py-1 pr-2 font-display tracking-wide font-medium">
                {t('settings.meshTableUnit')}
              </th>
              <th className="py-1 pr-2 font-display tracking-wide font-medium">
                {t('settings.meshTableVersion')}
              </th>
              <th className="py-1 pr-2 font-display tracking-wide font-medium">
                {t('settings.meshTableVoltage')}
              </th>
              <th className="py-1 font-display tracking-wide font-medium">
                {t('settings.meshTableLastSeen')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border/30">
                <td className="py-1 pr-2 text-foreground">{row.id}</td>
                <td className="py-1 pr-2 text-foreground/80">
                  {row.version ?? '—'}
                </td>
                <td className="py-1 pr-2 text-foreground/80">
                  {typeof row.voltage === 'number' ? `${row.voltage} mV` : '—'}
                </td>
                <td className="py-1 text-foreground/80">
                  {formatLastSeen(row.lastSeen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
