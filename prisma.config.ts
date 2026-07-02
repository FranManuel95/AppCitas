import "dotenv/config";
import { defineConfig } from "prisma/config";

// El proyecto funciona con SQLite en desarrollo y PostgreSQL en producción.
// La elección es automática según DATABASE_URL: cada proveedor tiene su
// schema (schema.postgres.prisma se deriva con `npm run db:sync-pg`) y su
// carpeta de migraciones propia.
const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");

export default defineConfig({
  schema: isPostgres
    ? "prisma/schema.postgres.prisma"
    : "prisma/schema.prisma",
  migrations: {
    path: isPostgres ? "prisma/migrations-postgres" : "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
