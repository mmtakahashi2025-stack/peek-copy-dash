-- Tabela para agregados mensais pre-calculados (ultra-rapido para graficos)
CREATE TABLE public.erp_monthly_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  filial TEXT NOT NULL DEFAULT 'todas',
  colaborador TEXT DEFAULT NULL,
  faturamento NUMERIC(15,2) NOT NULL DEFAULT 0,
  quantidade_vendas INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice para queries rapidas por periodo
CREATE INDEX idx_erp_aggregates_period ON erp_monthly_aggregates(year, month);

-- Indice para queries com filtro de filial
CREATE INDEX idx_erp_aggregates_filial ON erp_monthly_aggregates(year, month, filial);

-- Indice unico para upsert (usando COALESCE para tratar NULL)
CREATE UNIQUE INDEX idx_erp_aggregates_unique ON erp_monthly_aggregates(year, month, filial, COALESCE(colaborador, ''));

-- Enable RLS
ALTER TABLE erp_monthly_aggregates ENABLE ROW LEVEL SECURITY;

-- Todos podem ler agregados
CREATE POLICY "Authenticated users can read aggregates"
  ON erp_monthly_aggregates FOR SELECT
  USING (true);

-- Apenas admins podem gerenciar agregados
CREATE POLICY "Admins can insert aggregates"
  ON erp_monthly_aggregates FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update aggregates"
  ON erp_monthly_aggregates FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete aggregates"
  ON erp_monthly_aggregates FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER update_erp_monthly_aggregates_updated_at
  BEFORE UPDATE ON erp_monthly_aggregates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();