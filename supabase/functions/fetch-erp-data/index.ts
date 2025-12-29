import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SalesRequestBody {
  startDate: string; // DD/MM/YYYY format
  endDate: string;   // DD/MM/YYYY format
}

// ERP Response types
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

interface ERPSaleItem {
  Empresa: string;
  Empresa_Id: number;
  Venda_Id: number;
  CanalVenda_Id: number;
  Usuario_Id: number;
  Emissor: string;
  DataStatus: string;
  Situacao: string;
  ProdutoTipo: string;
  ItemDescricao: string;
  Produto_Id: number;
  Qtde: number;
  ValorUnitario: number;
  BrutoItem: number;
  DescontosVenda: number;
  TotalBrutoVenda: number;
  RateioDesconto: number;
  LiquidoItem: number;
  Comissao: number;
  CustoTotalItem: number;
  LucroItem: number;
  PercLucroItem: number;
  ResumoVenda: string;
}

// Dashboard mapping - transformed data structure
interface TransformedSaleRow {
  Filial: string;
  Emissor: string;
  'Venda #': number;
  'Data Venda': string;
  'Resumo Recebimentos': string;
  Item: string;
  Tipo: string;
  Quantidade: number;
  'Valor Unitário': number;
  Bruto: number;
  'Desc. (rateio)': number;
  Líquido: number;
  Comissão: number;
  Custo: number;
  Lucro: number;
  '% Lucro': number;
}

function transformERPData(erpData: Record<string, ERPSaleItem>): TransformedSaleRow[] {
  return Object.values(erpData).map((item) => ({
    Filial: item.Empresa,
    Emissor: item.Emissor,
    'Venda #': item.Venda_Id,
    'Data Venda': item.DataStatus,
    'Resumo Recebimentos': item.ResumoVenda,
    Item: item.ItemDescricao,
    Tipo: item.ProdutoTipo,
    Quantidade: item.Qtde,
    'Valor Unitário': item.ValorUnitario,
    Bruto: item.BrutoItem,
    'Desc. (rateio)': item.RateioDesconto,
    Líquido: item.LiquidoItem,
    Comissão: item.Comissao,
    Custo: item.CustoTotalItem,
    Lucro: item.LiquidoItem - item.CustoTotalItem,
    '% Lucro': item.PercLucroItem,
  }));
}

type SessionCookies = {
  ERPSession?: string;
  device_id?: string;
};

