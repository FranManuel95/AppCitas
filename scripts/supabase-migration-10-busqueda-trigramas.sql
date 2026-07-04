-- Migración incremental 10: índices de trigramas para la búsqueda de la landing.
-- Pégala en el SQL Editor de Supabase y ejecútala una sola vez.
--
-- Las condiciones LIKE '%término%' sobre name/description/address hacían un seq
-- scan de todos los negocios activos. Con pg_trgm + índice GIN de trigramas,
-- la búsqueda pasa a usar índice y escala a miles de negocios.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Business_name_trgm_idx"
  ON "Business" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Business_description_trgm_idx"
  ON "Business" USING GIN ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Business_address_trgm_idx"
  ON "Business" USING GIN ("address" gin_trgm_ops);

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manual-sql-editor', '20260704160000_search_trgm_indexes', now(), 1)
ON CONFLICT DO NOTHING;
