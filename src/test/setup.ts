import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const createStorageMock = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  configurable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: sessionStorageMock,
  configurable: true,
});
Object.defineProperty(window, "sessionStorage", {
  value: sessionStorageMock,
  configurable: true,
});
Object.defineProperty(window, "scrollTo", {
  value: vi.fn(),
  configurable: true,
});
Object.defineProperty(window, "matchMedia", {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  configurable: true,
});
Object.defineProperty(globalThis, "ResizeObserver", {
  value: class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  configurable: true,
});

Object.defineProperties(HTMLElement.prototype, {
  popover: {
    get() {
      return this.getAttribute("popover");
    },
    set(value: string | null) {
      if (value === null) {
        this.removeAttribute("popover");
      } else {
        this.setAttribute("popover", value);
      }
    },
    configurable: true,
  },
  showPopover: {
    value: vi.fn(),
    configurable: true,
  },
  hidePopover: {
    value: vi.fn(),
    configurable: true,
  },
  togglePopover: {
    value: vi.fn(),
    configurable: true,
  },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
