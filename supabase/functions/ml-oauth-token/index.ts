import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const ML_CLIENT_ID = Deno.env.get("ML_CLIENT_ID")?.trim();
    const ML_CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET")?.trim();

    if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) {
      return jsonResponse(
        {
          error: "missing_ml_credentials",
          message: "Defina ML_CLIENT_ID e ML_CLIENT_SECRET nos secrets da Edge Function."
        },
        500
      );
    }

    const payload = await req.json();
    const code = String(payload?.code || "").trim();
    const redirectUri = String(payload?.redirect_uri || "").trim();
    const codeVerifierRaw = String(payload?.code_verifier || "").trim();

    if (!code) {
      return jsonResponse({ error: "missing_code" }, 400);
    }
    if (!redirectUri) {
      return jsonResponse({ error: "missing_redirect_uri" }, 400);
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri
    });

    if (codeVerifierRaw) {
      body.set("code_verifier", codeVerifierRaw);
    }

    const mlResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    const raw = await mlResponse.text();
    let parsed: unknown = raw;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      // Keep raw string response in parsed.
    }

    if (!mlResponse.ok) {
      return jsonResponse(
        {
          error: "ml_token_exchange_failed",
          status: mlResponse.status,
          details: parsed
        },
        400
      );
    }

    return jsonResponse(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    return jsonResponse({ error: "internal_error", message }, 500);
  }
});

