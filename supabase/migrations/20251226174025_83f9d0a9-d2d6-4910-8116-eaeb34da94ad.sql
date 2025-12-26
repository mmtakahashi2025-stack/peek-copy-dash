-- Drop all existing permissive policies and create authenticated-only policies

-- kpi_targets table
DROP POLICY IF EXISTS "Anyone can delete targets" ON public.kpi_targets;
DROP POLICY IF EXISTS "Anyone can insert targets" ON public.kpi_targets;
DROP POLICY IF EXISTS "Anyone can update targets" ON public.kpi_targets;
DROP POLICY IF EXISTS "Anyone can view targets" ON public.kpi_targets;

CREATE POLICY "Authenticated users can view targets" ON public.kpi_targets FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert targets" ON public.kpi_targets FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update targets" ON public.kpi_targets FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete targets" ON public.kpi_targets FOR DELETE USING (auth.uid() IS NOT NULL);

-- excellence_criteria table
DROP POLICY IF EXISTS "Anyone can delete criteria" ON public.excellence_criteria;
DROP POLICY IF EXISTS "Anyone can insert criteria" ON public.excellence_criteria;
DROP POLICY IF EXISTS "Anyone can update criteria" ON public.excellence_criteria;
DROP POLICY IF EXISTS "Anyone can view criteria" ON public.excellence_criteria;

CREATE POLICY "Authenticated users can view criteria" ON public.excellence_criteria FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert criteria" ON public.excellence_criteria FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update criteria" ON public.excellence_criteria FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete criteria" ON public.excellence_criteria FOR DELETE USING (auth.uid() IS NOT NULL);

-- excellence_scores table
DROP POLICY IF EXISTS "Anyone can delete scores" ON public.excellence_scores;
DROP POLICY IF EXISTS "Anyone can insert scores" ON public.excellence_scores;
DROP POLICY IF EXISTS "Anyone can update scores" ON public.excellence_scores;
DROP POLICY IF EXISTS "Anyone can view scores" ON public.excellence_scores;

CREATE POLICY "Authenticated users can view scores" ON public.excellence_scores FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert scores" ON public.excellence_scores FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update scores" ON public.excellence_scores FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete scores" ON public.excellence_scores FOR DELETE USING (auth.uid() IS NOT NULL);

-- excellence_evaluations table
DROP POLICY IF EXISTS "Anyone can delete evaluations" ON public.excellence_evaluations;
DROP POLICY IF EXISTS "Anyone can insert evaluations" ON public.excellence_evaluations;
DROP POLICY IF EXISTS "Anyone can update evaluations" ON public.excellence_evaluations;
DROP POLICY IF EXISTS "Anyone can view evaluations" ON public.excellence_evaluations;

CREATE POLICY "Authenticated users can view evaluations" ON public.excellence_evaluations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert evaluations" ON public.excellence_evaluations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update evaluations" ON public.excellence_evaluations FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete evaluations" ON public.excellence_evaluations FOR DELETE USING (auth.uid() IS NOT NULL);