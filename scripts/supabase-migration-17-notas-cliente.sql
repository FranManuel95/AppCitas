-- Migración incremental 17: notas privadas de cliente (CRM).
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.

CREATE TABLE IF NOT EXISTS "ClientNote" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorName" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClientNote_businessId_clientId_createdAt_idx" ON "ClientNote"("businessId", "clientId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "ClientNote" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260706120000_client_notes', now(), 1)
ON CONFLICT DO NOTHING;
