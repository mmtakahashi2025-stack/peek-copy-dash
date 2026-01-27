import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

// Filiais permitidas para filtro de dados
const ALLOWED_FILIAIS = [
  'Combo Iguassu',
  'Combo Iguassu Agências',
  'Combo Iguassu Cataratas',
  'Combo Iguassu Web',
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SystemSettingsRow = {
  setting_key: string;
  setting_value: string | null;
  encrypted_value: string | null;
};

// deno-lint-ignore no-explicit-any
async function getSystemErpCredentials(admin: any): Promise<{
  email: string | null;
  password: string | null;
}> {
  const { data, error } = await admin
    .from('system_settings')
    .select('setting_key, setting_value, encrypted_value')
    .in('setting_key', ['erp_email', 'erp_password']);

  if (error) throw error;

  const rows = (data ?? []) as SystemSettingsRow[];
  const emailRow = rows.find((r: SystemSettingsRow) => r.setting_key === 'erp_email');
  const passwordRow = rows.find((r: SystemSettingsRow) => r.setting_key === 'erp_password');

  const email = (emailRow?.setting_value ?? '').trim();
  const encryptedPassword = passwordRow?.encrypted_value ?? null;

  if (email && encryptedPassword) {
    const { data: decrypted, error: decError } = await admin.rpc('decrypt_erp_password', {
      encrypted_password: encryptedPassword,
    }) as { data: string | null; error: unknown };

    if (!decError && typeof decrypted === 'string' && decrypted.trim()) {
      return { email, password: decrypted };
    }
  }

  return { email: null, password: null };
}

interface ERPSaleItem {
  Empresa: string;
  Emissor: string;
  Venda_Id: number;
  DataStatus: string;
  ResumoVenda: string;
  ItemDescricao: string;
  ProdutoTipo: string;
  Qtde: number;
  ValorUnitario: number;
  BrutoItem: number;
  RateioDesconto: number;
  LiquidoItem: number;
  Comissao: number;
  CustoTotalItem: number;
  PercLucroItem: number;
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
      if (erpMatch) erpSession = erpMatch[1];
      const deviceMatch = value.match(/device_id=([^;]+)/);
      if (deviceMatch) deviceId = deviceMatch[1];
    }
  });
  
  return { ERPSession: erpSession, device_id: deviceId };
}

// Format date to DD/MM/YYYY
function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Parse date in DD/MM/YYYY format
function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

const ERP_API_LIMIT = 5000;
const WEEKLY_DELAY_MS = 100;
const REQUEST_TIMEOUT_MS = 25000;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function generateWeeklyPeriods(monthStart: Date, monthEnd: Date): Array<{ start: string; end: string }> {
  const periods: Array<{ start: string; end: string }> = [];
  let current = new Date(monthStart);
  
  while (current <= monthEnd) {
    const periodStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const periodEnd = weekEnd > monthEnd ? monthEnd : weekEnd;
    
    periods.push({ start: formatDate(periodStart), end: formatDate(periodEnd) });
    current.setDate(current.getDate() + 7);
  }
  
  return periods;
}

interface AuthResult {
  success: boolean;
  token?: string;
  cookies?: { ERPSession: string; device_id: string };
  error?: string;
}

async function authenticateERP(erpBaseUrl: string, email: string, password: string): Promise<AuthResult> {
  const loginUrl = `${erpBaseUrl}/auth/login`;
  
  const loginResponse = await fetchWithTimeout(loginUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ email, password }),
  }, REQUEST_TIMEOUT_MS);

  const loginText = await loginResponse.text();
  
  let loginResult;
  try {
    loginResult = JSON.parse(loginText);
  } catch {
    return { success: false, error: 'Resposta inválida do ERP' };
  }

  if (!loginResult.success || !loginResult.data?.token) {
    return { success: false, error: 'Credenciais inválidas' };
  }

  const cookies = extractCookiesFromHeaders(loginResponse.headers);
  
  if (!cookies.ERPSession || !cookies.device_id) {
    return { success: false, error: 'Sessão do ERP incompleta' };
  }

  return {
    success: true,
    token: loginResult.data.token,
    cookies: { ERPSession: cookies.ERPSession, device_id: cookies.device_id },
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

  const salesResponse = await fetchWithTimeout(salesUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ StartDate: startDate, EndDate: endDate }),
  }, REQUEST_TIMEOUT_MS);

  const salesText = await salesResponse.text();

  if (!salesResponse.ok) {
    return { success: false, error: 'Erro ao buscar vendas' };
  }

  let salesResult;
  try {
    salesResult = JSON.parse(salesText);
  } catch {
    return { success: false, error: 'Resposta inválida do ERP' };
  }

  const erpData = salesResult.data || salesResult;
  const transformedData = transformERPData(erpData as Record<string, ERPSaleItem>);
  
  return { success: true, data: transformedData };
}

