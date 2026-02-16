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

function firstString(...values: unknown[]) {
  for (const value of values) {
    const str = String(value ?? "").trim();
    if (str) return str;
  }
  return "";
}

function toProviderStatus(rawStatus: string) {
  const status = rawStatus.toLowerCase();
  if (status.includes("autoriz") || status.includes("approved") || status.includes("success")) {
    return "authorized";
  }
  if (status.includes("error") || status.includes("reject") || status.includes("denied")) {
    return "error";
  }
  if (status.includes("draft")) {
    return "draft_pending_provider";
  }
  return "pending_provider";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const payload = await req.json();
    const providerRef = String(payload?.provider_ref || "").trim();
    if (!providerRef) {
      return jsonResponse({ error: "missing_provider_ref" }, 400);
    }

    const providerToken = Deno.env.get("NFE_PROVIDER_TOKEN")?.trim() || "";
    const defaultBaseUrl = Deno.env.get("NFE_PROVIDER_BASE_URL")?.trim() || "https://api.nuvemfiscal.com.br";
    const providerBaseUrl = String(payload?.provider_base_url || defaultBaseUrl).trim();
    const statusPathTpl = Deno.env.get("NFE_STATUS_PATH_TEMPLATE")?.trim() || "/v1/nfe/{id}";

    if (!providerToken || !providerBaseUrl) {
      return jsonResponse({
        status: "draft_pending_provider",
        message: "Integracao fiscal ainda nao configurada."
      });
    }

    const statusPath = statusPathTpl.replace("{id}", encodeURIComponent(providerRef));
    const statusUrl = `${providerBaseUrl.replace(/\/$/, "")}${statusPath.startsWith("/") ? statusPath : `/${statusPath}`}`;

    const providerResp = await fetch(statusUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${providerToken}`
      }
    });

    const raw = await providerResp.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      parsed = { raw };
    }

    if (!providerResp.ok) {
      return jsonResponse(
        {
          status: "error",
          message: firstString(parsed.message, parsed.error, raw) || "Falha ao consultar status no emissor.",
          provider_http_status: providerResp.status,
          provider_payload: parsed
        },
        400
      );
    }

    const rawStatus = firstString(parsed.status, parsed.situacao, parsed.state, "pending_provider");

    return jsonResponse({
      status: toProviderStatus(rawStatus),
      provider_ref: providerRef,
      invoice_number: firstString(parsed.numero, parsed.numero_nf, parsed.invoice_number),
      access_key: firstString(parsed.chave, parsed.chave_acesso, parsed.access_key),
      xml_url: firstString(parsed.xml_url, parsed.url_xml, parsed.download_xml_url),
      pdf_url: firstString(parsed.pdf_url, parsed.url_pdf, parsed.download_pdf_url),
      message: firstString(parsed.mensagem, parsed.message, rawStatus)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    return jsonResponse({ error: "internal_error", message }, 500);
  }
});

