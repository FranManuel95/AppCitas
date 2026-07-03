import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // globalSetup construye una plantilla de BD SQLite con el schema; el setup
    // por archivo la copia a una BD temporal y apunta DATABASE_URL antes de que
    // se importe el singleton de Prisma. Los tests puros la ignoran.
    globalSetup: ["./tests/setup/global-db.ts"],
    setupFiles: ["./tests/setup/per-file-db.ts"],
  },
});
