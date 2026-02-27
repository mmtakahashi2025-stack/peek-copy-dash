-- Remove the conflicting unique constraint that includes user_id
-- The global cache only needs (year, month) uniqueness
ALTER TABLE public.erp_cache DROP CONSTRAINT IF EXISTS erp_cache_user_year_month_unique;
