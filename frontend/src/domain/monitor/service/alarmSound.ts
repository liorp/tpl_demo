let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let sweepInterval: ReturnType<typeof setInterval> | null = null;

export function startAlarmSound(): void {
  if (oscillator) {
    return;
  }

  const ContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!ContextCtor) {
    return;
  }

  audioContext ??= new ContextCtor();

  oscillator = audioContext.createOscillator();
  gainNode = audioContext.createGain();
  oscillator.type = 'square';
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.35;
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();

  let high = true;
  sweepInterval = setInterval(() => {
    if (!oscillator) {
      return;
    }
    oscillator.frequency.value = high ? 660 : 880;
    high = !high;
  }, 500);
}

export function stopAlarmSound(): void {
  if (sweepInterval !== null) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
  if (oscillator) {
    oscillator.stop();
    oscillator.disconnect();
    oscillator = null;
  }
  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }
}
