type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (audioContext) return audioContext;
  const Context =
    window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
  if (!Context) return null;
  audioContext = new Context();
  return audioContext;
};

export const supportsSubstitutionAlert = () =>
  Boolean(
    window.AudioContext ||
    (window as AudioContextWindow).webkitAudioContext ||
    navigator.vibrate,
  );

export const prepareSubstitutionAlert = async () => {
  try {
    const context = getAudioContext();
    if (context?.state === "suspended") await context.resume();
  } catch (error) {
    console.error("Sideline could not prepare the substitution chime.", error);
  }
};

export const playSubstitutionAlert = async () => {
  if (navigator.vibrate) navigator.vibrate([160, 80, 160]);

  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") await context.resume();

    const startAt = context.currentTime;
    [659.25, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = startAt + index * 0.16;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.16, noteStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.14);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.15);
    });
  } catch (error) {
    console.error("Sideline could not play the substitution chime.", error);
  }
};
