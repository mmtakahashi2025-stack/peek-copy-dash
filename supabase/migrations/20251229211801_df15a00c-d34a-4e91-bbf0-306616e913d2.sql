-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Create a secure function to encrypt ERP password before storing
-- Uses pgp_sym_encrypt from the extensions schema
CREATE OR REPLACE FUNCTION public.encrypt_erp_password(plain_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF plain_password IS NULL OR plain_password = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN encode(
    extensions.pgp_sym_encrypt(plain_password::bytea, 'erp_secure_encryption_key_v1_combo_iguassu'::text),
    'base64'
  );
END;
$$;

-- Create a secure function to decrypt ERP password
CREATE OR REPLACE FUNCTION public.decrypt_erp_password(encrypted_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF encrypted_password IS NULL THEN
    RETURN NULL;
  END IF;
  
  BEGIN
    RETURN convert_from(
      extensions.pgp_sym_decrypt(
        decode(encrypted_password, 'base64'),
        'erp_secure_encryption_key_v1_combo_iguassu'::text
      ),
      'UTF8'
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Return as-is if decryption fails (e.g., old unencrypted password)
      RETURN encrypted_password;
  END;
END;
$$;

-- Create RPC function to save encrypted ERP password (called from client)
CREATE OR REPLACE FUNCTION public.save_erp_password(target_user_id uuid, plain_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the user is saving their own password
  IF auth.uid() IS DISTINCT FROM target_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only save your own password';
  END IF;
  
  -- Check if profile exists
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    -- Update existing profile
    UPDATE public.profiles
    SET erp_password = public.encrypt_erp_password(plain_password),
        updated_at = now()
    WHERE id = target_user_id;
  ELSE
    -- Insert new profile
    INSERT INTO public.profiles (id, email, erp_password)
    VALUES (target_user_id, (SELECT email FROM auth.users WHERE id = target_user_id), public.encrypt_erp_password(plain_password));
  END IF;
END;
$$;

-- Create RPC function to get decrypted ERP password (called from client)
CREATE OR REPLACE FUNCTION public.get_erp_password(target_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encrypted_pwd text;
BEGIN
  -- Verify the user is getting their own password
  IF auth.uid() IS DISTINCT FROM target_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only read your own password';
  END IF;
  
  SELECT erp_password INTO encrypted_pwd
  FROM public.profiles
  WHERE id = target_user_id;
  
  RETURN public.decrypt_erp_password(encrypted_pwd);
END;
$$;

-- Restrict excellence_scores visibility to admins/managers only
-- Drop existing permissive policy
DROP POLICY IF EXISTS "Authenticated users can view scores" ON public.excellence_scores;

-- Create restrictive policy for excellence_scores - only admins/managers can view all scores
CREATE POLICY "Admins and managers can view all scores"
ON public.excellence_scores
FOR SELECT
USING (is_admin_or_manager());