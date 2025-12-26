-- Tabela de critérios do padrão de excelência
CREATE TABLE public.excellence_criteria (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de avaliações do padrão de excelência
CREATE TABLE public.excellence_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collaborator_name TEXT NOT NULL,
  evaluation_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de notas por critério
CREATE TABLE public.excellence_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID NOT NULL REFERENCES public.excellence_evaluations(id) ON DELETE CASCADE,
  criteria_id UUID NOT NULL REFERENCES public.excellence_criteria(id) ON DELETE CASCADE,
  score INTEGER CHECK (score IN (0, 1, -1)), -- 1 = sim, 0 = não, -1 = não aplicável
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(evaluation_id, criteria_id)
);

-- Enable RLS
ALTER TABLE public.excellence_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excellence_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excellence_scores ENABLE ROW LEVEL SECURITY;

-- Políticas para critérios (todos podem ver e editar)
CREATE POLICY "Anyone can view criteria" ON public.excellence_criteria FOR SELECT USING (true);
CREATE POLICY "Anyone can insert criteria" ON public.excellence_criteria FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update criteria" ON public.excellence_criteria FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete criteria" ON public.excellence_criteria FOR DELETE USING (true);

-- Políticas para avaliações
CREATE POLICY "Anyone can view evaluations" ON public.excellence_evaluations FOR SELECT USING (true);
CREATE POLICY "Anyone can insert evaluations" ON public.excellence_evaluations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update evaluations" ON public.excellence_evaluations FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete evaluations" ON public.excellence_evaluations FOR DELETE USING (true);

-- Políticas para notas
CREATE POLICY "Anyone can view scores" ON public.excellence_scores FOR SELECT USING (true);
CREATE POLICY "Anyone can insert scores" ON public.excellence_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update scores" ON public.excellence_scores FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete scores" ON public.excellence_scores FOR DELETE USING (true);

-- Triggers para updated_at
CREATE TRIGGER update_excellence_criteria_updated_at
  BEFORE UPDATE ON public.excellence_criteria
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_excellence_evaluations_updated_at
  BEFORE UPDATE ON public.excellence_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();