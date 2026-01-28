-- Add total_lucro column to erp_monthly_aggregates
ALTER TABLE erp_monthly_aggregates 
ADD COLUMN IF NOT EXISTS total_lucro NUMERIC DEFAULT 0;