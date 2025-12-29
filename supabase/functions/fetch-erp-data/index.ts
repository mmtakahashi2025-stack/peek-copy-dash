import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SalesRequestBody {
  startDate: string;
  endDate: string;
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

// Extract cookies from Set-Cookie headers without using getSetCookie()
function extractCookiesFromHeaders(headers: Headers): { ERPSession: string | null; device_id: string | null } {
  let erpSession: string | null = null;
  let deviceId: string | null = null;
  
  // Iterate through all headers to find set-cookie
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      // Check for ERPSession
      const erpMatch = value.match(/ERPSession=([^;]+)/);
      if (erpMatch) {
        erpSession = erpMatch[1];
      }
      // Check for device_id
      const deviceMatch = value.match(/device_id=([^;]+)/);
      if (deviceMatch) {
        deviceId = deviceMatch[1];
      }
    }
  });
  
  return { ERPSession: erpSession, device_id: deviceId };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let erpBaseUrl = Deno.env.get('ERP_API_URL') || '';
  const erpEmail = Deno.env.get('ERP_API_EMAIL');
  const erpPassword = Deno.env.get('ERP_API_PASSWORD');

  if (!erpBaseUrl || !erpEmail || !erpPassword) {
    return new Response(
      JSON.stringify({ success: false, error: 'Credenciais do ERP não configuradas' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Normalizar a URL base - remover caminhos duplicados se existirem
  // A URL base deve ser apenas: https://www.bitstorm.com.br/projetos/grupotaroba/erp/erp-json
  if (erpBaseUrl.includes('/api/auth/login')) {
    erpBaseUrl = erpBaseUrl.replace('/api/auth/login', '');
  }
  if (erpBaseUrl.endsWith('/')) {
    erpBaseUrl = erpBaseUrl.slice(0, -1);
  }

  console.log('[CONFIG] ERP Base URL normalizada:', erpBaseUrl);

  let startDate: string;
  let endDate: string;
  
  try {
    const body: SalesRequestBody = await req.json();
    startDate = body.startDate;
    endDate = body.endDate;
  } catch {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate = `${firstDay.getDate().toString().padStart(2, '0')}/${(firstDay.getMonth() + 1).toString().padStart(2, '0')}/${firstDay.getFullYear()}`;
    endDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
  }

  console.log('='.repeat(60));
  console.log('[VALIDAÇÃO] Iniciando execução da edge function');
  console.log('[VALIDAÇÃO] Período:', startDate, 'até', endDate);
  console.log('='.repeat(60));

  try {
    // ============================================
    // STEP 1: LOGIN
    // ============================================
    const loginUrl = `${erpBaseUrl}/api/auth/login?email=${encodeURIComponent(erpEmail)}&password=${encodeURIComponent(erpPassword)}`;

    console.log('[LOGIN] URL:', loginUrl.replace(erpPassword, '***'));
    console.log('[LOGIN] Method: GET');

    const loginResponse = await fetch(loginUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    console.log('[LOGIN] Response Status:', loginResponse.status);

    // Log all response headers
    console.log('[LOGIN] Response Headers:');
    loginResponse.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });

    const loginText = await loginResponse.text();
    
    let loginResult: ERPLoginResponse;
    try {
      loginResult = JSON.parse(loginText);
    } catch {
      console.error('[LOGIN] Resposta não é JSON:', loginText.substring(0, 300));
      return new Response(
        JSON.stringify({ success: false, error: 'Resposta inválida do ERP no login' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!loginResult.success || !loginResult.data?.token) {
      console.error('[LOGIN] Falhou:', JSON.stringify(loginResult));
      return new Response(
        JSON.stringify({ success: false, error: 'Falha na autenticação' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // EXTRAÇÃO DE COOKIES DO LOGIN
    // ============================================
    console.log('');
    console.log('[COOKIES] Extraindo cookies do Set-Cookie do login...');
    
    const cookies = extractCookiesFromHeaders(loginResponse.headers);
    
    console.log('[COOKIES] ERPSession extraído:', cookies.ERPSession);
    console.log('[COOKIES] device_id extraído:', cookies.device_id);

    if (!cookies.ERPSession || !cookies.device_id) {
      console.error('[COOKIES] FALHA: Cookies incompletos!');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Sessão incompleta: ERPSession ou device_id ausentes',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // MONTAGEM DO HEADER COOKIE PARA O POST
    // ============================================
    const jwtToken = loginResult.data.token;
    const cookieHeader = `ERPSession=${cookies.ERPSession}; device_id=${cookies.device_id}`;
    
    console.log('');
    console.log('[VALIDAÇÃO] JWT extraído de data.token:', jwtToken.substring(0, 50) + '...');
    console.log('[VALIDAÇÃO] Cookie header montado:', cookieHeader);

    // ============================================
    // STEP 2: POST DE VENDAS
    // ============================================
    const salesUrl = `${erpBaseUrl}/api/vendas/vendasEmissorExpandido`;
    const salesBody = JSON.stringify({
      StartDate: startDate,
      EndDate: endDate,
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('[VENDAS] REQUEST COMPLETO:');
    console.log('='.repeat(60));
    console.log('[VENDAS] URL:', salesUrl);
    console.log('[VENDAS] Method: POST');
    console.log('[VENDAS] Headers:');
    console.log('  Content-Type: application/json');
    console.log('  Accept: application/json');
    console.log(`  Authorization: Bearer ${jwtToken.substring(0, 30)}...`);
    console.log(`  Cookie: ${cookieHeader}`);
    console.log('[VENDAS] Body:', salesBody);
    console.log('='.repeat(60));

    const salesResponse = await fetch(salesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0',
      },
      body: salesBody,
    });

    console.log('');
    console.log('[VENDAS] Response Status:', salesResponse.status);

    const salesText = await salesResponse.text();
    console.log('[VENDAS] Response Body:', salesText.substring(0, 500));

    if (!salesResponse.ok) {
      let errorMessage = 'Erro ao buscar vendas';
      try {
        const errorParsed = JSON.parse(salesText);
        errorMessage = errorParsed?.data || errorParsed?.error || errorParsed?.message || errorMessage;
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
      return new Response(
        JSON.stringify({ success: false, error: 'Resposta inválida do ERP' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const erpData = salesResult.data || salesResult;
    const transformedData = transformERPData(erpData as Record<string, ERPSaleItem>);
    
    console.log(`[VENDAS] Sucesso! ${transformedData.length} registros`);

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
    console.error('[ERRO]', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
