-- =====================================================
-- OTIMIZACAO DO BANCO DE DADOS - FASE CORRIGIDA
-- =====================================================

-- 1. Remover indices duplicados (se existirem)
DROP INDEX IF EXISTS idx_erp_cache_user_period;
-- Remover constraint duplicada (não índice)
ALTER TABLE lead_records DROP CONSTRAINT IF EXISTS lead_records_collaborator_name_record_date_key;

-- 2. Criar novos indices estrategicos
CREATE INDEX IF NOT EXISTS idx_excellence_evaluations_date 
  ON excellence_evaluations(evaluation_date);
  
CREATE INDEX IF NOT EXISTS idx_excellence_scores_evaluation 
  ON excellence_scores(evaluation_id);
  
CREATE INDEX IF NOT EXISTS idx_lead_records_date 
  ON lead_records(record_date);
  
CREATE INDEX IF NOT EXISTS idx_erp_cache_period 
  ON erp_cache(year, month);

-- 3. Adicionar coluna de metadados para queries leves
ALTER TABLE erp_cache ADD COLUMN IF NOT EXISTS data_size integer;

-- 4. Criar indice para verificacao rapida de cache
CREATE INDEX IF NOT EXISTS idx_erp_cache_quick_check 
  ON erp_cache(year, month, record_count);

-- 5. Funcao otimizada com cache de sessao para verificar admin
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cached_result boolean;
BEGIN
  -- Tentar obter do cache de sessao primeiro
  BEGIN
    cached_result := current_setting('app.is_admin')::boolean;
    RETURN cached_result;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Calcular e armazenar no cache
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO cached_result;
  
  -- Salvar no cache da sessao
  PERFORM set_config('app.is_admin', cached_result::text, false);
  
  RETURN cached_result;
END;
$$;

-- 6. Atualizar estatisticas das tabelas
ANALYZE erp_cache;
ANALYZE lead_records;
ANALYZE excellence_evaluations;
ANALYZE excellence_scores;
ANALYZE kpi_targets;