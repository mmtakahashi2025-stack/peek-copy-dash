import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SalesRequestBody {
  startDate: string;
  endDate: string;
  email?: string;
  password?: string;
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

function extractCookiesFromHeaders(headers: Headers): { ERPSession: string | null; device_id: string | null } {
  let erpSession: string | null = null;
  let deviceId: string | null = null;
  
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      const erpMatch = value.match(/ERPSession=([^;]+)/);
      if (erpMatch) {
        erpSession = erpMatch[1];
      }
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

  // ERP API base URL - hardcoded
  const erpBaseUrl = 'https://api.hoteltarobafoz.com.br/erp-json';

  // Parse request body
  let startDate: string;
  let endDate: string;
  let userEmail: string | undefined;
  let userPassword: string | undefined;
  
  try {
    const body: SalesRequestBody = await req.json();
    startDate = body.startDate;
    endDate = body.endDate;
    userEmail = body.email;
    userPassword = body.password;
  } catch {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate = `${firstDay.getDate().toString().padStart(2, '0')}/${(firstDay.getMonth() + 1).toString().padStart(2, '0')}/${firstDay.getFullYear()}`;
    endDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
  }

  // Use user credentials if provided, otherwise fall back to env
  const erpEmail = userEmail || Deno.env.get('ERP_API_EMAIL');
  const erpPassword = userPassword || Deno.env.get('ERP_API_PASSWORD');

  if (!erpEmail || !erpPassword) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Credenciais do ERP não configuradas. Configure sua senha do ERP nas configurações.',
        needsCredentials: true
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('[ERP] Buscando vendas de', startDate, 'até', endDate);
  console.log('[ERP] Usando credenciais do usuário:', userEmail ? 'SIM' : 'NÃO (fallback env)');

  try {
    // STEP 1: LOGIN
    const loginUrl = `${erpBaseUrl}/auth/login?email=${encodeURIComponent(erpEmail)}&password=${encodeURIComponent(erpPassword)}`;

    console.log('[ERP] Autenticando...');

    const loginResponse = await fetch(loginUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    console.log('[ERP] Login status:', loginResponse.status);

    const loginText = await loginResponse.text();
    
    let loginResult: ERPLoginResponse;
    try {
      loginResult = JSON.parse(loginText);
    } catch {
      console.error('[ERP] Resposta inválida:', loginText.substring(0, 200));
      return new Response(
        JSON.stringify({ success: false, error: 'Resposta inválida do ERP no login' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!loginResult.success || !loginResult.data?.token) {
      console.error('[ERP] Login falhou:', JSON.stringify(loginResult));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Credenciais inválidas. Verifique seu email e senha do ERP.',
          invalidCredentials: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract cookies
    const cookies = extractCookiesFromHeaders(loginResponse.headers);
    
    console.log('[ERP] Login OK. Usuário:', loginResult.data.user?.name);

    if (!cookies.ERPSession || !cookies.device_id) {
      console.error('[ERP] Cookies incompletos');
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão do ERP incompleta' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 2: FETCH SALES
    const jwtToken = loginResult.data.token;
    const cookieHeader = `ERPSession=${cookies.ERPSession}; device_id=${cookies.device_id}`;
    const salesUrl = `${erpBaseUrl}/vendas/vendasEmissorExpandido`;
    const salesBody = JSON.stringify({
      StartDate: startDate,
      EndDate: endDate,
    });

    console.log('[ERP] Buscando vendas...');

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

    console.log('[ERP] Sales status:', salesResponse.status);

    const salesText = await salesResponse.text();

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
    
    console.log(`[ERP] Sucesso! ${transformedData.length} registros`);

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
    console.error('[ERP] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
