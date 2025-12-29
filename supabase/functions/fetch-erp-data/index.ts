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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const erpBaseUrl = Deno.env.get('ERP_API_URL');
  const erpEmail = Deno.env.get('ERP_API_EMAIL');
  const erpPassword = Deno.env.get('ERP_API_PASSWORD');

  if (!erpBaseUrl || !erpEmail || !erpPassword) {
    return new Response(
      JSON.stringify({ success: false, error: 'Credenciais do ERP não configuradas' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

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

    // Captura TODOS os headers de resposta do login
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
    
    // Método 1: getSetCookie (Deno/modern browsers)
    const getSetCookieFn = (loginResponse.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
    const setCookieList = getSetCookieFn ? getSetCookieFn() : [];
    console.log('[COOKIES] getSetCookie() retornou:', setCookieList.length, 'cookies');
    setCookieList.forEach((c, i) => console.log(`  [${i}]: ${c}`));

    // Método 2: get('set-cookie') - fallback
    const rawSetCookie = loginResponse.headers.get('set-cookie');
    console.log('[COOKIES] headers.get("set-cookie"):', rawSetCookie);

    // Usar o que tiver dados
    const allCookieHeaders = setCookieList.length > 0 ? setCookieList : (rawSetCookie ? [rawSetCookie] : []);
    
    // Extrair valores SEM modificar
    let erpSessionValue: string | null = null;
    let deviceIdValue: string | null = null;
    
    for (const cookieStr of allCookieHeaders) {
      const erpMatch = cookieStr.match(/ERPSession=([^;]+)/);
      if (erpMatch) {
        erpSessionValue = erpMatch[1];
        console.log('[COOKIES] ERPSession extraído DIRETAMENTE do Set-Cookie:', erpSessionValue);
      }
      const deviceMatch = cookieStr.match(/device_id=([^;]+)/);
      if (deviceMatch) {
        deviceIdValue = deviceMatch[1];
        console.log('[COOKIES] device_id extraído DIRETAMENTE do Set-Cookie:', deviceIdValue);
      }
    }

    console.log('');
    console.log('[VALIDAÇÃO] Confirmações:');
    console.log('  - ERPSession extraído do login (sem modificação):', erpSessionValue ? 'SIM' : 'NÃO');
    console.log('  - device_id extraído do login (sem modificação):', deviceIdValue ? 'SIM' : 'NÃO');
    console.log('  - device_id está sendo recriado em algum ponto?: NÃO (só usamos o do login)');
    console.log('  - Login e vendas na MESMA execução?: SIM (mesma chamada da edge function)');

    if (!erpSessionValue || !deviceIdValue) {
      console.error('[COOKIES] FALHA: Cookies incompletos!');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Sessão incompleta: ERPSession ou device_id ausentes',
          debug: {
            setCookieCount: allCookieHeaders.length,
            rawCookies: allCookieHeaders,
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // MONTAGEM DO HEADER COOKIE PARA O POST
    // ============================================
    const jwtToken = loginResult.data.token;
    const cookieHeader = `ERPSession=${erpSessionValue}; device_id=${deviceIdValue}`;
    
    console.log('');
    console.log('[VALIDAÇÃO] JWT extraído de data.token:', jwtToken.substring(0, 50) + '...');
    console.log('[VALIDAÇÃO] Cookie header montado MANUALMENTE:', cookieHeader);
    console.log('[VALIDAÇÃO] Formato do Cookie:', 'ERPSession=<valor>; device_id=<valor>');

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
    console.log('[VENDAS] REQUEST COMPLETO DO POST:');
    console.log('='.repeat(60));
    console.log('[VENDAS] URL:', salesUrl);
    console.log('[VENDAS] Method: POST');
    console.log('[VENDAS] Headers:');
    console.log('  Content-Type: application/json');
    console.log('  Accept: application/json');
    console.log(`  Authorization: Bearer ${jwtToken.substring(0, 30)}...`);
    console.log(`  Cookie: ${cookieHeader}`);
    console.log('  User-Agent: Mozilla/5.0');
    console.log('[VENDAS] Body:', salesBody);
    console.log('='.repeat(60));

    // Confirmar que Authorization está no formato correto
    const authHeader = `Bearer ${jwtToken}`;
    console.log('[VALIDAÇÃO] Authorization header formato:', authHeader.startsWith('Bearer ') ? 'Bearer <JWT> ✓' : 'INCORRETO');

    const salesResponse = await fetch(salesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authHeader,
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0',
      },
      body: salesBody,
    });

    console.log('');
    console.log('[VENDAS] Response Status:', salesResponse.status);
    console.log('[VENDAS] Response Headers:');
    salesResponse.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });

    const salesText = await salesResponse.text();
    console.log('[VENDAS] Response Body (primeiros 500 chars):', salesText.substring(0, 500));

    // ============================================
    // CONFIRMAÇÃO FINAL
    // ============================================
    console.log('');
    console.log('='.repeat(60));
    console.log('[VALIDAÇÃO FINAL]');
    console.log('='.repeat(60));
    console.log('1. Cookie header montado manualmente no POST: SIM');
    console.log(`2. Cookie contém ERPSession=${erpSessionValue.substring(0, 10)}...: SIM`);
    console.log(`3. Cookie contém device_id=${deviceIdValue.substring(0, 10)}...: SIM`);
    console.log('4. Valores vêm do Set-Cookie do login sem modificação: SIM');
    console.log('5. device_id NÃO está sendo recriado: SIM');
    console.log('6. Login e vendas na MESMA execução: SIM');
    console.log('7. Authorization: Bearer <JWT>: SIM');
    console.log(`8. ERP retornou status ${salesResponse.status} com todos os itens acima: ${salesResponse.status === 400 ? 'SIM - ERRO 400' : 'NÃO'}`);
    console.log('='.repeat(60));

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
          validation: {
            cookieHeaderSent: cookieHeader,
            authHeaderFormat: 'Bearer <JWT>',
            sameExecution: true,
            cookiesFromLogin: true,
            deviceIdNotRegenerated: true,
          }
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
