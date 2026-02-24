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
        config={{ threshold: 640, gain: 64 }}
        alarmSoundEnabled
        offlineModeEnabled
        onApply={vi.fn()}
        onAlarmSoundEnabledChange={vi.fn()}
        onOfflineModeEnabledChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const threshold = screen.getByLabelText('Threshold') as HTMLInputElement;
    const gain = screen.getByLabelText('Gain') as HTMLInputElement;

    expect(threshold.value).toBe('640');
    expect(gain.value).toBe('64');
  });

  test('falls back to default values and applies changes', () => {
    const onApply = vi.fn();

    render(
      <ConfigMenu
        config={{ threshold: null, gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onApply={onApply}
        onAlarmSoundEnabledChange={vi.fn()}
        onOfflineModeEnabledChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const threshold = screen.getByLabelText('Threshold') as HTMLInputElement;
    const gain = screen.getByLabelText('Gain') as HTMLInputElement;

    expect(threshold.value).toBe('500');
    expect(gain.value).toBe('64');

    fireEvent.change(threshold, { target: { value: '600' } });
    fireEvent.change(gain, { target: { value: '32' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledWith({ threshold: 600, gain: 32 });
  });

  test('resets all from settings', () => {
    const onResetAll = vi.fn();

    render(
      <ConfigMenu
        config={{ threshold: null, gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onApply={vi.fn()}
        onAlarmSoundEnabledChange={vi.fn()}
        onOfflineModeEnabledChange={vi.fn()}
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
        config={{ threshold: null, gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onApply={vi.fn()}
        onAlarmSoundEnabledChange={onAlarmSoundEnabledChange}
        onOfflineModeEnabledChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Alarm Sound' }));

    expect(onAlarmSoundEnabledChange).toHaveBeenCalledWith(false);
  });

  test('toggles offline mode setting', () => {
    const onOfflineModeEnabledChange = vi.fn();

    render(
      <ConfigMenu
        config={{ threshold: null, gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onApply={vi.fn()}
        onAlarmSoundEnabledChange={vi.fn()}
        onOfflineModeEnabledChange={onOfflineModeEnabledChange}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Offline Mode' }));

    expect(onOfflineModeEnabledChange).toHaveBeenCalledWith(false);
  });
});
