import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SystemSettingsRow = {
  setting_key: string;
  setting_value: string | null;
  encrypted_value: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // JWT verification - require authenticated user
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized - Missing authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : authHeader.trim();

  const authSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );

  const { data: claimsData, error: authError } = await authSupabase.auth.getClaims(token);
  if (authError || !claimsData?.claims) {
    console.error('[ERP-STATUS] Auth error:', authError?.message);
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized - Invalid token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('[ERP-STATUS] Authenticated user:', claimsData.claims.sub);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ success: false, error: "Backend não configurado (service key ausente)" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await admin
      .from("system_settings")
      .select("setting_key, setting_value, encrypted_value")
      .in("setting_key", ["erp_email", "erp_password"]);

    if (error) throw error;

    const rows = (data ?? []) as SystemSettingsRow[];
    const emailRow = rows.find((r) => r.setting_key === "erp_email");
    const passwordRow = rows.find((r) => r.setting_key === "erp_password");

    const email = (emailRow?.setting_value ?? "").trim();
    const hasPassword = !!(passwordRow?.encrypted_value && String(passwordRow.encrypted_value).trim());

    return new Response(
      JSON.stringify({ success: true, email, hasPassword }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ERP-STATUS] Erro:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
