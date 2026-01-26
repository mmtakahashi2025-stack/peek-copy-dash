-- Fix decrypt_erp_password: remove convert_from that causes the issue
CREATE OR REPLACE FUNCTION public.decrypt_erp_password(encrypted_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF encrypted_password IS NULL OR encrypted_password = '' THEN
    RETURN NULL;
  END IF;
  
  BEGIN
    -- pgp_sym_decrypt already returns text, no need for convert_from
    RETURN extensions.pgp_sym_decrypt(
      decode(encrypted_password, 'base64'),
      'erp_secure_encryption_key_v1_combo_iguassu'::text
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Fallback: return as-is if decryption fails (legacy unencrypted value)
      RETURN encrypted_password;
  END;
END;
$$;

-- Fix save_system_erp_credentials: only update password if provided
CREATE OR REPLACE FUNCTION public.save_system_erp_credentials(p_email text, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem configurar ERP';
  END IF;
  
  -- Always update email
  INSERT INTO system_settings (setting_key, setting_value)
  VALUES ('erp_email', p_email)
  ON CONFLICT (setting_key) DO UPDATE SET setting_value = p_email, updated_at = now();
  
  -- Only update password if provided (non-null and non-empty)
  IF p_password IS NOT NULL AND p_password <> '' THEN
    INSERT INTO system_settings (setting_key, encrypted_value)
    VALUES ('erp_password', encrypt_erp_password(p_password))
    ON CONFLICT (setting_key) DO UPDATE SET encrypted_value = encrypt_erp_password(p_password), updated_at = now();
  END IF;
END;
$$;