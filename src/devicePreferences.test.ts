import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DEVICE_PREFERENCES,
  DEVICE_PREFERENCES_STORAGE_KEY,
  loadDevicePreferences,
  saveDevicePreferences,
} from "./devicePreferences";

describe("device preferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads defaults and persists supported values", () => {
    expect(loadDevicePreferences()).toEqual(DEFAULT_DEVICE_PREFERENCES);

    saveDevicePreferences({
      keepScreenAwake: true,
      substitutionAlerts: true,
      demoClock: true,
    });

    expect(loadDevicePreferences()).toEqual({
      keepScreenAwake: true,
      substitutionAlerts: true,
      demoClock: true,
    });
  });

  it("ignores invalid saved values and recovers from malformed data", () => {
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        keepScreenAwake: "yes",
        substitutionAlerts: true,
      }),
    );
    expect(loadDevicePreferences()).toEqual({
      keepScreenAwake: false,
      substitutionAlerts: true,
      demoClock: false,
    });

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    localStorage.setItem(DEVICE_PREFERENCES_STORAGE_KEY, "{");
    expect(loadDevicePreferences()).toEqual(DEFAULT_DEVICE_PREFERENCES);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([true, false, "yes"])(
    "discards retired manual mode %s while preserving supported preferences",
    (manualPlanning) => {
      const saved = {
        keepScreenAwake: true,
        substitutionAlerts: true,
        demoClock: true,
      };
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ ...saved, manualPlanning }),
      );
      expect(loadDevicePreferences()).toEqual(saved);
      saveDevicePreferences(loadDevicePreferences());
      expect(
        JSON.parse(localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY)!),
      ).toEqual(saved);
    },
  );
});
