-- Create table for daily lead records per collaborator
CREATE TABLE public.lead_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collaborator_name TEXT NOT NULL,
  record_date DATE NOT NULL,
  leads_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(collaborator_name, record_date)
);

-- Enable Row Level Security
ALTER TABLE public.lead_records ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can view lead records" 
ON public.lead_records 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert lead records" 
ON public.lead_records 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update lead records" 
ON public.lead_records 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete lead records" 
ON public.lead_records 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_lead_records_updated_at
BEFORE UPDATE ON public.lead_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();