async function fetchMonthData(
  erpBaseUrl: string,
  token: string,
  cookies: { ERPSession: string; device_id: string },
  year: number,
  month: number
): Promise<TransformedSaleRow[]> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // Last day of month
  
  const startDate = formatDate(monthStart);
  const endDate = formatDate(monthEnd);
  
  console.log(`[RELOAD] Buscando ${month.toString().padStart(2, '0')}/${year}...`);
  
  const result = await fetchSalesForPeriod(erpBaseUrl, token, cookies, startDate, endDate);
  
  if (!result.success || !result.data) {
    console.error(`[RELOAD] Erro em ${month}/${year}: ${result.error}`);
    return [];
  }
  
  // If API limit hit, use weekly pagination
  if (result.data.length >= ERP_API_LIMIT) {
    console.log(`[RELOAD] Limite atingido em ${month}/${year}, usando paginação semanal...`);
    
    const weeklyPeriods = generateWeeklyPeriods(monthStart, monthEnd);
    let allData: TransformedSaleRow[] = [];
    
    for (let i = 0; i < weeklyPeriods.length; i++) {
      if (i > 0) await delay(WEEKLY_DELAY_MS);
      
      const weekResult = await fetchSalesForPeriod(
        erpBaseUrl, token, cookies,
        weeklyPeriods[i].start, weeklyPeriods[i].end
      );
      
      if (weekResult.success && weekResult.data) {
        allData.push(...weekResult.data);
      }
    }
    
    return allData;
  }
  
  return result.data;
}

function calculateAggregates(data: TransformedSaleRow[], year: number, month: number): Array<{
  year: number;
  month: number;
  filial: string;
  colaborador: string | null;
  faturamento: number;
  quantidade_vendas: number;
}> {
  // Aggregate by filial and colaborador
  const aggregateMap = new Map<string, { faturamento: number; vendas: Set<number> }>();
  
  for (const row of data) {
    const key = `${row.Filial}|${row.Emissor}`;
    const existing = aggregateMap.get(key) || { faturamento: 0, vendas: new Set<number>() };
    
    // Apply revenue filtering logic for Combo Iguassu Web
    if (row.Filial === 'Combo Iguassu Web' && row.Tipo === 'PC') {
      // Skip PC items for Web branch revenue calculation
    } else {
      existing.faturamento += row.Líquido || 0;
    }
    existing.vendas.add(row['Venda #']);
    
    aggregateMap.set(key, existing);
  }
  
  const results: Array<{
    year: number;
    month: number;
    filial: string;
    colaborador: string | null;
    faturamento: number;
    quantidade_vendas: number;
  }> = [];
  
  for (const [key, value] of aggregateMap) {
    const [filial, colaborador] = key.split('|');
    results.push({
      year,
      month,
      filial,
      colaborador,
      faturamento: value.faturamento,
      quantidade_vendas: value.vendas.size,
    });
  }
  
  // Also add "todas" filial aggregate
  const allFilials = { faturamento: 0, vendas: new Set<number>() };
  for (const row of data) {
    if (row.Filial === 'Combo Iguassu Web' && row.Tipo === 'PC') {
      // Skip
    } else {
      allFilials.faturamento += row.Líquido || 0;
    }
    allFilials.vendas.add(row['Venda #']);
  }
  
  results.push({
    year,
    month,
    filial: 'todas',
    colaborador: null,
    faturamento: allFilials.faturamento,
    quantidade_vendas: allFilials.vendas.size,
  });
  
  return results;
}

