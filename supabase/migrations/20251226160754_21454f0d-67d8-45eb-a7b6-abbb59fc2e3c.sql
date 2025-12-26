-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table for monthly KPI targets
CREATE TABLE public.kpi_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  kpi_type TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (year, month, kpi_type)
);

-- Enable RLS
ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;

-- Public read/write access (no restrictions as requested)
CREATE POLICY "Anyone can view targets" 
ON public.kpi_targets 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert targets" 
ON public.kpi_targets 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update targets" 
ON public.kpi_targets 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete targets" 
ON public.kpi_targets 
FOR DELETE 
USING (true);

-- Trigger for updating updated_at
CREATE TRIGGER update_kpi_targets_updated_at
BEFORE UPDATE ON public.kpi_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();