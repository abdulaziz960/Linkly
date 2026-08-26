let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedContext) sharedContext = new AudioContextClass();
  return sharedContext;
}

function playTone(context: AudioContext, frequency: number, startTime: number, duration: number, peakGain: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

// A short two-note "ping" chime for new inbound messages, played once per
// batch of new messages - synthesized so we don't need to ship/license an
// audio asset.
export function playNewMessageChime() {
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    playTone(context, 1046.5, now, 0.18, 0.16);
    playTone(context, 1318.5, now + 0.09, 0.22, 0.14);
  } catch {
    // Ignore - notification sound is a nice-to-have, never worth surfacing an error for.
  }
}
