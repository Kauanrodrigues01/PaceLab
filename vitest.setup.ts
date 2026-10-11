import '@testing-library/jest-dom/vitest'

class MockResizeObserver {
  observe = () => {}
  unobserve = () => {}
  disconnect = () => {}
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
