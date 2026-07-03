import { afterAll } from "vitest";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// setupFile de vitest: se ejecuta ANTES de importar el módulo de test (y por
// tanto antes de que se construya el singleton de Prisma). Copia la plantilla
// a una BD temporal única y apunta DATABASE_URL a ella: cada archivo de test
// obtiene una BD SQLite propia y aislada. Los tests puros no la usan.
const TEMPLATE_DB = path.resolve(__dirname, "..", "tmp", "template.db");

const dir = mkdtempSync(path.join(tmpdir(), "appcitas-test-"));
const dbPath = path.join(dir, "test.db");
copyFileSync(TEMPLATE_DB, dbPath);
process.env.DATABASE_URL = `file:${dbPath}`;

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
