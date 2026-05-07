import { useSyncExternalStore } from 'react';

export type AnnotationTool = 'none' | 'pen' | 'text' | 'eraser';

export const ANNOTATION_COLORS = [
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#3b82f6',
  '#ffffff',
] as const;

type AnnotationToolState = {
  tool: AnnotationTool;
  color: string;
};

const DEFAULTS: AnnotationToolState = {
  tool: 'none',
  color: ANNOTATION_COLORS[0],
};

let state: AnnotationToolState = { ...DEFAULTS };
const subscribers = new Set<() => void>();

function emit() {
  for (const fn of subscribers) {
    fn();
  }
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function setAnnotationTool(tool: AnnotationTool): void {
  if (state.tool === tool) {
    return;
  }
  state = { ...state, tool };
  emit();
}

export function setAnnotationColor(color: string): void {
  if (state.color === color) {
    return;
  }
  state = { ...state, color };
  emit();
}

export function resetAnnotationTool(): void {
  state = { ...DEFAULTS };
  emit();
}

export function useAnnotationTool(): AnnotationToolState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
