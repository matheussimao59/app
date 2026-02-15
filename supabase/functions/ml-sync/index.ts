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

async function fetchMl(path: string, accessToken: string) {
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
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
    const fromDate =
      String(payload?.from_date || "").trim() ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = String(payload?.to_date || "").trim();

    if (!accessToken) {
      return jsonResponse({ error: "missing_access_token" }, 400);
    }

    const seller = await fetchMl("/users/me", accessToken);
    const sellerId = (seller as { id?: number })?.id;
    if (!sellerId) {
      return jsonResponse({ error: "invalid_seller_response" }, 400);
    }

    const allOrders: unknown[] = [];
    const limit = 50;
    let offset = 0;
    const maxPages = 10;

    for (let page = 0; page < maxPages; page += 1) {
      const query = new URLSearchParams({
        seller: String(sellerId),
        sort: "date_desc",
        limit: String(limit),
        offset: String(offset),
        "order.date_created.from": fromDate
      });
      if (toDate) {
        query.set("order.date_created.to", toDate);
      }

      const orders = await fetchMl(`/orders/search?${query.toString()}`, accessToken);
      const results = (orders as { results?: unknown[] })?.results || [];
      allOrders.push(...results);

      if (results.length < limit) break;
      offset += limit;
    }

    return jsonResponse({
      seller,
      orders: allOrders
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    return jsonResponse({ error: "sync_failed", message }, 400);
  }
});
