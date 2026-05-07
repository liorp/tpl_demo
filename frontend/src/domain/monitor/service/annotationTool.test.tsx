// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';

import {
  type AnnotationTool,
  resetAnnotationTool,
  setAnnotationColor,
  setAnnotationTool,
  useAnnotationTool,
} from './annotationTool';

let captured: ReturnType<typeof useAnnotationTool> | null = null;

function Probe() {
  captured = useAnnotationTool();
  return null;
}

beforeEach(() => {
  resetAnnotationTool();
  captured = null;
});

describe('useAnnotationTool', () => {
  test('starts in none tool with a default color', () => {
    render(<Probe />);
    expect(captured?.tool).toBe<AnnotationTool>('none');
    expect(typeof captured?.color).toBe('string');
    expect((captured?.color ?? '').length).toBeGreaterThan(0);
  });

  test('setAnnotationTool updates the tool for subscribers', () => {
    render(<Probe />);
    act(() => {
      setAnnotationTool('pen');
    });
    expect(captured?.tool).toBe('pen');
  });

  test('setAnnotationColor updates the color for subscribers', () => {
    render(<Probe />);
    act(() => {
      setAnnotationColor('#00ff00');
    });
    expect(captured?.color).toBe('#00ff00');
  });

  test('resetAnnotationTool restores defaults', () => {
    render(<Probe />);
    act(() => {
      setAnnotationTool('eraser');
      setAnnotationColor('#0000ff');
    });
    expect(captured?.tool).toBe('eraser');
    act(() => {
      resetAnnotationTool();
    });
    expect(captured?.tool).toBe('none');
  });
});
