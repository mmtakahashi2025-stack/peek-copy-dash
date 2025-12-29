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

// Generate a stable device_id for the session
function generateDeviceId(): string {
  return 'lovable-erp-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// Extract cookies from Set-Cookie header(s)
function extractCookies(response: Response): string {
  const cookies: string[] = [];
  
  // Try getSetCookie method (Deno/modern browsers)
  const setCookieList =
    (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  
  if (setCookieList.length > 0) {
    for (const c of setCookieList) {
      const cookiePart = c.split(';')[0].trim();
      if (cookiePart) cookies.push(cookiePart);
    }
  } else {
    // Fallback: check set-cookie header
    const rawSetCookie = response.headers.get('set-cookie');
    if (rawSetCookie) {
      // Handle potential multiple cookies in one header (comma separated)
      const parts = rawSetCookie.split(',');
      for (const part of parts) {
        const cookiePart = part.split(';')[0].trim();
        if (cookiePart && cookiePart.includes('=')) {
          cookies.push(cookiePart);
        }
      }
    }
  }
  
  return cookies.join('; ');
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
    // Generate device_id for this session
    const deviceId = generateDeviceId();
    
    // ============================================
    // STEP 1: Authentication (GET with query params)
    // Spec: no Authorization header, send device_id cookie
    // ============================================
    const loginUrl = `${erpBaseUrl}/api/auth/login?email=${encodeURIComponent(erpEmail)}&password=${encodeURIComponent(erpPassword)}`;
    
    console.log('[ERP] Autenticando...');
    console.log('[ERP] Device ID:', deviceId);
    
    const loginResponse = await fetch(loginUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': `device_id=${deviceId}`,
      },
    });

    const loginText = await loginResponse.text();
    console.log('[ERP] Login response status:', loginResponse.status);
    
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
    const serverCookies = extractCookies(loginResponse);
    
    // Build full cookie string: server cookies + device_id
    const fullCookies = serverCookies 
      ? `${serverCookies}; device_id=${deviceId}`
      : `device_id=${deviceId}`;
    
    console.log('[ERP] Login OK. Usuário:', loginResult.data.user?.name);
    console.log('[ERP] Token JWT (primeiros 50 chars):', jwtToken.substring(0, 50) + '...');
    console.log('[ERP] Cookies do servidor:', serverCookies || 'Nenhum');
    console.log('[ERP] Cookies finais:', fullCookies);

    // ============================================
    // STEP 2: Fetch Sales (POST with Bearer token)
    // Spec: Authorization: Bearer + Cookie: ERPSession + device_id
    // ============================================
    const salesUrl = `${erpBaseUrl}/api/vendas/vendasEmissorExpandido`;
    
    // Build headers - some APIs need different auth patterns
    const salesHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${jwtToken}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': fullCookies,
    };

    const salesBody = {
      StartDate: startDate,
      EndDate: endDate,
    };

    console.log('[ERP] Buscando vendas...', JSON.stringify(salesBody));
    console.log('[ERP] Headers enviados:', JSON.stringify(Object.keys(salesHeaders)));

    const salesResponse = await fetch(salesUrl, {
      method: 'POST',
      headers: salesHeaders,
      body: JSON.stringify(salesBody),
    });

    const salesText = await salesResponse.text();
    console.log('[ERP] Sales response status:', salesResponse.status);

    if (!salesResponse.ok) {
      console.error('[ERP] Erro na busca de vendas:', salesText.substring(0, 500));
      
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
