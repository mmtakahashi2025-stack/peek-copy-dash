import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SystemSettingsRow = {
  setting_key: string;
  setting_value: string | null;
  encrypted_value: string | null;
};

const DEFAULT_ERP_BASE_URL = 'https://api.hoteltarobafoz.com.br/erp-json';

async function getSystemErpCredentials(): Promise<{
  email: string | null;
  password: string | null;
  source: 'system_settings' | 'env';
}> {
  const fromEnv = () => ({
    email: Deno.env.get('ERP_API_EMAIL') ?? null,
    password: Deno.env.get('ERP_API_PASSWORD') ?? null,
    source: 'env' as const,
  });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return fromEnv();

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data, error } = await admin
      .from('system_settings')
      .select('setting_key, setting_value, encrypted_value')
      .in('setting_key', ['erp_email', 'erp_password']);
    if (error) throw error;

    const rows = (data ?? []) as SystemSettingsRow[];
    const emailRow = rows.find((r) => r.setting_key === 'erp_email');
    const passwordRow = rows.find((r) => r.setting_key === 'erp_password');

    const email = (emailRow?.setting_value ?? '').trim();
    const encryptedPassword = passwordRow?.encrypted_value ?? null;

    if (email && encryptedPassword) {
      const { data: decrypted, error: decError } = await admin.rpc('decrypt_erp_password', {
        encrypted_password: encryptedPassword,
      });
      if (!decError && typeof decrypted === 'string' && decrypted.trim()) {
        return { email, password: decrypted, source: 'system_settings' };
      }
    }
  } catch (err) {
    console.warn('[ERP-LOGIN-TEST] Falha ao obter credenciais do sistema, usando fallback env:', err);
  }

  return fromEnv();
}

// Request timeout in milliseconds
const REQUEST_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timeout - conexão com ERP demorou muito');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

interface ERPLoginResponse {
  success: boolean;
  status: string;
  data?: {
    token: string;
    user: {
      id: number;
      empresaId: number;
      grupoId: number;
      name: string;
      email: string;
    };
  };
}

type SessionCookies = {
  ERPSession?: string;
  device_id?: string;
};

function extractSessionCookies(response: Response): {
  cookies: SessionCookies;
  cookieHeader: string;
  setCookieHeaders: string[];
} {
  const setCookieList =
    (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const rawSetCookie = response.headers.get('set-cookie');

  const setCookieHeaders = setCookieList.length ? setCookieList : rawSetCookie ? [rawSetCookie] : [];

  const getCookieValue = (name: keyof SessionCookies): string | undefined => {
    for (const c of setCookieHeaders) {
      const match = c.match(new RegExp(`${name}=([^;]+)`));
      if (match?.[1]) return match[1];
    }
    return undefined;
  };

  const ERPSession = getCookieValue('ERPSession');
  const device_id = getCookieValue('device_id');

  const parts: string[] = [];
  if (ERPSession) parts.push(`ERPSession=${ERPSession}`);
  if (device_id) parts.push(`device_id=${device_id}`);

  return {
    cookies: { ERPSession, device_id },
    cookieHeader: parts.join('; '),
    setCookieHeaders,
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // JWT verification - require authenticated user
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized - Missing authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : authHeader.trim();

  const authSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );

  const { data: claimsData, error: authError } = await authSupabase.auth.getClaims(token);
  if (authError || !claimsData?.claims) {
    console.error('[ERP-LOGIN-TEST] Auth error:', authError?.message);
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized - Invalid token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('[ERP-LOGIN-TEST] Authenticated user:', claimsData.claims.sub);

  const erpBaseUrl = Deno.env.get('ERP_API_URL') || DEFAULT_ERP_BASE_URL;
  const creds = await getSystemErpCredentials();
  const erpEmail = creds.email;
  const erpPassword = creds.password;

  console.log('[ERP-LOGIN-TEST] Iniciando teste de login...');
  console.log('[ERP-LOGIN-TEST] URL base:', erpBaseUrl ? 'Configurada' : 'NÃO CONFIGURADA');
  console.log('[ERP-LOGIN-TEST] Origem credenciais:', creds.source);
  console.log('[ERP-LOGIN-TEST] Email:', erpEmail ? 'Configurado' : 'NÃO CONFIGURADO');
  console.log('[ERP-LOGIN-TEST] Senha:', erpPassword ? 'Configurada' : 'NÃO CONFIGURADA');

  if (!erpBaseUrl || !erpEmail || !erpPassword) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Credenciais do ERP não configuradas',
        details: {
          hasUrl: !!erpBaseUrl,
          hasEmail: !!erpEmail,
          hasPassword: !!erpPassword,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const loginUrl = `${erpBaseUrl}/auth/login`;
    
    console.log('[ERP-LOGIN-TEST] Fazendo requisição de login...');

    const loginResponse = await fetchWithTimeout(
      loginUrl,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({ email: erpEmail, password: erpPassword }),
      },
      REQUEST_TIMEOUT_MS,
    );

    const loginText = await loginResponse.text();
    console.log('[ERP-LOGIN-TEST] Status HTTP:', loginResponse.status);

    let loginResult: ERPLoginResponse;
    try {
      loginResult = JSON.parse(loginText);
    } catch {
      console.error('[ERP-LOGIN-TEST] Resposta não é JSON:', loginText.substring(0, 200));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Resposta inválida do servidor ERP',
          httpStatus: loginResponse.status,
          rawResponse: loginText.substring(0, 500),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!loginResult.success || !loginResult.data?.token) {
      console.error('[ERP-LOGIN-TEST] Login falhou:', JSON.stringify(loginResult));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Credenciais inválidas ou usuário não autorizado',
          erpResponse: loginResult,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { cookies: sessionCookies, setCookieHeaders } = extractSessionCookies(loginResponse);

    console.log('[ERP-LOGIN-TEST] Login OK!');
    console.log('[ERP-LOGIN-TEST] Usuário:', loginResult.data.user?.name);
    console.log('[ERP-LOGIN-TEST] ERPSession:', sessionCookies.ERPSession ? 'Presente' : 'AUSENTE');
    console.log('[ERP-LOGIN-TEST] device_id:', sessionCookies.device_id ? 'Presente' : 'AUSENTE');

    const cookiesComplete = !!sessionCookies.ERPSession && !!sessionCookies.device_id;

    return new Response(
      JSON.stringify({ 
        success: true,
        loginSuccess: true,
        cookiesComplete,
        user: {
          name: loginResult.data.user?.name,
          email: loginResult.data.user?.email,
          id: loginResult.data.user?.id,
          empresaId: loginResult.data.user?.empresaId,
        },
        session: {
          hasToken: !!loginResult.data.token,
          tokenPreview: loginResult.data.token.substring(0, 30) + '...',
          hasERPSession: !!sessionCookies.ERPSession,
          hasDeviceId: !!sessionCookies.device_id,
          setCookieCount: setCookieHeaders.length,
        },
        message: cookiesComplete 
          ? 'Login OK! Sessão completa (ERPSession + device_id presentes).'
          : 'Login OK, mas cookies de sessão incompletos. O ERP não retornou ERPSession/device_id.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[ERP-LOGIN-TEST] Erro:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
