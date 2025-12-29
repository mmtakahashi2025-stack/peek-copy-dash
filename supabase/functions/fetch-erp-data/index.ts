import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    console.log('Attempting to authenticate with ERP API...');

    // Step 1: Authenticate with the ERP API
    const loginUrl = `${erpUrl}/api/auth/login?email=${encodeURIComponent(erpEmail)}&password=${encodeURIComponent(erpPassword)}`;
    
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

    // Extract session cookie or token from response
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('Session established');

    // Step 2: Parse request body to get endpoint and parameters
    let endpoint = '/api/products'; // default endpoint
    let params = {};
    
    try {
      const body = await req.json();
      endpoint = body.endpoint || endpoint;
      params = body.params || {};
    } catch {
      // Use defaults if no body provided
    }

    // Step 3: Fetch data from the ERP API using the session
    const queryString = new URLSearchParams(params as Record<string, string>).toString();
    const dataUrl = `${erpUrl}${endpoint}${queryString ? '?' + queryString : ''}`;
    
    console.log('Fetching data from:', endpoint);

    const dataResponse = await fetch(dataUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cookie': cookies || '',
      },
    });

    if (!dataResponse.ok) {
      console.error('ERP data fetch failed:', dataResponse.status);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch data from ERP API' }),
        { status: dataResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await dataResponse.json();
    console.log('Data fetched successfully');

    return new Response(
      JSON.stringify({ success: true, data, loginData }),
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
