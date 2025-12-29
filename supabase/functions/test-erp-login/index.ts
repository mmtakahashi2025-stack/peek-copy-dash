import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  const erpBaseUrl = Deno.env.get('ERP_API_URL');
  const erpEmail = Deno.env.get('ERP_API_EMAIL');
  const erpPassword = Deno.env.get('ERP_API_PASSWORD');

  console.log('[ERP-LOGIN-TEST] Iniciando teste de login...');
  console.log('[ERP-LOGIN-TEST] URL base:', erpBaseUrl ? 'Configurada' : 'NÃO CONFIGURADA');
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
    const loginUrl = `${erpBaseUrl}/api/auth/login?email=${encodeURIComponent(erpEmail)}&password=${encodeURIComponent(erpPassword)}`;
    
    console.log('[ERP-LOGIN-TEST] Fazendo requisição de login...');

    const loginResponse = await fetch(loginUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

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
