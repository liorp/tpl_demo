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

import type { MonitorConfig } from '../model/types';

type Props = {
  config: MonitorConfig;
  onApply: (next: { threshold: number; val: number }) => void;
  onResetAll: () => void;
};

const DEFAULT_THRESHOLD = 500;
const DEFAULT_VAL = 549;

function toKnownValue(value: number | null, fallback: number): string {
  return value !== null ? String(value) : String(fallback);
}

export function ConfigMenu({ config, onApply, onResetAll }: Props) {
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
        <button
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 font-display text-sm font-medium tracking-wide text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
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
            <path d="m4 4 7.5 16 2.3-6.2L20 11.5z" />
            <path d="m13.8 13.8 4.2 4.2" />
          </svg>
          Settings
        </button>
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
