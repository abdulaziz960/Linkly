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

// Linkly's own three-note "ding-ding-ding" chime for new inbound messages,
// played once per batch of new messages - a rising A5-D6-G6 arpeggio,
// synthesized so we don't need to ship/license an audio asset.
export function playNewMessageChime() {
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    playTone(context, 880.0, now, 0.14, 0.15);
    playTone(context, 1174.66, now + 0.07, 0.16, 0.15);
    playTone(context, 1568.0, now + 0.16, 0.3, 0.13);
  } catch {
    // Ignore - notification sound is a nice-to-have, never worth surfacing an error for.
  }
}
