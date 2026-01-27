-- PASSO 1: Limpar dados duplicados ANTES de criar constraints
-- Manter apenas o registro mais recente de cada (year, month)
DELETE FROM erp_cache a
USING erp_cache b
WHERE a.id < b.id 
  AND a.year = b.year 
  AND a.month = b.month;

-- Limpar duplicados em erp_consolidated_cache também
DELETE FROM erp_consolidated_cache a
USING erp_consolidated_cache b
WHERE a.id < b.id 
  AND a.start_date = b.start_date 
  AND a.end_date = b.end_date;

-- PASSO 2: Remover constraint unique atual (user_id, year, month)
ALTER TABLE erp_cache DROP CONSTRAINT IF EXISTS erp_cache_user_id_year_month_key;

-- Adicionar nova constraint unique sem user_id
ALTER TABLE erp_cache ADD CONSTRAINT erp_cache_year_month_key UNIQUE (year, month);

-- Tornar user_id opcional (registra quem fez a ultima atualizacao)
ALTER TABLE erp_cache ALTER COLUMN user_id DROP NOT NULL;

-- Fazer o mesmo para erp_consolidated_cache
ALTER TABLE erp_consolidated_cache DROP CONSTRAINT IF EXISTS erp_consolidated_cache_user_id_key;
ALTER TABLE erp_consolidated_cache ADD CONSTRAINT erp_consolidated_cache_dates_key 
  UNIQUE (start_date, end_date);
ALTER TABLE erp_consolidated_cache ALTER COLUMN user_id DROP NOT NULL;

-- PASSO 3: Atualizar RLS policies para erp_cache
DROP POLICY IF EXISTS "Users can view own erp_cache" ON erp_cache;
DROP POLICY IF EXISTS "Users can insert own erp_cache" ON erp_cache;
DROP POLICY IF EXISTS "Users can update own erp_cache" ON erp_cache;
DROP POLICY IF EXISTS "Users can delete own erp_cache" ON erp_cache;

-- Novas policies: todos leem, apenas admin escreve
CREATE POLICY "Authenticated users can read erp_cache" 
  ON erp_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert erp_cache" 
  ON erp_cache FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update erp_cache" 
  ON erp_cache FOR UPDATE TO authenticated 
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete erp_cache" 
  ON erp_cache FOR DELETE TO authenticated 
  USING (has_role(auth.uid(), 'admin'));

-- PASSO 4: Mesma logica para erp_consolidated_cache
DROP POLICY IF EXISTS "Users can view own erp_consolidated_cache" ON erp_consolidated_cache;
DROP POLICY IF EXISTS "Users can insert own erp_consolidated_cache" ON erp_consolidated_cache;
DROP POLICY IF EXISTS "Users can update own erp_consolidated_cache" ON erp_consolidated_cache;
DROP POLICY IF EXISTS "Users can delete own erp_consolidated_cache" ON erp_consolidated_cache;

CREATE POLICY "Authenticated users can read erp_consolidated_cache" 
  ON erp_consolidated_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert erp_consolidated_cache" 
  ON erp_consolidated_cache FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update erp_consolidated_cache" 
  ON erp_consolidated_cache FOR UPDATE TO authenticated 
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete erp_consolidated_cache" 
  ON erp_consolidated_cache FOR DELETE TO authenticated 
  USING (has_role(auth.uid(), 'admin'));