-- Create table for ERP data cache (per user, per month)
CREATE TABLE public.erp_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  data JSONB NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint: one cache entry per user per month
  UNIQUE (user_id, year, month)
);

-- Enable Row Level Security
ALTER TABLE public.erp_cache ENABLE ROW LEVEL SECURITY;

-- Users can view their own cache
CREATE POLICY "Users can view own cache"
ON public.erp_cache
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own cache
CREATE POLICY "Users can insert own cache"
ON public.erp_cache
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own cache
CREATE POLICY "Users can update own cache"
ON public.erp_cache
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own cache
CREATE POLICY "Users can delete own cache"
ON public.erp_cache
FOR DELETE
USING (auth.uid() = user_id);

-- Index for faster queries by user and period
CREATE INDEX idx_erp_cache_user_period ON public.erp_cache (user_id, year, month);

-- Trigger for updated_at
CREATE TRIGGER update_erp_cache_updated_at
BEFORE UPDATE ON public.erp_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create consolidated cache table for general/aggregated data
CREATE TABLE public.erp_consolidated_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  unique_sales INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  total_records INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.erp_consolidated_cache ENABLE ROW LEVEL SECURITY;

-- Users can view their own consolidated cache
CREATE POLICY "Users can view own consolidated cache"
ON public.erp_consolidated_cache
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own consolidated cache
CREATE POLICY "Users can insert own consolidated cache"
ON public.erp_consolidated_cache
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own consolidated cache
CREATE POLICY "Users can update own consolidated cache"
ON public.erp_consolidated_cache
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own consolidated cache
CREATE POLICY "Users can delete own consolidated cache"
ON public.erp_consolidated_cache
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_erp_consolidated_cache_updated_at
BEFORE UPDATE ON public.erp_consolidated_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();