import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Singleton: evita agotar conexiones con el hot-reload de Next.js en desarrollo.
// Para producción con PostgreSQL basta con cambiar el adaptador (p. ej.
// @prisma/adapter-pg) y el provider del schema; el resto del código no cambia.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
