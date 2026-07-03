import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

// Singleton: evita agotar conexiones con el hot-reload de Next.js en
// desarrollo. El adaptador se elige por DATABASE_URL: PostgreSQL en
// producción, SQLite en local. El resto del código no distingue proveedor.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Tope del pool de Postgres por instancia. En serverless cada instancia
// caliente mantiene su propio pool; sin tope (pg usa max=10 por defecto), N
// instancias concurrentes pueden agotar el pooler de Supabase. Con el
// transaction pooler (pgbouncer) lo correcto es 1 conexión por instancia.
// Configurable con PG_POOL_MAX (p. ej. un VPS de proceso único puede subirlo).
function pgPoolMax(): number {
  const raw = Number(process.env.PG_POOL_MAX);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function createClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const adapter = url.startsWith("postgres")
    ? new PrismaPg({ connectionString: url, max: pgPoolMax() })
    : new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
