import { useEffect, useState } from 'react';

import { Button } from '@/component/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/component/ui/dialog';
import { Input } from '@/component/ui/input';
import { Label } from '@/component/ui/label';
import { Switch } from '@/component/ui/switch';

import type { MonitorConfig } from '../model/types';

type Props = {
  config: MonitorConfig;
  alarmSoundEnabled: boolean;
  offlineModeEnabled: boolean;
  onApply: (next: { threshold: number; val: number }) => void;
  onAlarmSoundEnabledChange: (enabled: boolean) => void;
  onOfflineModeEnabledChange: (enabled: boolean) => void;
  onResetAll: () => void;
};

const DEFAULT_THRESHOLD = 500;
const DEFAULT_VAL = 549;

function toKnownValue(value: number | null, fallback: number): string {
  return value !== null ? String(value) : String(fallback);
}

export function ConfigMenu({
  config,
  alarmSoundEnabled,
  offlineModeEnabled,
  onApply,
  onAlarmSoundEnabledChange,
  onOfflineModeEnabledChange,
  onResetAll,
}: Props) {
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState(
    toKnownValue(config.threshold, DEFAULT_THRESHOLD),
  );
  const [val, setVal] = useState(toKnownValue(config.val, DEFAULT_VAL));

  useEffect(() => {
    if (open) {
      return;
    }
    setThreshold(toKnownValue(config.threshold, DEFAULT_THRESHOLD));
    setVal(toKnownValue(config.val, DEFAULT_VAL));
  }, [config.threshold, config.val, open]);

  const thresholdNum = Number(threshold);
  const valNum = Number(val);
  const valid =
    Number.isFinite(thresholdNum) &&
    Number.isFinite(valNum) &&
    threshold.trim() !== '' &&
    val.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-border bg-card font-display text-sm font-medium tracking-wide text-muted-foreground hover:border-primary/50 hover:text-foreground"
          type="button"
        >
          <svg
            aria-hidden="true"
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
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border-bright bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure detection threshold and validation parameters.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label
              htmlFor="threshold"
              className="font-display text-xs tracking-wide text-muted-foreground"
            >
              Threshold
            </Label>
            <Input
              id="threshold"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              className="bg-background font-mono tabular-nums"
            />
          </div>
          <div className="grid gap-2">
            <Label
              htmlFor="val"
              className="font-display text-xs tracking-wide text-muted-foreground"
            >
              Val
            </Label>
            <Input
              id="val"
              value={val}
              onChange={(event) => setVal(event.target.value)}
              className="bg-background font-mono tabular-nums"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border-bright bg-background/70 px-3 py-2">
            <div className="space-y-0.5">
              <Label
                htmlFor="alarm-sound"
                className="font-display text-xs tracking-wide text-muted-foreground"
              >
                Alarm Sound
              </Label>
              <p className="font-body text-xs text-muted-foreground/85">
                Play a short alert sound when alarm is triggered.
              </p>
            </div>
            <Switch
              id="alarm-sound"
              checked={alarmSoundEnabled}
              onCheckedChange={onAlarmSoundEnabledChange}
              aria-label="Alarm Sound"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border-bright bg-background/70 px-3 py-2">
            <div className="space-y-0.5">
              <Label
                htmlFor="offline-mode"
                className="font-display text-xs tracking-wide text-muted-foreground"
              >
                Offline Mode
              </Label>
              <p className="font-body text-xs text-muted-foreground/85">
                Use local tiles. Disable to fetch maps from the internet.
              </p>
            </div>
            <Switch
              id="offline-mode"
              checked={offlineModeEnabled}
              onCheckedChange={onOfflineModeEnabledChange}
              aria-label="Offline Mode"
            />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              onResetAll();
              setOpen(false);
            }}
            className="font-display tracking-wide"
          >
            Reset all
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              className="font-display tracking-wide"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onApply({ threshold: thresholdNum, val: valNum });
                setOpen(false);
              }}
              disabled={!valid}
              className="font-display tracking-wide"
            >
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
