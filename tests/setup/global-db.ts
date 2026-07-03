import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

// globalSetup de vitest: construye UNA plantilla de BD SQLite vacía con el
// schema actual. Cada archivo de test la copia (setup por archivo) para tener
// su propia BD aislada sin pagar un `db push` por archivo.
const TMP_DIR = path.resolve(__dirname, "..", "tmp");
export const TEMPLATE_DB = path.join(TMP_DIR, "template.db");

export default function setup() {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });

  // db push aplica el schema a la plantilla. dotenv (en prisma.config.ts) no
  // pisa DATABASE_URL si ya está en el entorno, así que se construye aquí.
  execSync("npx prisma db push --accept-data-loss", {
    stdio: "ignore",
    cwd: path.resolve(__dirname, "..", ".."),
    env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB}` },
  });
}