function extractAllCookies(response: Response): {
  cookies: SessionCookies;
  cookieHeader: string;
  rawCookies: string[];
} {
  // Try multiple methods to extract Set-Cookie headers
  const setCookieList =
    (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const rawSetCookie = response.headers.get('set-cookie');
  
  // Collect all set-cookie headers
  let rawCookies: string[] = [];
  if (setCookieList.length > 0) {
    rawCookies = setCookieList;
  } else if (rawSetCookie) {
    // Some servers concatenate cookies with comma - try to split them
    rawCookies = rawSetCookie.split(/,(?=[^;]*=)/);
  }

  console.log('[ERP] Raw Set-Cookie headers count:', rawCookies.length);
  console.log('[ERP] Raw Set-Cookie:', JSON.stringify(rawCookies));

  const getCookieValue = (name: string): string | undefined => {
    for (const c of rawCookies) {
      const match = c.match(new RegExp(`${name}=([^;]+)`));
      if (match?.[1]) return match[1];
    }
    return undefined;
  };

  const ERPSession = getCookieValue('ERPSession');
  const device_id = getCookieValue('device_id');

  // Build cookie header exactly as the browser would send it
  const cookieParts: string[] = [];
  if (ERPSession) cookieParts.push(`ERPSession=${ERPSession}`);
  if (device_id) cookieParts.push(`device_id=${device_id}`);

  return {
    cookies: { ERPSession, device_id },
    cookieHeader: cookieParts.join('; '),
    rawCookies,
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

  if (!erpBaseUrl || !erpEmail || !erpPassword) {
    console.error('Missing ERP credentials');
    return new Response(
      JSON.stringify({ success: false, error: 'Credenciais do ERP não configuradas' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Parse request body for date filters
  let startDate: string;
  let endDate: string;
  
  try {
    const body: SalesRequestBody = await req.json();
    startDate = body.startDate;
    endDate = body.endDate;
  } catch {
    // Default to current month if no body provided
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate = `${firstDay.getDate().toString().padStart(2, '0')}/${(firstDay.getMonth() + 1).toString().padStart(2, '0')}/${firstDay.getFullYear()}`;
    endDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
  }

  console.log(`[ERP] Buscando vendas de ${startDate} até ${endDate}`);

  try {
    // ============================================
    // STEP 1: Authentication (GET with query params)
    // IMPORTANT: Do NOT generate or override cookies/device_id.
    // We capture ERPSession + device_id returned by the ERP and reuse them.
    // ============================================
    const loginUrl = `${erpBaseUrl}/api/auth/login?email=${encodeURIComponent(erpEmail)}&password=${encodeURIComponent(erpPassword)}`;

    console.log('[ERP] Autenticando...');

    const loginResponse = await fetch(loginUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    const loginText = await loginResponse.text();
    console.log('[ERP] Login response status:', loginResponse.status);
    
    // Log all response headers for debugging
    const loginHeaders: Record<string, string> = {};
    loginResponse.headers.forEach((value, key) => {
      loginHeaders[key] = value;
    });
    console.log('[ERP] Login response headers:', JSON.stringify(loginHeaders));
    
    let loginResult: ERPLoginResponse;
    try {
      loginResult = JSON.parse(loginText);
    } catch {
      console.error('[ERP] Falha ao parsear resposta de login:', loginText.substring(0, 200));
      return new Response(
        JSON.stringify({ success: false, error: 'Resposta inválida do servidor ERP no login' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!loginResult.success || !loginResult.data?.token) {
      console.error('[ERP] Login falhou:', JSON.stringify(loginResult));
      return new Response(
        JSON.stringify({ success: false, error: 'Falha na autenticação com o ERP. Verifique email e senha.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwtToken = loginResult.data.token;
    const { cookies: sessionCookies, cookieHeader, rawCookies } = extractAllCookies(loginResponse);

    console.log('[ERP] Login OK. Usuário:', loginResult.data.user?.name);
    console.log('[ERP] Token JWT (primeiros 50 chars):', jwtToken.substring(0, 50) + '...');
    console.log('[ERP] Cookies capturados:', JSON.stringify(sessionCookies));
    console.log('[ERP] Cookie header montado:', cookieHeader);

    if (!sessionCookies.ERPSession || !sessionCookies.device_id) {
      console.warn('[ERP] Cookies incompletos no login. Raw cookies:', JSON.stringify(rawCookies));
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Sessão do ERP incompleta: ERPSession/device_id ausentes no login',
          debug: { rawCookies },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // STEP 2: Fetch Sales (POST with Bearer token)
    // Spec: Authorization: Bearer + Cookie: ERPSession + device_id (same as login)
    // The ERP validates the combination of: JWT + ERPSession + device_id
    // ============================================
    const salesUrl = `${erpBaseUrl}/api/vendas/vendasEmissorExpandido`;

    // Headers must match exactly what a browser would send
    const salesHeaders = new Headers();
    salesHeaders.set('Content-Type', 'application/json');
    salesHeaders.set('Accept', 'application/json');
    salesHeaders.set('Authorization', `Bearer ${jwtToken}`);
    salesHeaders.set('Cookie', cookieHeader);
    salesHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    salesHeaders.set('Accept-Language', 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7');
    salesHeaders.set('Origin', erpBaseUrl);
    salesHeaders.set('Referer', `${erpBaseUrl}/`);

    const salesBody = {
      StartDate: startDate,
      EndDate: endDate,
    };

    console.log('[ERP] Buscando vendas...', JSON.stringify(salesBody));
    
    // Log the exact headers being sent
    const headersObj: Record<string, string> = {};
    salesHeaders.forEach((value, key) => {
      headersObj[key] = key.toLowerCase() === 'authorization' 
        ? `Bearer ${jwtToken.substring(0, 20)}...` 
        : value;
    });
    console.log('[ERP] Headers enviados:', JSON.stringify(headersObj));

    const salesResponse = await fetch(salesUrl, {
      method: 'POST',
      headers: salesHeaders,
      body: JSON.stringify(salesBody),
    });

    const salesText = await salesResponse.text();
    console.log('[ERP] Sales response status:', salesResponse.status);
    
    // Log sales response headers for debugging
    const salesRespHeaders: Record<string, string> = {};
    salesResponse.headers.forEach((value, key) => {
      salesRespHeaders[key] = value;
    });
    console.log('[ERP] Sales response headers:', JSON.stringify(salesRespHeaders));

    if (!salesResponse.ok) {
      console.error('[ERP] Erro na busca de vendas:', salesText);
      
      let errorMessage = 'Erro ao buscar vendas do ERP';
      try {
        const errorParsed = JSON.parse(salesText);
        if (typeof errorParsed?.data === 'string') errorMessage = errorParsed.data;
        else if (typeof errorParsed?.error === 'string') errorMessage = errorParsed.error;
        else if (typeof errorParsed?.message === 'string') errorMessage = errorParsed.message;
      } catch {
        if (salesText.length < 200) errorMessage = salesText;
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          httpStatus: salesResponse.status,
          debug: {
            cookiesSent: cookieHeader,
            tokenPrefix: jwtToken.substring(0, 30),
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let salesResult: { data?: Record<string, ERPSaleItem>; success?: boolean };
    try {
      salesResult = JSON.parse(salesText);
    } catch {
      console.error('[ERP] Falha ao parsear vendas:', salesText.substring(0, 200));
      return new Response(
        JSON.stringify({ success: false, error: 'Resposta inválida do servidor ERP na busca de vendas' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform the data to dashboard format
    const erpData = salesResult.data || salesResult;
    const transformedData = transformERPData(erpData as Record<string, ERPSaleItem>);
    
    console.log(`[ERP] Sucesso! ${transformedData.length} registros carregados`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: transformedData,
        count: transformedData.length,
        period: { startDate, endDate },
        user: loginResult.data.user?.name,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[ERP] Erro geral:', error);
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
