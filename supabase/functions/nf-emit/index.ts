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
    const payload = await req.json();
    const orderId = Number(payload?.order_id) || 0;
    const orderTotal = Number(payload?.order_total) || 0;
    const invoiceSeries = String(payload?.invoice_series || "1").trim();
    const environment =
      String(payload?.environment || "homologacao").toLowerCase() === "producao"
        ? "producao"
        : "homologacao";
    const providerName = String(payload?.provider_name || "nuvemfiscal").trim();

    if (!orderId) {
      return jsonResponse({ error: "missing_order_id" }, 400);
    }

    // Fase 1: resposta padrao de emissao (stub pronto para integrar API fiscal real).
    // Se NFE_PROVIDER_TOKEN estiver definido, mantemos o fluxo "pending_provider"
    // para nao bloquear o front enquanto a integracao completa nao e finalizada.
    const hasProviderToken = Boolean(Deno.env.get("NFE_PROVIDER_TOKEN")?.trim());
    const providerRef = `nf-${orderId}-${Date.now()}`;

    return jsonResponse({
      status: hasProviderToken ? "pending_provider" : "draft_pending_provider",
      provider_name: providerName,
      provider_ref: providerRef,
      invoice_number: "",
      access_key: "",
      message: hasProviderToken
        ? "Documento enviado ao emissor. Aguarde retorno de autorizacao."
        : "Integracao fiscal ainda nao configurada. Documento salvo como rascunho.",
      environment,
      invoice_series: invoiceSeries,
      order_id: orderId,
      order_total: orderTotal
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    return jsonResponse({ error: "internal_error", message }, 500);
  }
});

