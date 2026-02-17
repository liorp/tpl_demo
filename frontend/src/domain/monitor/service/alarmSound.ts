let audioContext: AudioContext | null = null;

export function playAlarmSound(): void {
  const ContextCtor = window.AudioContext ?? window.webkitAudioContext;
  if (!ContextCtor) {
    return;
  }

  audioContext ??= new ContextCtor();

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.0001;
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  const now = audioContext.currentTime;
  gainNode.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  oscillator.start(now);
  oscillator.stop(now + 0.22);
}
