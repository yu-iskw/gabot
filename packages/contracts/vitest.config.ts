import { defineConfig } from "vitest/config";
export default defineConfig({test: { name: "@gabot/contracts", environment: "node", include: ["src/**/*.test.ts"] }});
