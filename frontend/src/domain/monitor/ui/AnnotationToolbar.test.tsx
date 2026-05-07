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

  test('shows the four tool buttons', () => {
    render(<AnnotationToolbar onClearAll={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Text' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eraser' })).toBeTruthy();
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
