// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { i18n } from '@/i18n/config';
import type { MonitorConfig } from '../model/types';
import { ConfigMenu } from './ConfigMenu';

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

function renderConfigMenu(
  overrides: Partial<{
    config: MonitorConfig;
    onSendDetectionThreshold: ReturnType<typeof vi.fn>;
    onSendDetectionMode: ReturnType<typeof vi.fn>;
    onSendRequestDetectionMode: ReturnType<typeof vi.fn>;
    onRefreshMap: ReturnType<typeof vi.fn>;
    onSendReset: ReturnType<typeof vi.fn>;
    onAlarmSoundEnabledChange: ReturnType<typeof vi.fn>;
    onOfflineModeEnabledChange: ReturnType<typeof vi.fn>;
    onResetAll: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const props = {
    config: overrides.config ?? {
      gain: null,
      noise_threshold: null,
      detection_threshold: null,
      detection_mode: null,
    },
    sensorStatus: {},
    alarmSoundEnabled: true,
    offlineModeEnabled: true,
    onSendDetectionThreshold:
      overrides.onSendDetectionThreshold ?? vi.fn().mockReturnValue(true),
    onSendDetectionMode:
      overrides.onSendDetectionMode ?? vi.fn().mockReturnValue(true),
    onSendRequestDetectionMode:
      overrides.onSendRequestDetectionMode ?? vi.fn().mockReturnValue(true),
    onRefreshMap: overrides.onRefreshMap ?? vi.fn(),
    onSendReset: overrides.onSendReset ?? vi.fn().mockReturnValue(true),
    onAlarmSoundEnabledChange: overrides.onAlarmSoundEnabledChange ?? vi.fn(),
    onOfflineModeEnabledChange: overrides.onOfflineModeEnabledChange ?? vi.fn(),
    onResetAll: overrides.onResetAll ?? vi.fn(),
  };
  return { props, ...render(<ConfigMenu {...props} />) };
}

describe('ConfigMenu', () => {
  test('opens settings modal and pre-populates detection threshold from config', () => {
    renderConfigMenu({
      config: {
        gain: 64,
        noise_threshold: 550,
        detection_threshold: 750,
        detection_mode: 1,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Settings|הגדרות/ }));

    const detectionThreshold = screen.getByLabelText(
      'Detection Threshold',
    ) as HTMLInputElement;

    expect(detectionThreshold.value).toBe('750');
  });

  test('sends detection threshold via Send button', () => {
    const onSendDetectionThreshold = vi.fn().mockReturnValue(true);
    renderConfigMenu({ onSendDetectionThreshold });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Detection Threshold'), {
      target: { value: '800' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSendDetectionThreshold).toHaveBeenCalledWith(800);
  });

  test('disables Send when detection threshold is non-numeric', () => {
    renderConfigMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Detection Threshold'), {
      target: { value: '0x10' },
    });

    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton.hasAttribute('disabled')).toBe(true);
  });

  test('selecting Mode 2 calls onSendDetectionMode', () => {
    const onSendDetectionMode = vi.fn().mockReturnValue(true);
    renderConfigMenu({ onSendDetectionMode });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const modeSelect = screen.getByRole('combobox', { name: 'Detection Mode' });

    fireEvent.keyDown(modeSelect, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Mode 2' }));

    expect(onSendDetectionMode).toHaveBeenCalledWith(2);
  });

  test('refresh detection mode triggers onSendRequestDetectionMode', () => {
    const onSendRequestDetectionMode = vi.fn().mockReturnValue(true);
    renderConfigMenu({ onSendRequestDetectionMode });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(onSendRequestDetectionMode).toHaveBeenCalledTimes(1);
  });

  test('mesh refresh map button calls onRefreshMap', () => {
    const onRefreshMap = vi.fn();
    renderConfigMenu({ onRefreshMap });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh mesh map' }));

    expect(onRefreshMap).toHaveBeenCalledTimes(1);
  });

  test('reset device confirms before sending', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSendReset = vi.fn().mockReturnValue(true);
    renderConfigMenu({ onSendReset });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset device' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onSendReset).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  test('reset device aborts when user cancels confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onSendReset = vi.fn();
    renderConfigMenu({ onSendReset });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset device' }));

    expect(onSendReset).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  test('Reset all from settings invokes onResetAll', () => {
    const onResetAll = vi.fn();
    renderConfigMenu({ onResetAll });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));

    expect(onResetAll).toHaveBeenCalledTimes(1);
  });

  test('toggles alarm sound setting', () => {
    const onAlarmSoundEnabledChange = vi.fn();
    renderConfigMenu({ onAlarmSoundEnabledChange });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Alarm Sound' }));

    expect(onAlarmSoundEnabledChange).toHaveBeenCalledWith(false);
  });

  test('toggles offline mode setting', () => {
    const onOfflineModeEnabledChange = vi.fn();
    renderConfigMenu({ onOfflineModeEnabledChange });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Offline Mode' }));

    expect(onOfflineModeEnabledChange).toHaveBeenCalledWith(false);
  });

  test('allows selecting language from settings', () => {
    renderConfigMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const languageSelect = screen.getByRole('combobox', { name: 'Language' });

    fireEvent.keyDown(languageSelect, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Hebrew' }));

    expect(screen.getByRole('heading', { name: 'הגדרות' })).not.toBeNull();
  });
});
