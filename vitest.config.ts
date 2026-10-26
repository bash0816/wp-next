// SPDX-License-Identifier: GPL-3.0-only
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'tools/**/*.test.ts'],
    fileParallelism: false,
  },
});
