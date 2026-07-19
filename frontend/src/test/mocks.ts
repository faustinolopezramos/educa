import { vi } from "vitest";
import type { AxiosInstance, AxiosRequestConfig } from "axios";

export const createMockApi = (): AxiosInstance => {
  const mock = vi.fn();
  mock.get = vi.fn();
  mock.post = vi.fn();
  mock.put = vi.fn();
  mock.patch = vi.fn();
  mock.delete = vi.fn();
  mock.interceptors = {
    request: { use: vi.fn(), eject: vi.fn() },
    response: { use: vi.fn(), eject: vi.fn() },
  };
  return mock as unknown as AxiosInstance;
};

export const mockLocalStorage = () => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
};

export const mockQueryClient = () => ({
  prefetchQuery: vi.fn().mockResolvedValue(null),
  invalidateQueries: vi.fn().mockResolvedValue(null),
  setQueryData: vi.fn(),
  getQueryData: vi.fn(),
  resetQueries: vi.fn().mockResolvedValue(null),
});
