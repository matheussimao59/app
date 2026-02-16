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

function validateEmitter(emitter: Record<string, unknown>) {
  const required = [
    ["cnpj", "CNPJ"],
    ["razao_social", "Razao social"],
    ["regime_tributario", "Regime tributario"],
    ["logradouro", "Logradouro"],
    ["numero", "Numero"],
    ["bairro", "Bairro"],
    ["cidade", "Cidade"],
    ["uf", "UF"],
    ["cep", "CEP"],
    ["certificate_provider_ref", "Referencia do certificado"]
  ] as const;
  const missing: string[] = [];
  for (const [field, label] of required) {
    const val = String(emitter?.[field] ?? "").trim();
    if (!val) missing.push(label);
  }
  return missing;
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
    const orderTitle = String(payload?.order_title || "Pedido sem titulo").trim();
    const buyerName = String(payload?.buyer_name || "Cliente final").trim();
    const emitter = (payload?.emitter || {}) as Record<string, unknown>;

    if (!orderId) {
      return jsonResponse({ error: "missing_order_id" }, 400);
    }
    const missingEmitter = validateEmitter(emitter);
    if (missingEmitter.length > 0) {
      return jsonResponse(
        {
          error: "missing_fiscal_settings",
          message: `Campos fiscais obrigatorios ausentes: ${missingEmitter.join(", ")}.`
        },
        400
      );
    }

    const providerToken = Deno.env.get("NFE_PROVIDER_TOKEN")?.trim() || "";
    const defaultBaseUrl = Deno.env.get("NFE_PROVIDER_BASE_URL")?.trim() || "https://api.nuvemfiscal.com.br";
    const providerBaseUrl = String(payload?.provider_base_url || defaultBaseUrl).trim();
    const issuePath = Deno.env.get("NFE_ISSUE_PATH")?.trim() || "/v1/nfe";

    if (!providerToken || !providerBaseUrl) {
      const providerRef = `nf-${orderId}-${Date.now()}`;
      return jsonResponse({
        status: "draft_pending_provider",
        provider_name: providerName,
        provider_ref: providerRef,
        invoice_number: "",
        access_key: "",
        message: "Integracao fiscal ainda nao configurada. Documento salvo como rascunho.",
        environment,
        invoice_series: invoiceSeries,
        order_id: orderId,
        order_total: orderTotal
      });
    }

    const issueUrl = `${providerBaseUrl.replace(/\/$/, "")}${issuePath.startsWith("/") ? issuePath : `/${issuePath}`}`;
    const requestBody = {
      ambiente: environment,
      serie: invoiceSeries,
      numero: undefined,
      natureza_operacao: "Venda de mercadoria",
      emitente: {
        cnpj: String(emitter.cnpj || ""),
        inscricao_estadual: String(emitter.ie || ""),
        razao_social: String(emitter.razao_social || ""),
        nome_fantasia: String(emitter.nome_fantasia || ""),
        regime_tributario: String(emitter.regime_tributario || ""),
        endereco: {
          cep: String(emitter.cep || ""),
          logradouro: String(emitter.logradouro || ""),
          numero: String(emitter.numero || ""),
          complemento: String(emitter.complemento || ""),
          bairro: String(emitter.bairro || ""),
          municipio: String(emitter.cidade || ""),
          uf: String(emitter.uf || "")
        }
      },
      certificado: {
        referencia: String(emitter.certificate_provider_ref || "")
      },
      destinatario: {
        nome: buyerName
      },
      itens: [
        {
          codigo: `ORDER-${orderId}`,
          descricao: orderTitle,
          quantidade: 1,
          valor_unitario: orderTotal,
          valor_total: orderTotal
        }
      ],
      valor_total: orderTotal,
      referencia_externa: String(orderId)
    };

    const providerResp = await fetch(issueUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerToken}`
      },
      body: JSON.stringify(requestBody)
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
          provider_name: providerName,
          message: firstString(parsed.message, parsed.error, raw) || "Falha ao enviar documento para o emissor.",
          provider_http_status: providerResp.status,
          provider_payload: parsed
        },
        400
      );
    }

    const rawStatus = firstString(parsed.status, parsed.situacao, parsed.state, "pending_provider");
    const normalizedStatus = toProviderStatus(rawStatus);

    return jsonResponse({
      status: normalizedStatus,
      provider_name: providerName,
      provider_ref: firstString(parsed.id, parsed.uuid, parsed.referencia, parsed.reference, parsed.ref),
      invoice_number: firstString(parsed.numero, parsed.numero_nf, parsed.invoice_number),
      access_key: firstString(parsed.chave, parsed.chave_acesso, parsed.access_key),
      xml_url: firstString(parsed.xml_url, parsed.url_xml, parsed.download_xml_url),
      pdf_url: firstString(parsed.pdf_url, parsed.url_pdf, parsed.download_pdf_url),
      message: firstString(parsed.mensagem, parsed.message, rawStatus) || "Documento enviado ao emissor."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    return jsonResponse({ error: "internal_error", message }, 500);
  }
});
