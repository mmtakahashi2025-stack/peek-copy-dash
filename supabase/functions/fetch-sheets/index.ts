import "https://deno.land/x/xhr@0.1.0/mod.ts";

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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sheetUrl, sheetName } = await req.json();
    
    if (!sheetUrl) {
      return new Response(
        JSON.stringify({ error: 'URL da planilha é obrigatória' }),
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
      // Convert edit URL to export URL
      const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!sheetIdMatch) {
        return new Response(
          JSON.stringify({ error: 'Formato de URL inválido. Use o link de compartilhamento da planilha.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const sheetId = sheetIdMatch[1];
      const gidParam = sheetName ? `&gid=${sheetName}` : '';
      fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;
    }

    console.log('Fetching from:', fetchUrl, 'delimiter:', delimiter === '\t' ? 'TAB' : 'COMMA');

    const response = await fetch(fetchUrl);
    
    if (!response.ok) {
      console.error('Failed to fetch sheet:', response.status, response.statusText);
      return new Response(
        JSON.stringify({ 
          error: 'Não foi possível acessar a planilha. Verifique se ela está publicada na web.',
          details: `Status: ${response.status}` 
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
    console.error('Error fetching sheet:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Erro ao processar a planilha', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
