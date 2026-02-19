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

async function fetchItemsThumbs(itemIds: string[], accessToken: string) {
  const thumbById = new Map<string, string>();
  const chunkSize = 20;

  for (let i = 0; i < itemIds.length; i += chunkSize) {
    const chunk = itemIds.slice(i, i + chunkSize);
    const query = chunk.map((id) => `ids=${encodeURIComponent(id)}`).join("&");
    const response = await fetchMl(`/items?${query}`, accessToken);
    const rows = Array.isArray(response) ? response : [];

    for (const row of rows) {
      const body = (row as { body?: { id?: string; thumbnail?: string } })?.body;
      const id = String(body?.id || "").trim();
      const thumb = String(body?.thumbnail || "").trim();
      if (id && thumb) thumbById.set(id, thumb);
    }
  }

  return thumbById;
}

function asStringDate(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return "";
  return text;
}

function firstValidDate(candidates: unknown[]) {
  for (const c of candidates) {
    const value = asStringDate(c);
    if (value) return value;
  }
  return "";
}

function resolveShippingDate(order: {
  date_created?: string;
  status?: string;
  shipping?: {
    status?: string;
    substatus?: string;
    date_created?: string;
    date_last_updated?: string;
    shipped_at?: string;
    delivered_at?: string;
    estimated_delivery_time?: { date?: string };
  };
}) {
  const shipping = order.shipping || {};
  const statusJoined = [
    String(order.status || "").toLowerCase(),
    String(shipping.status || "").toLowerCase(),
    String(shipping.substatus || "").toLowerCase()
  ].join(" ");

  if (
    statusJoined.includes("shipped") ||
    statusJoined.includes("delivered") ||
    statusJoined.includes("in_transit")
  ) {
    return (
      firstValidDate([
        shipping.shipped_at,
        shipping.date_last_updated,
        shipping.date_created,
        order.date_created
      ]) || order.date_created || ""
    );
  }

  return (
    firstValidDate([
      shipping.estimated_delivery_time?.date,
      shipping.date_created,
      shipping.date_last_updated,
      order.date_created
    ]) || order.date_created || ""
  );
}

