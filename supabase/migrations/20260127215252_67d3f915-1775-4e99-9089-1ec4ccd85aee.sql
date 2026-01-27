-- FASE 1: Tabela de agregados diários para gráficos Mensal/Semanal
CREATE TABLE public.erp_daily_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  filial TEXT NOT NULL DEFAULT 'todas',
  colaborador TEXT,
  faturamento NUMERIC NOT NULL DEFAULT 0,
  quantidade_vendas INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice único para evitar duplicatas
CREATE UNIQUE INDEX idx_daily_aggregates_unique 
ON public.erp_daily_aggregates (date, filial, COALESCE(colaborador, ''));

-- Índice para queries por período
CREATE INDEX idx_daily_aggregates_date_filial 
ON public.erp_daily_aggregates (date, filial);

-- Enable RLS
ALTER TABLE public.erp_daily_aggregates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read daily aggregates"
ON public.erp_daily_aggregates FOR SELECT
USING (true);

CREATE POLICY "Admins can insert daily aggregates"
ON public.erp_daily_aggregates FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update daily aggregates"
ON public.erp_daily_aggregates FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete daily aggregates"
ON public.erp_daily_aggregates FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- FASE 2: Tabela de cache de rankings pré-calculados
CREATE TABLE public.erp_ranking_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  ranking_type TEXT NOT NULL, -- 'colaborador' ou 'produto'
  filial TEXT NOT NULL DEFAULT 'todas',
  ranking_data JSONB NOT NULL, -- Array ordenado top 10
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice único para evitar duplicatas
CREATE UNIQUE INDEX idx_ranking_cache_unique 
ON public.erp_ranking_cache (year, month, ranking_type, filial);

-- Índice para queries por período
CREATE INDEX idx_ranking_cache_period 
ON public.erp_ranking_cache (year, month);

-- Enable RLS
ALTER TABLE public.erp_ranking_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read ranking cache"
ON public.erp_ranking_cache FOR SELECT
USING (true);

CREATE POLICY "Admins can insert ranking cache"
ON public.erp_ranking_cache FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update ranking cache"
ON public.erp_ranking_cache FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete ranking cache"
ON public.erp_ranking_cache FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_daily_aggregates_updated_at
BEFORE UPDATE ON public.erp_daily_aggregates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ranking_cache_updated_at
BEFORE UPDATE ON public.erp_ranking_cache
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();