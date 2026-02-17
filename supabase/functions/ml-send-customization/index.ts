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

async function fetchMl(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });

  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    // Keep raw string
  }

  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        path,
        status: response.status,
        details: parsed
      })
    );
  }

  return parsed;
}

function findRequestVariantsOption(optionsPayload: unknown): string | null {
  const arr = Array.isArray(optionsPayload)
    ? optionsPayload
    : Array.isArray((optionsPayload as { options?: unknown[] } | null)?.options)
      ? ((optionsPayload as { options?: unknown[] }).options || [])
      : [];

  for (const opt of arr) {
    const anyOpt = opt as Record<string, unknown>;
    const id = String(anyOpt?.id || "").trim();
    const code = String(anyOpt?.code || anyOpt?.name || anyOpt?.tag || "").toUpperCase();
    if (!id) continue;
    if (code.includes("REQUEST_VARIANTS")) return id;
  }

  return null;
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
    const accessToken = String(payload?.access_token || "").trim();
    const sellerId = Number(payload?.seller_id) || 0;
    const packId = Number(payload?.pack_id) || 0;
    const orderId = Number(payload?.order_id) || 0;
    const text = String(payload?.message || "").trim();

    if (!accessToken || !sellerId || !packId || !text) {
      return jsonResponse({ error: "missing_required_fields" }, 400);
    }

    // Valida capacidade de envio no pack (quando endpoint disponivel).
    try {
      await fetchMl(`/messages/action_guide/packs/${packId}/caps_available?tag=post_sale`, accessToken);
    } catch {
      // Nao bloqueia: alguns sellers/apps podem ter resposta diferente.
    }

    let optionId = "REQUEST_VARIANTS";
    try {
      const optionsPayload = await fetchMl(
        `/messages/action_guide/packs/${packId}/options?tag=post_sale`,
        accessToken
      );
      const found = findRequestVariantsOption(optionsPayload);
      if (found) optionId = found;
    } catch {
      // fallback para REQUEST_VARIANTS em texto
    }

    const attempts: Array<{ path: string; body: Record<string, unknown> }> = [
      {
        path: `/messages/action_guide/packs/${packId}/sellers/${sellerId}?tag=post_sale`,
        body: { text, option_id: optionId }
      },
      {
        path: `/messages/action_guide/packs/${packId}/option/${optionId}/sellers/${sellerId}?tag=post_sale`,
        body: { text }
      },
      {
        path: `/messages/action_guide/packs/${packId}/options/${optionId}/sellers/${sellerId}?tag=post_sale`,
        body: { text }
      }
    ];

    let lastError = "";
    for (const attempt of attempts) {
      try {
        const sent = await fetchMl(attempt.path, accessToken, {
          method: "POST",
          body: JSON.stringify(attempt.body)
        });
        return jsonResponse({
          ok: true,
          order_id: orderId,
          pack_id: packId,
          option_id: optionId,
          path_used: attempt.path,
          response: sent
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return jsonResponse(
      {
        error: "ml_message_send_failed",
        message: "Nao foi possivel enviar mensagem de personalizacao.",
        details: lastError
      },
      400
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    return jsonResponse({ error: "internal_error", message }, 500);
  }
});

