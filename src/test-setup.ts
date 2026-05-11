import "@testing-library/jest-dom";

// Mock ResizeObserver for jsdom (not available in test environment)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;
