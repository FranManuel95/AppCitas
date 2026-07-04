-- Búsqueda de negocios en la landing: las condiciones LIKE '%término%' sobre
-- name/description/address no pueden usar un índice btree y hacían un seq scan
-- de todos los negocios activos por búsqueda. Con la extensión pg_trgm y un
-- índice GIN de trigramas, LIKE/ILIKE '%término%' pasa a usar índice y escala a
-- miles de negocios. (Específico de PostgreSQL; en SQLite dev no aplica.)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Business_name_trgm_idx"
  ON "Business" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Business_description_trgm_idx"
  ON "Business" USING GIN ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Business_address_trgm_idx"
  ON "Business" USING GIN ("address" gin_trgm_ops);
