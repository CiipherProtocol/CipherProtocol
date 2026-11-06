import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setupEnv.ts'],
    environment: 'node',
    // Each file gets its own in-memory DB; run files one at a time so the
    // module-level sequelize instance isn't shared across workers.
    fileParallelism: false,
  },
});