async function fetchShipmentDetails(shipmentId: string, accessToken: string) {
  try {
    return await fetchMl(`/shipments/${shipmentId}`, accessToken);
  } catch (error) {
    console.warn("[ml-sync] /shipments/{id} falhou", {
      shipmentId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function attachShipmentsToOrders(
  orders: Array<{
    id?: number;
    date_created?: string;
    status?: string;
    shipping?: {
      id?: number | string;
      status?: string;
      substatus?: string;
      date_created?: string;
      date_last_updated?: string;
      shipped_at?: string;
      delivered_at?: string;
      estimated_delivery_time?: { date?: string };
    };
    shipping_date_resolved?: string;
  }>,
  accessToken: string
) {
  const shipmentIds = new Set<string>();
  for (const order of orders) {
    const id = String(order.shipping?.id || "").trim();
    if (id) shipmentIds.add(id);
  }

  if (shipmentIds.size === 0) {
    for (const order of orders) {
      order.shipping_date_resolved = resolveShippingDate(order);
    }
    return;
  }

  const shipmentMap = new Map<string, unknown>();
  const ids = [...shipmentIds];
  const concurrency = 8;
  for (let i = 0; i < ids.length; i += concurrency) {
    const chunk = ids.slice(i, i + concurrency);
    const rows = await Promise.all(
      chunk.map(async (shipmentId) => ({
        shipmentId,
        details: await fetchShipmentDetails(shipmentId, accessToken)
      }))
    );
    for (const row of rows) {
      if (row.details) shipmentMap.set(row.shipmentId, row.details);
    }
  }

  for (const order of orders) {
    const shipmentId = String(order.shipping?.id || "").trim();
    const details = shipmentId ? shipmentMap.get(shipmentId) : null;
    if (details && typeof details === "object") {
      order.shipping = {
        ...(order.shipping || {}),
        ...(details as Record<string, unknown>)
      } as {
        id?: number | string;
        status?: string;
        substatus?: string;
        date_created?: string;
        date_last_updated?: string;
        shipped_at?: string;
        delivered_at?: string;
        estimated_delivery_time?: { date?: string };
      };
    }
    order.shipping_date_resolved = resolveShippingDate(order);
  }

  console.log("[ml-sync] resumo remessas", {
    orders: orders.length,
    shipmentIds: shipmentIds.size,
    enriched: shipmentMap.size
  });
}

async function fetchOrderPayments(orderId: number, accessToken: string) {
  try {
    const payments = await fetchMl(`/orders/${orderId}/payments`, accessToken);
    if (Array.isArray(payments)) return payments;
  } catch (error) {
    console.error("[ml-sync] /orders/{id}/payments falhou", {
      orderId,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    const orderDetail = await fetchMl(`/orders/${orderId}`, accessToken);
    const list = (orderDetail as { payments?: unknown[] })?.payments;
    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.error("[ml-sync] /orders/{id} fallback falhou", {
      orderId,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

async function fetchPaymentDetails(paymentId: string, accessToken: string) {
  try {
    return await fetchMl(`/v1/payments/${paymentId}`, accessToken);
  } catch (error) {
    console.warn("[ml-sync] /v1/payments/{id} falhou, tentando fallback", {
      paymentId,
      error: error instanceof Error ? error.message : String(error)
    });
    try {
      return await fetchMl(`/payments/${paymentId}`, accessToken);
    } catch (fallbackError) {
      console.error("[ml-sync] /payments/{id} fallback falhou", {
        paymentId,
        error:
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      });
      return null;
    }
  }
}

function extractPaymentIds(rawPayments: unknown[]) {
  const ids: string[] = [];
  for (const p of rawPayments) {
    if (typeof p === "number" || typeof p === "string") {
      ids.push(String(p));
      continue;
    }
    const id = String((p as { id?: string | number })?.id || "").trim();
    if (id) ids.push(id);
  }
  return ids;
}

async function attachPaymentsToOrders(
  orders: Array<{ id?: number; payments?: unknown[] }>,
  accessToken: string
) {
  let totalPaymentIds = 0;
  let totalDetailedPayments = 0;
  const concurrency = 8;
  for (let i = 0; i < orders.length; i += concurrency) {
    const chunk = orders.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (order) => {
        const orderId = Number(order.id) || 0;
        if (!orderId) {
          order.payments = [];
          return;
        }
        const rawPayments = await fetchOrderPayments(orderId, accessToken);
        const paymentIds = extractPaymentIds(rawPayments);
        totalPaymentIds += paymentIds.length;

        if (paymentIds.length === 0) {
          order.payments = rawPayments;
          return;
        }

        const details = await Promise.all(
          paymentIds.map((paymentId) => fetchPaymentDetails(paymentId, accessToken))
        );
        const full = details.filter(Boolean);
        if (paymentIds.length > 0 && full.length === 0) {
          console.warn("[ml-sync] pagamento sem detalhes, usando fallback da ordem", {
            orderId,
            paymentIds
          });
        }
        totalDetailedPayments += full.length;
        order.payments = full.length > 0 ? full : rawPayments;
      })
    );
  }

  console.log("[ml-sync] resumo pagamentos", {
    orders: orders.length,
    paymentIds: totalPaymentIds,
    detailedPayments: totalDetailedPayments
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
    const accessToken = String(payload?.access_token || "").trim();
    const fromDate =
      String(payload?.from_date || "").trim() ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = String(payload?.to_date || "").trim();
    const includePaymentsDetails = Boolean(payload?.include_payments_details);
    const includeShipmentsDetails = Boolean(payload?.include_shipments_details);
    const requestedMaxPages = Number(payload?.max_pages) || 0;

    if (!accessToken) {
      return jsonResponse({ error: "missing_access_token" }, 400);
    }

    console.log("[ml-sync] inicio", {
      fromDate,
      toDate: toDate || null
    });

    const seller = await fetchMl("/users/me", accessToken);
    const sellerId = (seller as { id?: number })?.id;
    if (!sellerId) {
      return jsonResponse({ error: "invalid_seller_response" }, 400);
    }

    const allOrders: unknown[] = [];
    const limit = 50;
    let offset = 0;
    const maxPages = Math.max(1, Math.min(100, requestedMaxPages || 60));

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
      console.log("[ml-sync] pagina orders", {
        page,
        offset,
        got: results.length
      });

      if (results.length < limit) break;
      offset += limit;
    }

    const itemIds = new Set<string>();
    for (const order of allOrders) {
      const orderItems =
        (order as { order_items?: Array<{ item?: { id?: string } }> })?.order_items || [];
      for (const row of orderItems) {
        const id = String(row?.item?.id || "").trim();
        if (id) itemIds.add(id);
      }
    }

    const thumbs = await fetchItemsThumbs([...itemIds], accessToken);
    const enrichedOrders = allOrders.map((order) => {
      const orderAny = order as {
        id?: number;
        payments?: unknown[];
        order_items?: Array<{ item?: { id?: string; thumbnail?: string } }>;
      };
      const items = orderAny.order_items || [];
      for (const row of items) {
        const itemId = String(row?.item?.id || "").trim();
        if (!itemId || !row.item) continue;
        const thumb = thumbs.get(itemId);
        if (thumb) row.item.thumbnail = thumb;
      }
      return orderAny;
    });

    if (!includePaymentsDetails) {
      // modo rapido para auto-sync: evita chamadas pesadas em lote por pagamento
      for (const order of enrichedOrders) {
        order.payments = [];
      }
    } else {
      await attachPaymentsToOrders(enrichedOrders, accessToken);
    }

    if (includeShipmentsDetails) {
      await attachShipmentsToOrders(
        enrichedOrders as Array<{
          id?: number;
          date_created?: string;
          status?: string;
          shipping?: {
            id?: number | string;
            status?: string;
            substatus?: string;
            date_created?: string;
            date_last_updated?: string;
            shipped_at?: string;
            delivered_at?: string;
            estimated_delivery_time?: { date?: string };
          };
          shipping_date_resolved?: string;
        }>,
        accessToken
      );
    } else {
      for (const order of enrichedOrders as Array<{
        date_created?: string;
        status?: string;
        shipping?: {
          status?: string;
          substatus?: string;
          date_created?: string;
          date_last_updated?: string;
          shipped_at?: string;
          delivered_at?: string;
          estimated_delivery_time?: { date?: string };
        };
        shipping_date_resolved?: string;
      }>) {
        order.shipping_date_resolved = resolveShippingDate(order);
      }
    }

    console.log("[ml-sync] fim", {
      sellerId,
      orders: enrichedOrders.length,
      includePaymentsDetails,
      includeShipmentsDetails
    });

    return jsonResponse({
      seller,
      orders: enrichedOrders
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    return jsonResponse({ error: "sync_failed", message }, 400);
  }
});
