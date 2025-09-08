import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import useDebounce from './useDebounce'

describe('useDebounce', () => {
  it('delays updating the value', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' }
    })

    expect(result.current).toBe('a')

    rerender({ value: 'abc' })
    // Still old value before debounce time
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe('abc')
    vi.useRealTimers()
  })
})
