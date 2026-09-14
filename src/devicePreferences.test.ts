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
    });

    expect(loadDevicePreferences()).toEqual({
      keepScreenAwake: true,
      substitutionAlerts: true,
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
    });

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    localStorage.setItem(DEVICE_PREFERENCES_STORAGE_KEY, "{");
    expect(loadDevicePreferences()).toEqual(DEFAULT_DEVICE_PREFERENCES);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
