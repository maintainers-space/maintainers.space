import { vi } from 'vitest'

const values = new Map<string, string>()

const localStorage = {
  get length() {
    return values.size
  },
  clear: vi.fn(() => values.clear()),
  getItem: vi.fn((key: string) => values.get(key) ?? null),
  key: vi.fn((index: number) => [...values.keys()][index] ?? null),
  removeItem: vi.fn((key: string) => values.delete(key)),
  setItem: vi.fn((key: string, value: string) => values.set(key, String(value)))
}

vi.stubGlobal('localStorage', localStorage)
