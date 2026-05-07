import { Link2Icon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/component/ui/button';
import { Input } from '@/component/ui/input';
import { Switch } from '@/component/ui/switch';
import { cn } from '@/lib/utils';

import type { PairLink, SignalLinkState, UnitPlacement } from '../model/types';
import { parseInputNumber } from '../model/validation';

type Props = {
  units: UnitPlacement[];
  pairings: PairLink[];
  links: SignalLinkState[];
  onTogglePairing: (side1Id: number, side2Id: number, enabled: boolean) => void;
  onSendPairThreshold: (a: number, b: number, value: number) => boolean;
  onSendPairGain: (a: number, b: number, value: number) => boolean;
};

function hasPair(
  pairings: PairLink[],
  side1Id: number,
  side2Id: number,
): boolean {
  return pairings.some(
    (pair) =>
      ((pair.side1Id === side1Id && pair.side2Id === side2Id) ||
        (pair.side1Id === side2Id && pair.side2Id === side1Id)) &&
      pair.enabled,
  );
}

function findLink(
  links: SignalLinkState[],
  a: number,
  b: number,
): SignalLinkState | undefined {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return links.find((link) => link.side1 === lo && link.side2 === hi);
}

export function PairingPanel({
  units,
  pairings,
  links,
  onTogglePairing,
  onSendPairThreshold,
  onSendPairGain,
}: Props) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => a.id - b.id),
    [units],
  );

  return (
    <section
      className={cn(
        'flex flex-col border-t border-border bg-card transition-[height] duration-200',
        collapsed ? 'h-[30px]' : 'h-72',
      )}
    >
      <button
        type="button"
        className="flex shrink-0 cursor-pointer select-none items-center gap-2 border-b border-border bg-card-elevated px-4 py-1.5 transition-colors hover:bg-card-elevated/80"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'text-muted-foreground/50 transition-transform duration-200',
            collapsed && '-rotate-90',
          )}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        <Link2Icon
          aria-hidden="true"
          focusable="false"
          width={12}
          height={12}
          className="text-primary/60"
        />
        <span className="font-display text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          {t('pairings.title')}
        </span>
      </button>
      {!collapsed &&
        (units.length < 2 ? (
          <p className="px-4 py-2 text-sm text-muted-foreground/60 italic">
            {t('pairings.waiting')}
          </p>
        ) : (
          <div className="grid gap-1 overflow-y-auto px-4 py-2.5">
            {sortedUnits.map((side1, side1Index) =>
              sortedUnits.slice(side1Index + 1).map((side2) => {
                const enabled = hasPair(pairings, side1.id, side2.id);
                const pairKey = `${Math.min(side1.id, side2.id)}-${Math.max(side1.id, side2.id)}`;
                const isExpanded = expandedPair === pairKey;
                const link = findLink(links, side1.id, side2.id);
                return (
                  <PairRow
                    key={pairKey}
                    side1={side1}
                    side2={side2}
                    enabled={enabled}
                    isExpanded={isExpanded}
                    link={link}
                    onToggle={() =>
                      onTogglePairing(side1.id, side2.id, !enabled)
                    }
                    onSwitchChange={(checked) =>
                      onTogglePairing(side1.id, side2.id, checked === true)
                    }
                    onExpand={() =>
                      setExpandedPair(isExpanded ? null : pairKey)
                    }
                    onApplyThreshold={(value) => {
                      if (onSendPairThreshold(side1.id, side2.id, value)) {
                        toast.success(
                          t('configFeedback.pairThresholdSet', {
                            a: side1.label,
                            b: side2.label,
                            value,
                          }),
                        );
                      } else {
                        toast.error(
                          t('configFeedback.pairThresholdNotConnected'),
                        );
                      }
                    }}
                    onApplyGain={(value) => {
                      if (onSendPairGain(side1.id, side2.id, value)) {
                        toast.success(
                          t('configFeedback.pairGainSet', {
                            a: side1.label,
                            b: side2.label,
                            value,
                          }),
                        );
                      } else {
                        toast.error(t('configFeedback.pairGainNotConnected'));
                      }
                    }}
                  />
                );
              }),
            )}
          </div>
        ))}
    </section>
  );
}

