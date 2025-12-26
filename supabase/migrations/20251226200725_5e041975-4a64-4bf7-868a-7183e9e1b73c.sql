-- Add evaluator column to store who made the evaluation
ALTER TABLE public.excellence_evaluations 
ADD COLUMN evaluator_email text;