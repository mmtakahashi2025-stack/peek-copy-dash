-- First, delete older duplicates keeping only the most recent entry per user/year/month
DELETE FROM erp_cache a
USING erp_cache b
WHERE a.user_id = b.user_id
  AND a.year = b.year
  AND a.month = b.month
  AND a.updated_at < b.updated_at;

-- Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS erp_cache_user_year_month_unique 
ON erp_cache(user_id, year, month);