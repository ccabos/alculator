import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run all test files under tests/
    include: ['tests/**/*.test.js'],

    // Tests must not touch the DOM, localStorage, or any browser API.
    // 'node' environment enforces this — any accidental DOM import will throw.
    environment: 'node',

    coverage: {
      provider: 'v8',
      // Only measure coverage of the model and io layers.
      // store/ and ui/ are not unit-tested (they require a browser environment).
      include: ['model/**/*.js', 'io/**/*.js'],
      exclude: ['model/constants.js'],   // constants.js is data, not logic
      thresholds: {
        functions: 100,
        branches:  100,
      },
      reporter: ['text', 'html'],
    },
  },
});
