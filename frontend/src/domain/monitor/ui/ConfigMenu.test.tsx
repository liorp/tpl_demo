// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ConfigMenu } from './ConfigMenu';

afterEach(() => {
  cleanup();
});

describe('ConfigMenu', () => {
  test('opens settings modal and pre-populates known values', () => {
    render(
      <ConfigMenu
        config={{ threshold: 640, val: 777 }}
        alarmSoundEnabled
        onApply={vi.fn()}
        onAlarmSoundEnabledChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const threshold = screen.getByLabelText('Threshold') as HTMLInputElement;
    const val = screen.getByLabelText('Val') as HTMLInputElement;

    expect(threshold.value).toBe('640');
    expect(val.value).toBe('777');
  });

  test('falls back to default values and applies changes', () => {
    const onApply = vi.fn();

    render(
      <ConfigMenu
        config={{ threshold: null, val: null }}
        alarmSoundEnabled
        onApply={onApply}
        onAlarmSoundEnabledChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const threshold = screen.getByLabelText('Threshold') as HTMLInputElement;
    const val = screen.getByLabelText('Val') as HTMLInputElement;

    expect(threshold.value).toBe('500');
    expect(val.value).toBe('549');

    fireEvent.change(threshold, { target: { value: '600' } });
    fireEvent.change(val, { target: { value: '650' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledWith({ threshold: 600, val: 650 });
  });

  test('resets all from settings', () => {
    const onResetAll = vi.fn();

    render(
      <ConfigMenu
        config={{ threshold: null, val: null }}
        alarmSoundEnabled
        onApply={vi.fn()}
        onAlarmSoundEnabledChange={vi.fn()}
        onResetAll={onResetAll}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));

    expect(onResetAll).toHaveBeenCalledTimes(1);
  });

  test('toggles alarm sound setting', () => {
    const onAlarmSoundEnabledChange = vi.fn();

    render(
      <ConfigMenu
        config={{ threshold: null, val: null }}
        alarmSoundEnabled
        onApply={vi.fn()}
        onAlarmSoundEnabledChange={onAlarmSoundEnabledChange}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Alarm Sound' }));

    expect(onAlarmSoundEnabledChange).toHaveBeenCalledWith(false);
  });
});
