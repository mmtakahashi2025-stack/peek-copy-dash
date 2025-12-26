import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SheetRow {
  [key: string]: string | number;
}

function parseDelimited(text: string, delimiter: string = ','): SheetRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  
  // First line is headers
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  
  const rows: SheetRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const row: SheetRow = {};
    
    headers.forEach((header, index) => {
      const value = values[index] || '';
      // Try to parse as number (handle Brazilian format with comma as decimal)
      const cleanValue = value.replace(/\./g, '').replace(',', '.');
      const numValue = parseFloat(cleanValue);
      row[header] = isNaN(numValue) ? value : numValue;
    });
    
    rows.push(row);
  }
  
  return rows;
}

// Validate that URL is a Google Sheets URL to prevent SSRF attacks
function isValidGoogleSheetsUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'docs.google.com' && 
           parsedUrl.pathname.includes('/spreadsheets/');
  } catch {
    return false;
  }
}

// Extract spreadsheet id from common Google Sheets URL formats
// Supports:
// - https://docs.google.com/spreadsheets/d/<ID>/...
// - https://docs.google.com/spreadsheets/d/e/<ID>/...
function extractSpreadsheetId(sheetUrl: string): string | null {
  try {
    const parsedUrl = new URL(sheetUrl);
    const parts = parsedUrl.pathname.split('/').filter(Boolean);

    const dIndex = parts.indexOf('d');
    if (dIndex === -1) return null;

    const next = parts[dIndex + 1];
    if (!next) return null;

    if (next === 'e') {
      return parts[dIndex + 2] ?? null;
    }

    return next;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT token for authentication (platform verification is disabled; we validate here)
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader) {
      console.error('Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : authHeader.trim();
    if (!token) {
      console.error('Missing bearer token');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // IMPORTANT: pass the access token explicitly; edge runtime has no persisted session
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error:', authError?.message || 'No user found');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { sheetUrl, sheetName } = await req.json();
    
    if (!sheetUrl) {
      return new Response(
        JSON.stringify({ error: 'URL da planilha é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL to prevent SSRF attacks - only allow Google Sheets URLs
    if (!isValidGoogleSheetsUrl(sheetUrl)) {
      console.error('Invalid URL attempted:', sheetUrl);
      return new Response(
        JSON.stringify({ error: 'Apenas URLs do Google Sheets são permitidas' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detect format and prepare URL
    let fetchUrl = sheetUrl;
    let delimiter = ',';
    
    // Check if it's already a published URL with output format
    if (sheetUrl.includes('output=tsv')) {
      delimiter = '\t';
      fetchUrl = sheetUrl;
    } else if (sheetUrl.includes('output=csv')) {
      delimiter = ',';
      fetchUrl = sheetUrl;
    } else if (sheetUrl.includes('/pub?')) {
      // Published URL without format - use as is
      fetchUrl = sheetUrl;
      delimiter = '\t'; // Default pub format is often TSV
    } else if (sheetUrl.includes('docs.google.com/spreadsheets')) {
      // Convert common Sheets URLs to export URL
      const sheetId = extractSpreadsheetId(sheetUrl);
      if (!sheetId) {
        return new Response(
          JSON.stringify({ error: 'Formato de URL inválido. Use o link de compartilhamento ou de publicação da planilha.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const gidParam = sheetName ? `&gid=${encodeURIComponent(sheetName)}` : '';
      fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;
    }

    console.log('Fetching from:', fetchUrl, 'delimiter:', delimiter === '\t' ? 'TAB' : 'COMMA');

    const response = await fetch(fetchUrl);
    
    if (!response.ok) {
      // Log full details server-side for debugging
      console.error('Failed to fetch sheet:', {
        status: response.status,
        statusText: response.statusText,
        url: fetchUrl
      });
      // Return generic message to client - no details exposed
      return new Response(
        JSON.stringify({ 
          error: 'Não foi possível acessar a planilha. Verifique se ela está publicada na web.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = await response.text();
    console.log('Data fetched, length:', text.length);
    
    // Auto-detect delimiter if not already determined
    const firstLine = text.split('\n')[0];
    if (firstLine.includes('\t')) {
      delimiter = '\t';
    }
    
    const data = parseDelimited(text, delimiter);
    console.log('Parsed rows:', data.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data,
        rowCount: data.length,
        columns: data.length > 0 ? Object.keys(data[0]) : []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    // Log full error server-side for debugging
    console.error('Error fetching sheet:', error);
    // Return generic message to client - no error details exposed
    return new Response(
      JSON.stringify({ error: 'Erro ao processar a planilha' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
