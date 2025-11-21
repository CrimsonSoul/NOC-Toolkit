import { vi } from 'vitest'

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(cb) {
    this.cb = cb
  }
  observe() {
    // Simulate a resize event
    this.cb([{ contentRect: { width: 800, height: 600 } }])
  }
  unobserve() {}
  disconnect() {}
}

// Mock window.scrollTo
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
  Element.prototype.getBoundingClientRect = () => ({
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: 800,
  })
}
