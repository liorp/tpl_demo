import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/component/ui/button';

import type { AlarmState } from '../model/types';

type Props = {
  alarm: AlarmState;
  serverOnline: boolean;
};

export const StatusStrip = React.memo(function StatusStrip({
  alarm: _alarm,
  serverOnline: _serverOnline,
}: Props) {
  const { t } = useTranslation();
  const handleToggleFullscreen = React.useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    void document.documentElement.requestFullscreen?.();
  }, []);

  return (
    <section className="flex h-16 items-center gap-4 border-b border-white/5 bg-card px-6">
      <div className="me-auto flex items-center gap-3">
        <h1 className="font-display text-xl font-bold tracking-[0.12em] text-white/95 sm:text-2xl">
          {t('statusStrip.productName')}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleToggleFullscreen}
          aria-label={t('statusStrip.fullscreen')}
          title={t('statusStrip.fullscreen')}
          className="h-7 w-7 border-white/20 bg-black/10 p-0 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5"
          >
            <path d="M5 9V5h4" />
            <path d="M15 5h4v4" />
            <path d="M19 15v4h-4" />
            <path d="M9 19H5v-4" />
          </svg>
        </Button>
      </div>
    </section>
  );
});
