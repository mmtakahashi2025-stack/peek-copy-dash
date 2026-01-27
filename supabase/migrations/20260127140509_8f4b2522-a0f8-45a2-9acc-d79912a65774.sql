-- Drop overly permissive public policies for erp_cache
DROP POLICY IF EXISTS "Public read access for erp_cache" ON erp_cache;
DROP POLICY IF EXISTS "Public insert for erp_cache" ON erp_cache;
DROP POLICY IF EXISTS "Public update for erp_cache" ON erp_cache;
DROP POLICY IF EXISTS "Public delete for erp_cache" ON erp_cache;

-- Drop overly permissive public policies for erp_consolidated_cache
DROP POLICY IF EXISTS "Public read access for erp_consolidated_cache" ON erp_consolidated_cache;
DROP POLICY IF EXISTS "Public insert for erp_consolidated_cache" ON erp_consolidated_cache;
DROP POLICY IF EXISTS "Public update for erp_consolidated_cache" ON erp_consolidated_cache;
DROP POLICY IF EXISTS "Public delete for erp_consolidated_cache" ON erp_consolidated_cache;

-- Create proper user-scoped policies for erp_cache
CREATE POLICY "Users can view own erp_cache"
ON erp_cache FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own erp_cache"
ON erp_cache FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own erp_cache"
ON erp_cache FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own erp_cache"
ON erp_cache FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create proper user-scoped policies for erp_consolidated_cache
CREATE POLICY "Users can view own erp_consolidated_cache"
ON erp_consolidated_cache FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own erp_consolidated_cache"
ON erp_consolidated_cache FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own erp_consolidated_cache"
ON erp_consolidated_cache FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own erp_consolidated_cache"
ON erp_consolidated_cache FOR DELETE
TO authenticated
USING (auth.uid() = user_id);