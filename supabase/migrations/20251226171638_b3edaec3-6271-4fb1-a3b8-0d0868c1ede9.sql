-- Add conversation_number column to excellence_evaluations table
ALTER TABLE public.excellence_evaluations 
ADD COLUMN conversation_number text;