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
window.scrollTo = vi.fn()
