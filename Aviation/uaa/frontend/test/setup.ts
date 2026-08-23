import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Real Next.js's useRouter() returns a referentially stable object across
// renders — this mock must too, or any effect with `router` in its
// dependency array re-fires on every re-render (e.g. after a click handler's
// setState), re-fetching and clobbering whatever that state update just set.
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));
