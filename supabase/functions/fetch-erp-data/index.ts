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
  usePagination?: boolean; // Enable monthly pagination for large date ranges
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

// Parse date in DD/MM/YYYY format
function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

// Format date to DD/MM/YYYY
function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// ERP API limit - if we hit this, we need finer pagination
const ERP_API_LIMIT = 5000;

// Concurrency limits (tuned for performance vs rate limiting)
const MONTH_CONCURRENCY = 6;
const WEEK_CONCURRENCY = 4;

// Generate weekly periods for a given month
function generateWeeklyPeriods(monthStart: Date, monthEnd: Date): Array<{ start: string; end: string }> {
  const periods: Array<{ start: string; end: string }> = [];
  let current = new Date(monthStart);
  
  while (current <= monthEnd) {
    const periodStart = new Date(current);
    // End of week (7 days) or end of month, whichever is earlier
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const periodEnd = weekEnd > monthEnd ? monthEnd : weekEnd;
    
    periods.push({
      start: formatDate(periodStart),
      end: formatDate(periodEnd),
    });
    
    // Move to next week
    current.setDate(current.getDate() + 7);
  }
  
  return periods;
}

// Generate monthly periods between two dates
function generateMonthlyPeriods(startDate: string, endDate: string): Array<{ start: string; end: string }> {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const periods: Array<{ start: string; end: string }> = [];
  
  let current = new Date(start);
  
  while (current <= end) {
    const periodStart = new Date(current);
    const periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0); // Last day of month
    
    // If this is the first period, use the original start date
    const actualStart = periods.length === 0 ? start : periodStart;
    // If this period goes beyond the end date, use the end date
    const actualEnd = periodEnd > end ? end : periodEnd;
    
    periods.push({
      start: formatDate(actualStart),
      end: formatDate(actualEnd),
    });
    
    // Move to first day of next month
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }
  
  return periods;
}

// Check if date range spans more than one month
function isLargeDateRange(startDate: string, endDate: string): boolean {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return diffMonths >= 1;
}

interface AuthResult {
  success: boolean;
  token?: string;
  cookies?: { ERPSession: string; device_id: string };
  user?: { name: string };
  error?: string;
}

async function authenticateERP(erpBaseUrl: string, erpEmail: string, erpPassword: string): Promise<AuthResult> {
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
    return { success: false, error: 'Resposta inválida do ERP no login' };
  }

  if (!loginResult.success || !loginResult.data?.token) {
    console.error('[ERP] Login falhou:', JSON.stringify(loginResult));
    return { success: false, error: 'Credenciais inválidas' };
  }

  const cookies = extractCookiesFromHeaders(loginResponse.headers);
  
  console.log('[ERP] Login OK. Usuário:', loginResult.data.user?.name);

  if (!cookies.ERPSession || !cookies.device_id) {
    console.error('[ERP] Cookies incompletos');
    return { success: false, error: 'Sessão do ERP incompleta' };
  }

  return {
    success: true,
    token: loginResult.data.token,
    cookies: { ERPSession: cookies.ERPSession, device_id: cookies.device_id },
    user: { name: loginResult.data.user?.name || 'Unknown' },
  };
}

