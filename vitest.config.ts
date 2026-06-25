import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest configuration: jsdom environment for React component/DOM tests,
// globals enabled so describe/it/expect are available without imports,
// and a shared setup file that wires in @testing-library/jest-dom matchers.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
