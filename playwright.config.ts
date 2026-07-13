import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Suite E2E contra un servidor Next.js con su propia base SQLite (e2e.db).
// La BD se prepara DENTRO del comando del webServer (antes de `next dev`):
// Playwright lanza el servidor antes que cualquier setup global, y si el
// servidor abriera la BD y un setup posterior la borrara/recreara, el
// proceso se quedaría con un descriptor huérfano ("attempt to write a
// readonly database"). En el sandbox local se usa el Chromium preinstalado;
// en CI, el que instala `npx playwright install chromium`.
const PORT = 3100;
const E2E_DB = `file:${path.join(__dirname, "e2e.db")}`;
const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // Los tests comparten la BD sembrada: en serie son deterministas.
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-ES",
    launchOptions:
      !process.env.CI && existsSync(LOCAL_CHROMIUM)
        ? { executablePath: LOCAL_CHROMIUM }
        : {},
  },
  webServer: {
    command: `bash -c 'rm -f e2e.db e2e.db-wal e2e.db-shm e2e.db-journal && npx prisma db push && npx tsx prisma/seed.ts && npm run dev -- --port ${PORT}'`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    stdout: "pipe",
    timeout: 240_000,
    env: {
      DATABASE_URL: E2E_DB,
      AUTH_SECRET: "e2e-secret-no-usar-en-produccion",
      APP_BASE_URL: `http://localhost:${PORT}`,
      // La suite hace decenas de logins legítimos desde la misma IP: se
      // relajan los límites (×20) sin desactivar el mecanismo.
      RATE_LIMIT_MULTIPLIER: "20",
    },
  },
});
