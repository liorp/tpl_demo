import { Redo2, Undo2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/component/ui/button';
import {
  ANNOTATION_COLORS,
  type AnnotationTool,
  setAnnotationColor,
  setAnnotationTool,
  useAnnotationTool,
} from '../service/annotationTool';

type Props = {
  onClearAll: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
};

const TOOL_ORDER: AnnotationTool[] = ['pen', 'text', 'eraser'];

const TOOL_ICONS: Record<AnnotationTool, ReactElement> = {
  none: (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 3 7 19 2-8 8-2Z" />
    </svg>
  ),
  pen: (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  ),
  text: (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  ),
  eraser: (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m20 20-8-8" />
      <path d="M14.5 4.5 4.5 14.5a2.121 2.121 0 0 0 0 3l3 3a2.121 2.121 0 0 0 3 0L20 11" />
      <path d="m22 22-5-5" />
    </svg>
  ),
};

export function AnnotationToolbar({
  onClearAll,
  onUndo = () => {},
  onRedo = () => {},
  canUndo = false,
  canRedo = false,
}: Props) {
  const { t } = useTranslation();
  const { tool, color } = useAnnotationTool();

  const handleClearAll = () => {
    if (window.confirm(t('annotations.confirmClear'))) {
      onClearAll();
    }
  };

  const handleToolClick = (candidate: AnnotationTool) => {
    setAnnotationTool(
      tool === candidate && candidate !== 'none' ? 'none' : candidate,
    );
  };

  return (
    <div className="pointer-events-none absolute inset-x-4 top-4 z-[1200] flex justify-center">
      <div
        className="pointer-events-auto flex max-w-full flex-row flex-wrap items-center justify-center gap-2 rounded-md border border-border-bright bg-card/90 p-2 backdrop-blur-sm"
        role="toolbar"
        aria-label={t('annotations.title')}
      >
        <div className="flex flex-row flex-wrap justify-center gap-1">
          {TOOL_ORDER.map((candidate) => {
            const labelKey =
              candidate === 'none'
                ? 'annotations.toolNone'
                : candidate === 'pen'
                  ? 'annotations.toolPen'
                  : candidate === 'text'
                    ? 'annotations.toolText'
                    : 'annotations.toolEraser';
            const isActive = tool === candidate;
            return (
              <Button
                key={candidate}
                type="button"
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                data-active={isActive}
                aria-pressed={isActive}
                onClick={() => handleToolClick(candidate)}
                className="justify-start gap-2 font-display text-xs tracking-wide"
              >
                {TOOL_ICONS[candidate]}
                {t(labelKey)}
              </Button>
            );
          })}
        </div>
        <div className="flex flex-row gap-1 border-l border-border ps-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t('annotations.undo')}
            disabled={!canUndo}
            onClick={onUndo}
            className="h-8 w-8 px-0"
          >
            <Undo2 aria-hidden="true" size={14} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t('annotations.redo')}
            disabled={!canRedo}
            onClick={onRedo}
            className="h-8 w-8 px-0"
          >
            <Redo2 aria-hidden="true" size={14} />
          </Button>
        </div>
        <fieldset className="flex flex-wrap justify-center gap-1 border-0 border-t border-border pt-2 sm:border-l sm:border-t-0 sm:pt-0 sm:ps-2">
          <legend className="sr-only">{t('annotations.color')}</legend>
          {ANNOTATION_COLORS.map((swatch) => {
            const isActive = color === swatch;
            return (
              <button
                key={swatch}
                type="button"
                aria-label={t('annotations.ariaColorSwatch', { color: swatch })}
                aria-pressed={isActive}
                onClick={() => setAnnotationColor(swatch)}
                className="h-6 w-6 rounded-full border border-border-bright outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:ring-2 data-[active=true]:ring-primary"
                data-active={isActive}
                style={{ backgroundColor: swatch }}
              />
            );
          })}
        </fieldset>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleClearAll}
          className="font-display text-xs tracking-wide"
        >
          {t('annotations.clearAll')}
        </Button>
      </div>
    </div>
  );
}
