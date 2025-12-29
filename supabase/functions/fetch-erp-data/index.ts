import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SalesRequestBody {
  startDate: string; // DD/MM/YYYY format
  endDate: string;   // DD/MM/YYYY format
}

// Transform ERP data to match the expected format
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
    Lucro: item.LucroItem,
    '% Lucro': item.PercLucroItem,
  }));
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const erpUrl = Deno.env.get('ERP_API_URL');
    const erpEmail = Deno.env.get('ERP_API_EMAIL');
    const erpPassword = Deno.env.get('ERP_API_PASSWORD');

    if (!erpUrl || !erpEmail || !erpPassword) {
      console.error('Missing ERP credentials');
      return new Response(
        JSON.stringify({ error: 'ERP credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    console.log(`Fetching sales data from ${startDate} to ${endDate}`);

    // Step 1: Authenticate with the ERP API
    const loginUrl = `${erpUrl}/api/auth/login?email=${encodeURIComponent(erpEmail)}&password=${encodeURIComponent(erpPassword)}`;
    
    console.log('Authenticating with ERP API...');
    
    const loginResponse = await fetch(loginUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!loginResponse.ok) {
      console.error('ERP login failed:', loginResponse.status, loginResponse.statusText);
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with ERP API' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const loginResult = await loginResponse.json();
    
    if (!loginResult.success || !loginResult.data?.token) {
      console.error('ERP login failed: no token received');
      return new Response(
        JSON.stringify({ error: 'Failed to get authentication token from ERP API' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authToken = loginResult.data.token;
    console.log('ERP login successful, token:', authToken.substring(0, 20) + '...');

    // Extract cookies properly (Set-Cookie includes attributes; Cookie header must be just name=value pairs)
    const setCookieList =
      (loginResponse.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const rawSetCookie = loginResponse.headers.get('set-cookie');
    const cookieHeader = (setCookieList.length ? setCookieList : rawSetCookie ? [rawSetCookie] : [])
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    console.log('Cookie header prepared:', cookieHeader ? cookieHeader : 'None');
    console.log('Session established, fetching sales data...');

    // Step 2: Fetch sales data using the vendasEmissorExpandido endpoint
    const salesUrl = `${erpUrl}/api/vendas/vendasEmissorExpandido`;
    
    // Build request headers - use Bearer token format as confirmed by user
    const salesHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'User-Agent': 'Mozilla/5.0 (compatible; LovableBot/1.0)',
    };
    
    // Add cookies if available
    if (cookieHeader) {
      salesHeaders['Cookie'] = cookieHeader;
    }
    
    console.log('Request headers (without auth token):', JSON.stringify({
      ...salesHeaders,
      'Authorization': '[REDACTED]',
    }));
    console.log('Request body:', JSON.stringify({ StartDate: startDate, EndDate: endDate }));

    const salesResponse = await fetch(salesUrl, {
      method: 'POST',
      headers: salesHeaders,
      body: JSON.stringify({
        StartDate: startDate,
        EndDate: endDate,
      }),
    });

    if (!salesResponse.ok) {
      const errorText = await salesResponse.text();
      console.error('ERP sales fetch failed:', salesResponse.status, errorText);

      let message = 'Falha ao buscar vendas no ERP';
      try {
        const parsed = JSON.parse(errorText);
        if (typeof parsed?.data === 'string' && parsed.data.trim()) message = parsed.data;
        else if (typeof parsed?.error === 'string' && parsed.error.trim()) message = parsed.error;
      } catch {
        if (errorText?.trim()) message = errorText;
      }

      // Return 200 so the frontend can read the error message (Supabase SDK treats non-2xx as opaque)
      return new Response(
        JSON.stringify({
          success: false,
          error: message,
          upstreamStatus: salesResponse.status,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const salesResult = await salesResponse.json();
    console.log('Sales data fetched successfully');

    // Transform the data to the expected format
    const erpData = salesResult.data || salesResult;
    const transformedData = transformERPData(erpData);
    
    console.log(`Transformed ${transformedData.length} sales records`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: transformedData,
        count: transformedData.length,
        period: { startDate, endDate }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in fetch-erp-data:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
