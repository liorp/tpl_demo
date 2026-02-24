// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ConfigMenu } from './ConfigMenu';

afterEach(() => {
  cleanup();
});

describe('ConfigMenu', () => {
  test('opens settings modal and pre-populates gain from config', () => {
    render(
      <ConfigMenu
        config={{ gain: 64, noise_threshold: 550, detection_threshold: 750 }}
        alarmSoundEnabled
        offlineModeEnabled
        onSendThreshold={vi.fn().mockReturnValue(true)}
        onSendDetectionThreshold={vi.fn().mockReturnValue(true)}
        onSendGain={vi.fn().mockReturnValue(true)}
        onAlarmSoundEnabledChange={vi.fn()}
        onOfflineModeEnabledChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const threshold = screen.getByLabelText(
      'Noise Threshold',
    ) as HTMLInputElement;
    const detectionThreshold = screen.getByLabelText(
      'Detection Threshold',
    ) as HTMLInputElement;
    const gain = screen.getByLabelText('Gain') as HTMLInputElement;

    expect(threshold.value).toBe('550');
    expect(detectionThreshold.value).toBe('750');
    expect(gain.value).toBe('64');
  });

  test('falls back to default values and sends threshold', () => {
    const onSendThreshold = vi.fn().mockReturnValue(true);

    render(
      <ConfigMenu
        config={{ gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onSendThreshold={onSendThreshold}
        onSendDetectionThreshold={vi.fn().mockReturnValue(true)}
        onSendGain={vi.fn().mockReturnValue(true)}
        onAlarmSoundEnabledChange={vi.fn()}
        onOfflineModeEnabledChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const threshold = screen.getByLabelText(
      'Noise Threshold',
    ) as HTMLInputElement;
    const detectionThreshold = screen.getByLabelText(
      'Detection Threshold',
    ) as HTMLInputElement;
    const gain = screen.getByLabelText('Gain') as HTMLInputElement;

    expect(threshold.value).toBe('500');
    expect(detectionThreshold.value).toBe('700');
    expect(gain.value).toBe('64');

    fireEvent.change(threshold, { target: { value: '600' } });
    const sendButtons = screen.getAllByRole('button', { name: 'Send' });
    fireEvent.click(sendButtons[0]);

    expect(onSendThreshold).toHaveBeenCalledWith(600);
  });

  test('sends gain with separate button', () => {
    const onSendGain = vi.fn().mockReturnValue(true);

    render(
      <ConfigMenu
        config={{ gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onSendThreshold={vi.fn().mockReturnValue(true)}
        onSendDetectionThreshold={vi.fn().mockReturnValue(true)}
        onSendGain={onSendGain}
        onAlarmSoundEnabledChange={vi.fn()}
        onOfflineModeEnabledChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    fireEvent.change(screen.getByLabelText('Gain'), {
      target: { value: '32' },
    });
    const sendButtons = screen.getAllByRole('button', { name: 'Send' });
    fireEvent.click(sendButtons[2]);

    expect(onSendGain).toHaveBeenCalledWith(32);
  });

  test('sends detection threshold with separate button', () => {
    const onSendDetectionThreshold = vi.fn().mockReturnValue(true);

    render(
      <ConfigMenu
        config={{ gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onSendThreshold={vi.fn().mockReturnValue(true)}
        onSendDetectionThreshold={onSendDetectionThreshold}
        onSendGain={vi.fn().mockReturnValue(true)}
        onAlarmSoundEnabledChange={vi.fn()}
        onOfflineModeEnabledChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Detection Threshold'), {
      target: { value: '800' },
    });
    const sendButtons = screen.getAllByRole('button', { name: 'Send' });
    fireEvent.click(sendButtons[1]);

    expect(onSendDetectionThreshold).toHaveBeenCalledWith(800);
  });

  test('disables send for non-decimal numeric syntax', () => {
    render(
      <ConfigMenu
        config={{ gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onSendThreshold={vi.fn().mockReturnValue(true)}
        onSendDetectionThreshold={vi.fn().mockReturnValue(true)}
        onSendGain={vi.fn().mockReturnValue(true)}
        onAlarmSoundEnabledChange={vi.fn()}
        onOfflineModeEnabledChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Noise Threshold'), {
      target: { value: '0x10' },
    });

    const sendButtons = screen.getAllByRole('button', { name: 'Send' });
    expect(sendButtons[0]?.hasAttribute('disabled')).toBe(true);
  });

  test('disables detection send when detection threshold is below noise threshold', () => {
    render(
      <ConfigMenu
        config={{ gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onSendThreshold={vi.fn().mockReturnValue(true)}
        onSendDetectionThreshold={vi.fn().mockReturnValue(true)}
        onSendGain={vi.fn().mockReturnValue(true)}
        onAlarmSoundEnabledChange={vi.fn()}
        onOfflineModeEnabledChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Noise Threshold'), {
      target: { value: '500' },
    });
    fireEvent.change(screen.getByLabelText('Detection Threshold'), {
      target: { value: '499' },
    });

    const sendButtons = screen.getAllByRole('button', { name: 'Send' });
    expect(sendButtons[1]?.hasAttribute('disabled')).toBe(true);
  });

  test('resets all from settings', () => {
    const onResetAll = vi.fn();

    render(
      <ConfigMenu
        config={{ gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onSendThreshold={vi.fn().mockReturnValue(true)}
        onSendDetectionThreshold={vi.fn().mockReturnValue(true)}
        onSendGain={vi.fn().mockReturnValue(true)}
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
        config={{ gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onSendThreshold={vi.fn().mockReturnValue(true)}
        onSendDetectionThreshold={vi.fn().mockReturnValue(true)}
        onSendGain={vi.fn().mockReturnValue(true)}
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
        config={{ gain: null }}
        alarmSoundEnabled
        offlineModeEnabled
        onSendThreshold={vi.fn().mockReturnValue(true)}
        onSendDetectionThreshold={vi.fn().mockReturnValue(true)}
        onSendGain={vi.fn().mockReturnValue(true)}
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
