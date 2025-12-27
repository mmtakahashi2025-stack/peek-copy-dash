-- Create role enum type
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'employee');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create helper function to check if user is admin or manager
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'manager')
  )
$$;

-- RLS policies for user_roles table
CREATE POLICY "Users can view their own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin_or_manager());

CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Drop existing overly permissive policies for kpi_targets
DROP POLICY IF EXISTS "Authenticated users can insert targets" ON public.kpi_targets;
DROP POLICY IF EXISTS "Authenticated users can update targets" ON public.kpi_targets;
DROP POLICY IF EXISTS "Authenticated users can delete targets" ON public.kpi_targets;

-- Create new restrictive policies for kpi_targets (read by all authenticated, write by admin/manager)
CREATE POLICY "Admins and managers can insert targets"
ON public.kpi_targets
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "Admins and managers can update targets"
ON public.kpi_targets
FOR UPDATE
TO authenticated
USING (public.is_admin_or_manager());

CREATE POLICY "Admins and managers can delete targets"
ON public.kpi_targets
FOR DELETE
TO authenticated
USING (public.is_admin_or_manager());

-- Drop existing overly permissive policies for excellence_criteria
DROP POLICY IF EXISTS "Authenticated users can insert criteria" ON public.excellence_criteria;
DROP POLICY IF EXISTS "Authenticated users can update criteria" ON public.excellence_criteria;
DROP POLICY IF EXISTS "Authenticated users can delete criteria" ON public.excellence_criteria;

-- Create new restrictive policies for excellence_criteria (read by all authenticated, write by admin/manager)
CREATE POLICY "Admins and managers can insert criteria"
ON public.excellence_criteria
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "Admins and managers can update criteria"
ON public.excellence_criteria
FOR UPDATE
TO authenticated
USING (public.is_admin_or_manager());

CREATE POLICY "Admins and managers can delete criteria"
ON public.excellence_criteria
FOR DELETE
TO authenticated
USING (public.is_admin_or_manager());

-- Drop existing overly permissive policies for excellence_evaluations
DROP POLICY IF EXISTS "Authenticated users can insert evaluations" ON public.excellence_evaluations;
DROP POLICY IF EXISTS "Authenticated users can update evaluations" ON public.excellence_evaluations;
DROP POLICY IF EXISTS "Authenticated users can delete evaluations" ON public.excellence_evaluations;

-- Create new restrictive policies for excellence_evaluations (read by all authenticated, write by admin/manager)
CREATE POLICY "Admins and managers can insert evaluations"
ON public.excellence_evaluations
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "Admins and managers can update evaluations"
ON public.excellence_evaluations
FOR UPDATE
TO authenticated
USING (public.is_admin_or_manager());

CREATE POLICY "Admins and managers can delete evaluations"
ON public.excellence_evaluations
FOR DELETE
TO authenticated
USING (public.is_admin_or_manager());

-- Drop existing overly permissive policies for excellence_scores
DROP POLICY IF EXISTS "Authenticated users can insert scores" ON public.excellence_scores;
DROP POLICY IF EXISTS "Authenticated users can update scores" ON public.excellence_scores;
DROP POLICY IF EXISTS "Authenticated users can delete scores" ON public.excellence_scores;

-- Create new restrictive policies for excellence_scores (read by all authenticated, write by admin/manager)
CREATE POLICY "Admins and managers can insert scores"
ON public.excellence_scores
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "Admins and managers can update scores"
ON public.excellence_scores
FOR UPDATE
TO authenticated
USING (public.is_admin_or_manager());

CREATE POLICY "Admins and managers can delete scores"
ON public.excellence_scores
FOR DELETE
TO authenticated
USING (public.is_admin_or_manager());

-- Drop existing overly permissive policies for lead_records
DROP POLICY IF EXISTS "Authenticated users can insert lead records" ON public.lead_records;
DROP POLICY IF EXISTS "Authenticated users can update lead records" ON public.lead_records;
DROP POLICY IF EXISTS "Authenticated users can delete lead records" ON public.lead_records;

-- Create new restrictive policies for lead_records (read by all authenticated, write by admin/manager)
CREATE POLICY "Admins and managers can insert lead records"
ON public.lead_records
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "Admins and managers can update lead records"
ON public.lead_records
FOR UPDATE
TO authenticated
USING (public.is_admin_or_manager());

CREATE POLICY "Admins and managers can delete lead records"
ON public.lead_records
FOR DELETE
TO authenticated
USING (public.is_admin_or_manager());