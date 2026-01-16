import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "server",
      environment: "node",
      include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "client",
      environment: "jsdom",
      include: ["client/src/**/*.test.{ts,tsx}"],
      setupFiles: ["./client/src/test/setup.ts"],
    },
  },
]);
