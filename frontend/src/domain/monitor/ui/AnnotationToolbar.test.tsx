// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import '@/i18n/config';
import { resetAnnotationTool } from '../service/annotationTool';
import { AnnotationToolbar } from './AnnotationToolbar';

describe('AnnotationToolbar', () => {
  beforeEach(() => {
    resetAnnotationTool();
  });
  afterEach(() => {
    cleanup();
    resetAnnotationTool();
  });

  test('shows only drawing tool buttons', () => {
    render(<AnnotationToolbar onClearAll={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Text' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eraser' })).toBeTruthy();
  });

  test('positions toolbar across the top of the map', () => {
    render(<AnnotationToolbar onClearAll={vi.fn()} />);
    const toolbar = screen.getByRole('toolbar', { name: 'Annotations' });
    const overlay = toolbar.parentElement;

    expect(overlay?.className).toContain('inset-x-4');
    expect(overlay?.className).toContain('top-4');
    expect(overlay?.className).not.toContain('end-4');
    expect(toolbar.className).toContain('flex-row');
  });

  test('clicking a tool button activates it (data-active=true)', () => {
    render(<AnnotationToolbar onClearAll={vi.fn()} />);
    const penButton = screen.getByRole('button', { name: 'Pen' });
    expect(penButton.getAttribute('data-active')).toBe('false');
    fireEvent.click(penButton);
    expect(penButton.getAttribute('data-active')).toBe('true');
  });

  test('switching tool deactivates the prior one', () => {
    render(<AnnotationToolbar onClearAll={vi.fn()} />);
    const penButton = screen.getByRole('button', { name: 'Pen' });
    const eraserButton = screen.getByRole('button', { name: 'Eraser' });
    fireEvent.click(penButton);
    expect(penButton.getAttribute('data-active')).toBe('true');
    fireEvent.click(eraserButton);
    expect(penButton.getAttribute('data-active')).toBe('false');
    expect(eraserButton.getAttribute('data-active')).toBe('true');
  });

  test('clicking the active drawing tool detoggles with no tool selected', () => {
    render(<AnnotationToolbar onClearAll={vi.fn()} />);
    const penButton = screen.getByRole('button', { name: 'Pen' });
    const textButton = screen.getByRole('button', { name: 'Text' });
    const eraserButton = screen.getByRole('button', { name: 'Eraser' });

    fireEvent.click(penButton);
    expect(penButton.getAttribute('data-active')).toBe('true');

    fireEvent.click(penButton);
    expect(penButton.getAttribute('data-active')).toBe('false');
    expect(textButton.getAttribute('data-active')).toBe('false');
    expect(eraserButton.getAttribute('data-active')).toBe('false');
  });

  test('renders undo and redo controls with disabled state', () => {
    render(
      <AnnotationToolbar
        onClearAll={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        canUndo={true}
        canRedo={false}
      />,
    );

    const undoButton = screen.getByRole('button', {
      name: 'Undo',
    }) as HTMLButtonElement;
    const redoButton = screen.getByRole('button', {
      name: 'Redo',
    }) as HTMLButtonElement;

    expect(undoButton.disabled).toBe(false);
    expect(redoButton.disabled).toBe(true);
  });

  test('clear-all only fires if confirmation is accepted', () => {
    const onClearAll = vi.fn();
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    render(<AnnotationToolbar onClearAll={onClearAll} />);
    const clearButton = screen.getByRole('button', { name: 'Clear all' });

    fireEvent.click(clearButton);
    expect(onClearAll).not.toHaveBeenCalled();

    fireEvent.click(clearButton);
    expect(onClearAll).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });
});