type PairRowProps = {
  side1: UnitPlacement;
  side2: UnitPlacement;
  enabled: boolean;
  isExpanded: boolean;
  link?: SignalLinkState;
  onToggle: () => void;
  onSwitchChange: (checked: boolean) => void;
  onExpand: () => void;
  onApplyThreshold: (value: number) => void;
  onApplyGain: (value: number) => void;
};

function PairRow({
  side1,
  side2,
  enabled,
  isExpanded,
  link,
  onToggle,
  onSwitchChange,
  onExpand,
  onApplyThreshold,
  onApplyGain,
}: PairRowProps) {
  const { t } = useTranslation();
  const initialThreshold = link?.threshold ?? 0;
  const initialGain = link?.gain ?? 0;
  const [thresholdInput, setThresholdInput] = useState(
    String(initialThreshold),
  );
  const [gainInput, setGainInput] = useState(String(initialGain));

  useEffect(() => {
    if (!isExpanded) {
      setThresholdInput(String(initialThreshold));
      setGainInput(String(initialGain));
    }
  }, [isExpanded, initialThreshold, initialGain]);

  const thresholdNum = parseInputNumber(thresholdInput);
  const gainNum = parseInputNumber(gainInput);

  return (
    <div
      className={cn(
        'rounded-md transition-colors',
        enabled ? 'bg-primary/5' : 'hover:bg-muted/40',
      )}
    >
      <div
        role="switch"
        aria-checked={enabled}
        tabIndex={0}
        className="flex cursor-pointer items-center gap-3 px-2 py-1"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-slot="switch"]')) return;
          if ((e.target as HTMLElement).closest('[data-pair-expand]')) return;
          onToggle();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <Switch
          size="sm"
          checked={enabled}
          tabIndex={-1}
          onCheckedChange={onSwitchChange}
        />
        <span className="text-sm text-foreground/80">
          <span className="font-medium text-foreground">{side1.label}</span>
          <span className="mx-1.5 text-muted-foreground/50">&harr;</span>
          <span className="font-medium text-foreground">{side2.label}</span>
        </span>
        <button
          type="button"
          data-pair-expand
          className="ml-auto rounded px-2 py-0.5 text-xs font-medium tracking-wide text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          aria-expanded={isExpanded}
          aria-label={`${side1.label}-${side2.label} ${t('pairings.pairThreshold')}/${t('pairings.pairGain')}`}
        >
          {isExpanded ? '−' : '+'}
        </button>
      </div>
      {isExpanded && (
        <div className="grid gap-2 border-t border-border/30 px-3 py-2">
          <p className="font-mono text-xs text-muted-foreground/70">
            {link
              ? t('pairings.pairLast', {
                  threshold: link.threshold,
                  gain: link.gain,
                })
              : t('pairings.pairLastUnknown')}
          </p>
          <div className="flex items-center gap-2">
            <span className="w-20 font-display text-xs tracking-wide text-muted-foreground">
              {t('pairings.pairThreshold')}
            </span>
            <Input
              aria-label={`${side1.label}-${side2.label} ${t('pairings.pairThreshold')}`}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className="w-24 bg-background font-mono tabular-nums"
            />
            <Button
              size="sm"
              disabled={thresholdNum === null}
              onClick={() => {
                if (thresholdNum !== null) onApplyThreshold(thresholdNum);
              }}
              className="font-display tracking-wide"
            >
              {t('pairings.apply')}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 font-display text-xs tracking-wide text-muted-foreground">
              {t('pairings.pairGain')}
            </span>
            <Input
              aria-label={`${side1.label}-${side2.label} ${t('pairings.pairGain')}`}
              value={gainInput}
              onChange={(e) => setGainInput(e.target.value)}
              className="w-24 bg-background font-mono tabular-nums"
            />
            <Button
              size="sm"
              disabled={gainNum === null}
              onClick={() => {
                if (gainNum !== null) onApplyGain(gainNum);
              }}
              className="font-display tracking-wide"
            >
              {t('pairings.apply')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
