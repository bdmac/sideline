export type ColorMode = "light" | "dark";

export const THEME_STORAGE_KEY = "sideline-color-mode";

export const loadColorMode = (): ColorMode => {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark"
      ? "dark"
      : "light";
  } catch (error) {
    console.error("Sideline could not load the saved color mode.", error);
    return "light";
  }
};

export const saveColorMode = (colorMode: ColorMode) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, colorMode);
  } catch (error) {
    console.error("Sideline could not save the color mode.", error);
  }
};
