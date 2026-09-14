export type DevicePreferences = {
  keepScreenAwake: boolean;
  substitutionAlerts: boolean;
};

export const DEVICE_PREFERENCES_STORAGE_KEY = "sideline-device-preferences";

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  keepScreenAwake: false,
  substitutionAlerts: false,
};

export const loadDevicePreferences = (): DevicePreferences => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY) ?? "{}",
    ) as Partial<DevicePreferences>;
    return {
      keepScreenAwake:
        typeof saved.keepScreenAwake === "boolean"
          ? saved.keepScreenAwake
          : DEFAULT_DEVICE_PREFERENCES.keepScreenAwake,
      substitutionAlerts:
        typeof saved.substitutionAlerts === "boolean"
          ? saved.substitutionAlerts
          : DEFAULT_DEVICE_PREFERENCES.substitutionAlerts,
    };
  } catch (error) {
    console.error("Sideline could not load device preferences.", error);
    return { ...DEFAULT_DEVICE_PREFERENCES };
  }
};

export const saveDevicePreferences = (preferences: DevicePreferences) => {
  try {
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch (error) {
    console.error("Sideline could not save device preferences.", error);
  }
};