async function fetchSalesForPeriod(
  erpBaseUrl: string,
  token: string,
  cookies: { ERPSession: string; device_id: string },
  startDate: string,
  endDate: string
): Promise<{ success: boolean; data?: TransformedSaleRow[]; error?: string }> {
  const cookieHeader = `ERPSession=${cookies.ERPSession}; device_id=${cookies.device_id}`;
  const salesUrl = `${erpBaseUrl}/vendas/vendasEmissorExpandido`;
  const salesBody = JSON.stringify({
    StartDate: startDate,
    EndDate: endDate,
  });

  console.log(`[ERP] Buscando vendas de ${startDate} até ${endDate}...`);

  const salesResponse = await fetch(salesUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
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
    return { success: false, error: errorMessage };
  }

  let salesResult: { data?: Record<string, ERPSaleItem>; success?: boolean };
  try {
    salesResult = JSON.parse(salesText);
  } catch {
    return { success: false, error: 'Resposta inválida do ERP' };
  }

  const erpData = salesResult.data || salesResult;
  const transformedData = transformERPData(erpData as Record<string, ERPSaleItem>);
  
  console.log(`[ERP] Período ${startDate}-${endDate}: ${transformedData.length} registros`);

  return { success: true, data: transformedData };
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
  let usePagination = true; // Default to true for automatic pagination
  
  try {
    const body: SalesRequestBody = await req.json();
    startDate = body.startDate;
    endDate = body.endDate;
    userEmail = body.email;
    userPassword = body.password;
    if (typeof body.usePagination === 'boolean') {
      usePagination = body.usePagination;
    }
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
  console.log('[ERP] Paginação mensal:', usePagination ? 'SIM' : 'NÃO');

  try {
    // STEP 1: LOGIN
    const authResult = await authenticateERP(erpBaseUrl, erpEmail, erpPassword);
    
    if (!authResult.success || !authResult.token || !authResult.cookies) {
      const isInvalidCreds = authResult.error?.includes('Credenciais inválidas');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: authResult.error || 'Erro de autenticação',
          invalidCredentials: isInvalidCreds
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 2: FETCH SALES (with or without pagination)
    let allData: TransformedSaleRow[] = [];
    
    // Check if we should use pagination (for large date ranges)
    const shouldPaginate = usePagination && isLargeDateRange(startDate, endDate);
    
    if (shouldPaginate) {
      // Use monthly pagination with parallel requests
      const periods = generateMonthlyPeriods(startDate, endDate);
      console.log(`[ERP] Usando paginação mensal paralela: ${periods.length} períodos`);
      
      // Helper function to fetch a single month with weekly fallback
      const fetchMonthData = async (period: { start: string; end: string }): Promise<TransformedSaleRow[]> => {
        const result = await fetchSalesForPeriod(
          erpBaseUrl,
          authResult.token!,
          authResult.cookies!,
          period.start,
          period.end
        );
        
        if (result.success && result.data) {
          // Check if we hit the API limit - if so, use weekly pagination
          if (result.data.length >= ERP_API_LIMIT) {
            console.log(`[ERP] Limite atingido em ${period.start}-${period.end}, usando paginação semanal...`);
            
            const monthStart = parseDate(period.start);
            const monthEnd = parseDate(period.end);
            const weeklyPeriods = generateWeeklyPeriods(monthStart, monthEnd);
            
            // Fetch weeks in parallel (limited concurrency to avoid rate limiting)
            const weekResults: TransformedSaleRow[] = [];
            for (let i = 0; i < weeklyPeriods.length; i += WEEK_CONCURRENCY) {
              const batch = weeklyPeriods.slice(i, i + WEEK_CONCURRENCY);
              const batchResults = await Promise.all(
                batch.map(weekPeriod =>
                  fetchSalesForPeriod(
                    erpBaseUrl,
                    authResult.token!,
                    authResult.cookies!,
                    weekPeriod.start,
                    weekPeriod.end
                  )
                )
              );
              
              for (let j = 0; j < batchResults.length; j++) {
                const weekResult = batchResults[j];
                if (weekResult.success && weekResult.data) {
                  weekResults.push(...weekResult.data);
                  if (weekResult.data.length >= ERP_API_LIMIT) {
                    console.warn(`[ERP] AVISO: Limite atingido na semana ${batch[j].start}-${batch[j].end}. Dados podem estar incompletos.`);
                  }
                }
              }
            }
            
            console.log(`[ERP] Período ${period.start}-${period.end} com paginação semanal: ${weekResults.length} registros`);
            return weekResults;
          } else {
            console.log(`[ERP] Período ${period.start}-${period.end}: ${result.data.length} registros`);
            return result.data;
          }
        } else {
          console.error(`[ERP] Erro no período ${period.start}-${period.end}:`, result.error);
          return [];
        }
      };
      
      // Fetch months in parallel (limited concurrency to avoid rate limiting/timeouts)
      for (let i = 0; i < periods.length; i += MONTH_CONCURRENCY) {
        const batch = periods.slice(i, i + MONTH_CONCURRENCY);
        const batchResults = await Promise.all(batch.map(fetchMonthData));
        for (const monthData of batchResults) {
          allData.push(...monthData);
        }
      }
      
      console.log(`[ERP] Total após paginação: ${allData.length} registros`);
      
      // Log unique sales count for debugging
      const uniqueSales = new Set(allData.map(row => row['Venda #']));
      console.log(`[ERP] Vendas únicas: ${uniqueSales.size}`);
    } else {
      // Single request for short periods
      const result = await fetchSalesForPeriod(
        erpBaseUrl,
        authResult.token,
        authResult.cookies,
        startDate,
        endDate
      );
      
      if (!result.success) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: result.error || 'Erro ao buscar vendas'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      allData = result.data || [];
    }
    
    console.log(`[ERP] Sucesso! ${allData.length} registros totais`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: allData,
        count: allData.length,
        period: { startDate, endDate },
        user: authResult.user?.name,
        paginated: shouldPaginate,
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