// Generate list of months between start and end
function generateMonthRange(startYear: number, startMonth: number, endYear: number, endMonth: number): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  
  let year = startYear;
  let month = startMonth;
  
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push({ year, month });
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  
  return months;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // JWT verification - require admin
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.replace('Bearer ', '').trim();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: claimsData, error: authError } = await supabaseClient.auth.getClaims(token);
  if (authError || !claimsData?.claims) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const userId = claimsData.claims.sub as string;
  console.log('[RELOAD] User:', userId);

  // Check admin role
  const { data: roleData } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .single();

  if (!roleData) {
    return new Response(
      JSON.stringify({ error: 'Apenas administradores podem recarregar o cache' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Parse request
  let startYear = 2023;
  let startMonth = 1;
  let endYear = 2026;
  let endMonth = 1;
  
  try {
    const body = await req.json();
    if (body.startYear) startYear = body.startYear;
    if (body.startMonth) startMonth = body.startMonth;
    if (body.endYear) endYear = body.endYear;
    if (body.endMonth) endMonth = body.endMonth;
  } catch {
    // Use defaults
  }

  console.log(`[RELOAD] Período: ${startMonth}/${startYear} até ${endMonth}/${endYear}`);

  // Get ERP credentials
  const creds = await getSystemErpCredentials(adminClient);
  if (!creds.email || !creds.password) {
    return new Response(
      JSON.stringify({ error: 'Credenciais ERP não configuradas' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const erpBaseUrl = 'https://api.hoteltarobafoz.com.br/erp-json';

  // Authenticate with ERP
  const authResult = await authenticateERP(erpBaseUrl, creds.email, creds.password);
  if (!authResult.success || !authResult.token || !authResult.cookies) {
    return new Response(
      JSON.stringify({ error: authResult.error || 'Erro de autenticação ERP' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('[RELOAD] Autenticado no ERP');

  const months = generateMonthRange(startYear, startMonth, endYear, endMonth);
  console.log(`[RELOAD] Total de meses: ${months.length}`);

  const results: Array<{ year: number; month: number; records: number; status: string }> = [];

  for (const { year, month } of months) {
    try {
      // Fetch data from ERP
      const rawData = await fetchMonthData(erpBaseUrl, authResult.token, authResult.cookies, year, month);
      
      // Filter by allowed filiais
      const filteredData = rawData.filter(row => ALLOWED_FILIAIS.includes(row.Filial));
      
      console.log(`[RELOAD] ${month}/${year}: ${filteredData.length} registros`);
      
      // Delete existing cache for this month
      await adminClient
        .from('erp_cache')
        .delete()
        .eq('year', year)
        .eq('month', month);
      
      // Delete existing aggregates for this month
      await adminClient
        .from('erp_monthly_aggregates')
        .delete()
        .eq('year', year)
        .eq('month', month);
      
      // Insert new cache data
      const dataJson = JSON.stringify(filteredData);
      const dataSize = new TextEncoder().encode(dataJson).length;
      
      await adminClient
        .from('erp_cache')
        .insert({
          year,
          month,
          data: filteredData,
          record_count: filteredData.length,
          data_size: dataSize,
          user_id: null, // Global cache
        });
      
      // Calculate and insert aggregates
      const aggregates = calculateAggregates(filteredData, year, month);
      
      if (aggregates.length > 0) {
        await adminClient
          .from('erp_monthly_aggregates')
          .insert(aggregates);
      }
      
      results.push({ year, month, records: filteredData.length, status: 'success' });
      
      // Small delay between months to avoid rate limiting
      await delay(500);
      
    } catch (err) {
      console.error(`[RELOAD] Erro em ${month}/${year}:`, err);
      results.push({ year, month, records: 0, status: 'error' });
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const totalRecords = results.reduce((sum, r) => sum + r.records, 0);

  console.log(`[RELOAD] Concluído: ${successCount}/${months.length} meses, ${totalRecords} registros`);

  return new Response(
    JSON.stringify({ 
      success: true,
      monthsProcessed: successCount,
      totalMonths: months.length,
      totalRecords,
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
