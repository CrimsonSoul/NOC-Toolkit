import { vi } from 'vitest'

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(cb) {
    this.cb = cb
  }
  observe() {
    // Simulate a resize event immediately
    this.cb([{ contentRect: { width: 800, height: 600 } }])
  }
  unobserve() {}
  disconnect() {}
}

// Safe check for DOM environment
if (typeof window !== 'undefined' && typeof Element !== 'undefined') {
  window.scrollTo = vi.fn()

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
