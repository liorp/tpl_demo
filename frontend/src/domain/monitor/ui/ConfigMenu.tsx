import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import { parseInputNumber } from '../model/validation';

type Props = {
  config: MonitorConfig;
  alarmSoundEnabled: boolean;
  offlineModeEnabled: boolean;
  onSendThreshold: (value: number) => boolean;
  onSendDetectionThreshold: (value: number) => boolean;
  onSendGain: (value: number) => boolean;
  onAlarmSoundEnabledChange: (enabled: boolean) => void;
  onOfflineModeEnabledChange: (enabled: boolean) => void;
  onResetAll: () => void;
};

const DEFAULT_THRESHOLD = 500;
const DEFAULT_DETECTION_THRESHOLD = 700;
const DEFAULT_GAIN = 64;

function toKnownValue(value: number | null, fallback: number): string {
  return value !== null ? String(value) : String(fallback);
}

export function ConfigMenu({
  config,
  alarmSoundEnabled,
  offlineModeEnabled,
  onSendThreshold,
  onSendDetectionThreshold,
  onSendGain,
  onAlarmSoundEnabledChange,
  onOfflineModeEnabledChange,
  onResetAll,
}: Props) {
  const [open, setOpen] = useState(false);
  const [noiseThreshold, setNoiseThreshold] = useState(
    toKnownValue(config.noise_threshold ?? null, DEFAULT_THRESHOLD),
  );
  const [detectionThreshold, setDetectionThreshold] = useState(
    toKnownValue(
      config.detection_threshold ?? null,
      DEFAULT_DETECTION_THRESHOLD,
    ),
  );
  const [gain, setGain] = useState(toKnownValue(config.gain, DEFAULT_GAIN));

  useEffect(() => {
    if (open) {
      return;
    }
    setNoiseThreshold(
      toKnownValue(config.noise_threshold ?? null, DEFAULT_THRESHOLD),
    );
    setDetectionThreshold(
      toKnownValue(
        config.detection_threshold ?? null,
        DEFAULT_DETECTION_THRESHOLD,
      ),
    );
    setGain(toKnownValue(config.gain, DEFAULT_GAIN));
  }, [config.gain, config.noise_threshold, config.detection_threshold, open]);

  const noiseThresholdNum = parseInputNumber(noiseThreshold);
  const detectionThresholdNum = parseInputNumber(detectionThreshold);
  const gainNum = parseInputNumber(gain);
  const noiseThresholdValid = noiseThresholdNum !== null;
  const detectionThresholdValid =
    detectionThresholdNum !== null &&
    (noiseThresholdNum === null || detectionThresholdNum >= noiseThresholdNum);
  const gainValid = gainNum !== null;

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
            Configure noise threshold, detection threshold, and gain parameters.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label
              htmlFor="noise-threshold"
              className="font-display text-xs tracking-wide text-muted-foreground"
            >
              Noise Threshold
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="noise-threshold"
                value={noiseThreshold}
                onChange={(event) => setNoiseThreshold(event.target.value)}
                className="bg-background font-mono tabular-nums"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (noiseThresholdNum === null) {
                    return;
                  }
                  if (onSendThreshold(noiseThresholdNum)) {
                    toast.success(
                      `Noise threshold set to ${noiseThresholdNum}`,
                    );
                  } else {
                    toast.error('Not connected — noise threshold not sent');
                  }
                }}
                disabled={!noiseThresholdValid}
                className="font-display tracking-wide"
              >
                Send
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label
              htmlFor="detection-threshold"
              className="font-display text-xs tracking-wide text-muted-foreground"
            >
              Detection Threshold
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="detection-threshold"
                value={detectionThreshold}
                onChange={(event) => setDetectionThreshold(event.target.value)}
                className="bg-background font-mono tabular-nums"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (detectionThresholdNum === null) {
                    return;
                  }
                  if (
                    noiseThresholdNum !== null &&
                    detectionThresholdNum < noiseThresholdNum
                  ) {
                    return;
                  }
                  if (onSendDetectionThreshold(detectionThresholdNum)) {
                    toast.success(
                      `Detection threshold set to ${detectionThresholdNum}`,
                    );
                  } else {
                    toast.error('Not connected — detection threshold not sent');
                  }
                }}
                disabled={!detectionThresholdValid}
                className="font-display tracking-wide"
              >
                Send
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label
              htmlFor="gain"
              className="font-display text-xs tracking-wide text-muted-foreground"
            >
              Gain
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="gain"
                value={gain}
                onChange={(event) => setGain(event.target.value)}
                className="bg-background font-mono tabular-nums"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (gainNum === null) {
                    return;
                  }
                  if (onSendGain(gainNum)) {
                    toast.success(`Gain set to ${gainNum}`);
                  } else {
                    toast.error('Not connected — gain not sent');
                  }
                }}
                disabled={!gainValid}
                className="font-display tracking-wide"
              >
                Send
              </Button>
            </div>
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
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            className="font-display tracking-wide"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
