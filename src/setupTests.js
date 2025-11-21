import { vi } from 'vitest'

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(cb) {
    this.cb = cb
  }
  observe() {
    // Simulate a resize event immediately to ensure react-window has dimensions
    this.cb([{ contentRect: { width: 800, height: 600 } }])
  }
  unobserve() {}
  disconnect() {}
}

// Only mock DOM APIs if we are in a browser-like environment
// Use globalThis to safely check for window without ReferenceError
const isBrowser = typeof globalThis.window !== 'undefined' && typeof globalThis.window.document !== 'undefined'

if (isBrowser) {
  if (!window.scrollTo) {
    window.scrollTo = vi.fn()
  }

  if (typeof Element !== 'undefined') {
    // Mock getBoundingClientRect to ensure react-window has dimensions
    Element.prototype.getBoundingClientRect = () => ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      x: 0,
      y: 0
    })
  }
}
