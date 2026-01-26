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
