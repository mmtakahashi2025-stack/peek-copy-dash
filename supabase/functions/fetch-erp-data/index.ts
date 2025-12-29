import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SalesRequestBody {
  startDate: string; // DD/MM/YYYY format
  endDate: string;   // DD/MM/YYYY format
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

    const loginData = await loginResponse.json();
    console.log('ERP login successful');

    // Extract session cookie and authorization token
    const cookies = loginResponse.headers.get('set-cookie');
    const authToken = loginData.token || loginData.access_token || loginData.authorization;
    
    console.log('Session established, fetching sales data...');

    // Step 2: Fetch sales data using the vendasEmissorExpandido endpoint
    const salesUrl = `${erpUrl}/api/vendas/vendasEmissorExpandido`;
    
    const salesResponse = await fetch(salesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authToken || '',
        'Cookie': cookies || '',
      },
      body: JSON.stringify({
        StartDate: startDate,
        EndDate: endDate,
      }),
    });

    if (!salesResponse.ok) {
      console.error('ERP sales fetch failed:', salesResponse.status, await salesResponse.text());
      return new Response(
        JSON.stringify({ error: 'Failed to fetch sales data from ERP API' }),
        { status: salesResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const salesData = await salesResponse.json();
    console.log('Sales data fetched successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: salesData,
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
