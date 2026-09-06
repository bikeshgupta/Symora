import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'api/**/*.test.ts'],
    env: {
      /**
       * .claude/rules/finance-rules.md § Timezone: "Server timezone is irrelevant and
       * must never be relied on. Tests run under a non-UTC, non-user timezone to catch
       * accidental dependence."
       *
       * America/Los_Angeles is neither UTC nor the fixtures' Asia/Kolkata, and its
       * offset is negative, so a calculation that leaked the server's zone lands on the
       * wrong calendar day rather than merely the wrong hour.
       */
      TZ: 'America/Los_Angeles',
    },
  },
});
