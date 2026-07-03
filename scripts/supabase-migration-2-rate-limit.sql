-- Migración incremental 2: contador de rate limiting compartido.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.
-- (El sandbox de desarrollo no alcanza la base de datos, por eso va a mano.)

CREATE TABLE IF NOT EXISTS "RateLimitCounter" (
    "key" TEXT NOT NULL,
    "windowStart" BIGINT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key","windowStart")
);

-- Igual que el resto de tablas: RLS activo (la API pública de Supabase no
-- puede leerla; la app, como dueña de la tabla, no se ve afectada).
ALTER TABLE "RateLimitCounter" ENABLE ROW LEVEL SECURITY;

-- Registro en _prisma_migrations para que futuros `prisma migrate deploy`
-- no intenten re-aplicarla.
INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260703073527_rate_limit_counter', now(), 1)
ON CONFLICT DO NOTHING;
