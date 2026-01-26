-- 1. Constraint para upsert de leads
ALTER TABLE lead_records 
ADD CONSTRAINT lead_records_collaborator_date_unique 
UNIQUE (collaborator_name, record_date);

-- 2. Tabela de configurações do sistema
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text,
  encrypted_value text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- RLS para system_settings
CREATE POLICY "Admins can manage settings"
ON public.system_settings FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read non-sensitive settings"
ON public.system_settings FOR SELECT
TO authenticated
USING (encrypted_value IS NULL);

-- 3. Funções para credenciais ERP do sistema
CREATE OR REPLACE FUNCTION public.save_system_erp_credentials(
  p_email text, 
  p_password text
) RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem configurar ERP';
  END IF;
  
  INSERT INTO system_settings (setting_key, setting_value)
  VALUES ('erp_email', p_email)
  ON CONFLICT (setting_key) DO UPDATE SET setting_value = p_email, updated_at = now();
  
  INSERT INTO system_settings (setting_key, encrypted_value)
  VALUES ('erp_password', encrypt_erp_password(p_password))
  ON CONFLICT (setting_key) DO UPDATE SET encrypted_value = encrypt_erp_password(p_password), updated_at = now();
END; 
$$;

CREATE OR REPLACE FUNCTION public.get_system_erp_credentials()
RETURNS TABLE(email text, password text) 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    (SELECT setting_value FROM system_settings WHERE setting_key = 'erp_email'),
    decrypt_erp_password((SELECT encrypted_value FROM system_settings WHERE setting_key = 'erp_password'));
END; 
$$;

-- 4. RLS restritivo para kpi_targets (apenas admin pode editar)
DROP POLICY IF EXISTS "Public insert for targets" ON kpi_targets;
DROP POLICY IF EXISTS "Public update for targets" ON kpi_targets;
DROP POLICY IF EXISTS "Public delete for targets" ON kpi_targets;

CREATE POLICY "Admin insert targets" ON kpi_targets FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update targets" ON kpi_targets FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete targets" ON kpi_targets FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- 5. RLS restritivo para lead_records (apenas admin pode editar)
DROP POLICY IF EXISTS "Public insert for lead_records" ON lead_records;
DROP POLICY IF EXISTS "Public update for lead_records" ON lead_records;
DROP POLICY IF EXISTS "Public delete for lead_records" ON lead_records;

CREATE POLICY "Admin insert lead_records" ON lead_records FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update lead_records" ON lead_records FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete lead_records" ON lead_records FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- 6. RLS restritivo para excellence_criteria (apenas admin pode editar)
DROP POLICY IF EXISTS "Public insert for criteria" ON excellence_criteria;
DROP POLICY IF EXISTS "Public update for criteria" ON excellence_criteria;
DROP POLICY IF EXISTS "Public delete for criteria" ON excellence_criteria;

CREATE POLICY "Admin insert criteria" ON excellence_criteria FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update criteria" ON excellence_criteria FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete criteria" ON excellence_criteria FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- 7. RLS restritivo para excellence_evaluations (apenas admin pode editar)
DROP POLICY IF EXISTS "Public insert for evaluations" ON excellence_evaluations;
DROP POLICY IF EXISTS "Public update for evaluations" ON excellence_evaluations;
DROP POLICY IF EXISTS "Public delete for evaluations" ON excellence_evaluations;

CREATE POLICY "Admin insert evaluations" ON excellence_evaluations FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update evaluations" ON excellence_evaluations FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete evaluations" ON excellence_evaluations FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- 8. RLS restritivo para excellence_scores (apenas admin pode editar)
DROP POLICY IF EXISTS "Public insert for excellence_scores" ON excellence_scores;
DROP POLICY IF EXISTS "Public update for excellence_scores" ON excellence_scores;
DROP POLICY IF EXISTS "Public delete for excellence_scores" ON excellence_scores;

CREATE POLICY "Admin insert excellence_scores" ON excellence_scores FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update excellence_scores" ON excellence_scores FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete excellence_scores" ON excellence_scores FOR DELETE USING (has_role(auth.uid(), 'admin'));