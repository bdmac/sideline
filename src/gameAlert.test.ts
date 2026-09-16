import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("substitution alert playback", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it.each(["running", "suspended"])(
    "plays the two-note chime and vibration with a %s audio context",
    async (state) => {
      const vibrate = vi.fn();
      vi.stubGlobal("navigator", { vibrate });
      const context = {
        state,
        currentTime: 2,
        destination: {},
        resume: vi.fn().mockResolvedValue(undefined),
        createOscillator: vi.fn(() => ({
          type: "",
          frequency: { value: 0 },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
        createGain: vi.fn(() => ({
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        })),
      };
      vi.stubGlobal(
        "AudioContext",
        vi.fn(function () {
          return context;
        }),
      );
      const { playSubstitutionAlert } = await import("./gameAlert");
      await playSubstitutionAlert();
      expect(vibrate).toHaveBeenCalledExactlyOnceWith([160, 80, 160]);
      expect(context.resume).toHaveBeenCalledTimes(
        state === "suspended" ? 1 : 0,
      );
      expect(context.createOscillator).toHaveBeenCalledTimes(2);
      expect(context.createGain).toHaveBeenCalledTimes(2);
      [659.25, 880].forEach((frequency, index) => {
        const oscillator = context.createOscillator.mock.results[index].value;
        const gain = context.createGain.mock.results[index].value;
        const start = 2 + index * 0.16;
        expect(oscillator.type).toBe("sine");
        expect(oscillator.frequency.value).toBe(frequency);
        expect(oscillator.connect).toHaveBeenCalledWith(gain);
        expect(gain.connect).toHaveBeenCalledWith(context.destination);
        expect(oscillator.start).toHaveBeenCalledWith(start);
        expect(oscillator.stop).toHaveBeenCalledWith(start + 0.15);
        expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
          0.16,
          start + 0.025,
        );
      });
    },
  );

  it("still vibrates when audio is unavailable", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const { playSubstitutionAlert } = await import("./gameAlert");
    await playSubstitutionAlert();
    expect(vibrate).toHaveBeenCalledExactlyOnceWith([160, 80, 160]);
  });
});
