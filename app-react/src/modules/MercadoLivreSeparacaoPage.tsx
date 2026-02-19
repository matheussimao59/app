import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type OrderItem = {
  title?: string;
  quantity?: number;
  unit_price?: number;
  seller_sku?: string;
  thumbnail?: string;
};

type Order = {
  id: number;
  date_created?: string;
  shipping_date_resolved?: string;
  status?: string;
  shipping?: {
    id?: number;
    status?: string;
    substatus?: string;
    date_created?: string;
    date_last_updated?: string;
    shipped_at?: string;
    delivered_at?: string;
    estimated_delivery_time?: {
      date?: string;
    };
  };
  total_amount?: number;
  buyer?: {
    nickname?: string;
    first_name?: string;
    last_name?: string;
  };
  order_items?: Array<{
    item?: OrderItem;
    quantity?: number;
    unit_price?: number;
  }>;
};

type SyncResponse = {
  orders?: Order[];
};

type SeparationMode = "today_send" | "future_send" | "past_sent";

function tokenSettingId(userId: string) {
  return `ml_access_token_${userId}`;
}

function ordersCacheKey(userId: string) {
  return `ml_orders_cache_${userId}`;
}

function fmtMoney(value: number) {
  return (Number(value) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function fmtDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeStatus(status?: string) {
  return String(status || "").toLowerCase();
}

function joinedStatus(order: Order) {
  return [
    normalizeStatus(order.status),
    normalizeStatus(order.shipping?.status),
    normalizeStatus(order.shipping?.substatus)
  ]
    .filter(Boolean)
    .join(" ");
}

function isCancelledStatus(order: Order) {
  return joinedStatus(order).includes("cancel");
}

function isSentStatus(order: Order) {
  const s = joinedStatus(order);
  return (
    s.includes("shipped") ||
    s.includes("delivered") ||
    s.includes("in_transit") ||
    s.includes("not_delivered") ||
    s.includes("ready_for_pickup")
  );
}

function toDateKey(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveShippingDate(order: Order) {
  if (order.shipping_date_resolved) {
    return order.shipping_date_resolved;
  }

  const shipping = order.shipping;
  const status = joinedStatus(order);

  // Para enviados, prioriza datas reais de envio/atualizacao de remessa.
  if (status.includes("shipped") || status.includes("delivered") || status.includes("in_transit")) {
    return (
      shipping?.shipped_at ||
      shipping?.date_last_updated ||
      shipping?.date_created ||
      order.date_created ||
      ""
    );
  }

  // Para nao enviados, usa data prevista de entrega quando existir (mais proxima de "data de envio"),
  // depois datas da remessa, e por ultimo data da compra.
  return (
    shipping?.estimated_delivery_time?.date ||
    shipping?.date_created ||
    shipping?.date_last_updated ||
    order.date_created ||
    ""
  );
}

function toDateLabel(dateKey: string) {
  if (!dateKey) return "-";
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

function orderSummary(order: Order) {
  const first = order.order_items?.[0];
  const item = first?.item;
  return {
    title: item?.title || "Produto sem titulo",
    qty: Number(first?.quantity ?? item?.quantity) || 0,
    sku: item?.seller_sku || "-",
    amount: Number(order.total_amount) || 0,
    buyer:
      order.buyer?.nickname ||
      [order.buyer?.first_name, order.buyer?.last_name].filter(Boolean).join(" ") ||
      "Cliente"
  };
}

export function MercadoLivreSeparacaoPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date().toISOString()));
  const [mode, setMode] = useState<SeparationMode>("today_send");

  useEffect(() => {
    let mounted = true;

    async function loadOrders() {
      if (!supabase) {
        setError("Supabase nao configurado.");
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id || null;
      if (!uid) {
        if (!mounted) return;
        setError("Usuario nao autenticado.");
        setLoading(false);
        return;
      }
      setUserId(uid);

      let loadedOrders: Order[] = [];
      try {
        const { data: tokenRow } = await supabase
          .from("app_settings")
          .select("config_data")
          .eq("id", tokenSettingId(uid))
          .maybeSingle();
        const accessToken = String(tokenRow?.config_data?.access_token || "").trim();

        if (accessToken) {
          const fromDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
          const toDate = new Date().toISOString();
          const { data: syncPayload, error: syncError } = await supabase.functions.invoke("ml-sync", {
            body: {
              access_token: accessToken,
              from_date: fromDate,
              to_date: toDate,
              include_payments_details: false,
              include_shipments_details: true,
              max_pages: 100
            }
          });
          if (!syncError) {
            loadedOrders = (((syncPayload || {}) as SyncResponse).orders || []) as Order[];
            localStorage.setItem(ordersCacheKey(uid), JSON.stringify(loadedOrders));
          }
        }
      } catch {
        // fallback local cache below
      }

      if (loadedOrders.length === 0) {
        try {
          const raw = localStorage.getItem(ordersCacheKey(uid));
          const parsed = raw ? (JSON.parse(raw) as Order[]) : [];
          loadedOrders = Array.isArray(parsed) ? parsed : [];
        } catch {
          loadedOrders = [];
        }
      }

      if (!mounted) return;
      setOrders(loadedOrders);
      setLoading(false);
    }

    void loadOrders();
    return () => {
      mounted = false;
    };
  }, []);

  const todayKey = useMemo(() => toDateKey(new Date().toISOString()), []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (isCancelledStatus(order)) return false;
      const dateKey = toDateKey(resolveShippingDate(order));
      if (!dateKey) return false;

      if (mode === "today_send") {
        // "Hoje" como fila de expedicao do dia: inclui atrasados nao enviados.
        return !isSentStatus(order) && dateKey <= todayKey;
      }
      if (mode === "future_send") {
        return !isSentStatus(order) && dateKey > todayKey;
      }
      return isSentStatus(order) && dateKey < todayKey;
    });
  }, [orders, mode, todayKey]);

  const modeCounts = useMemo(() => {
    const counts = {
      today_send: 0,
      future_send: 0,
      past_sent: 0
    };
    for (const order of orders) {
      if (isCancelledStatus(order)) continue;
      const dateKey = toDateKey(resolveShippingDate(order));
      if (!dateKey) continue;
      if (!isSentStatus(order) && dateKey <= todayKey) counts.today_send += 1;
      else if (!isSentStatus(order) && dateKey > todayKey) counts.future_send += 1;
      else if (isSentStatus(order) && dateKey < todayKey) counts.past_sent += 1;
    }
    return counts;
  }, [orders, todayKey]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of filteredOrders) {
      const key = toDateKey(order.date_created);
      if (!key) continue;
      const current = map.get(key) || [];
      current.push(order);
      map.set(key, current);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dateKey, list]) => ({
        dateKey,
        label: toDateLabel(dateKey),
        orders: list.sort((x, y) => (x.id < y.id ? 1 : -1)),
        count: list.length,
        amount: list.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0)
      }));
  }, [filteredOrders]);

  const selectedGroup = useMemo(() => {
    return groupedByDate.find((g) => g.dateKey === selectedDate) || null;
  }, [groupedByDate, selectedDate]);

  useEffect(() => {
    if (!selectedGroup && groupedByDate.length > 0) {
      setSelectedDate(groupedByDate[0].dateKey);
    }
  }, [groupedByDate, selectedGroup]);

  const modeTitle =
    mode === "today_send"
      ? "Hoje para envio"
      : mode === "future_send"
        ? "Futuro para envio"
        : "Datas passadas enviadas";

  return (
    <section className="page">
      <div className="section-head row-between">
        <div>
          <h2>Separacao de Pedidos</h2>
          <p className="page-text">Pedidos agrupados por data de envio (shipping), com fallback para data da compra.</p>
        </div>
        <div className="products-head" style={{ marginBottom: 0 }}>
          <input
            className="products-search"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      {loading && (
        <div className="loading-indicator centered" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Carregando pedidos...</span>
        </div>
      )}
      {!loading && error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          <div className="ml-order-filters">
            <button
              type="button"
              className={`ml-order-filter-chip ${mode === "today_send" ? "active" : ""}`}
              onClick={() => setMode("today_send")}
            >
              Hoje (para enviar) ({modeCounts.today_send})
            </button>
            <button
              type="button"
              className={`ml-order-filter-chip ${mode === "future_send" ? "active" : ""}`}
              onClick={() => setMode("future_send")}
            >
              Futuro (para enviar) ({modeCounts.future_send})
            </button>
            <button
              type="button"
              className={`ml-order-filter-chip ${mode === "past_sent" ? "active" : ""}`}
              onClick={() => setMode("past_sent")}
            >
              Passado (enviados) ({modeCounts.past_sent})
            </button>
          </div>

          <div className="kpi-grid kpi-grid-4">
            <article className="kpi-card">
              <p>{modeTitle}</p>
              <strong>{filteredOrders.length}</strong>
              <span>Pedidos nesta visao</span>
            </article>
            <article className="kpi-card">
              <p>Datas com envio</p>
              <strong>{groupedByDate.length}</strong>
              <span>Agrupadas por dia</span>
            </article>
            <article className="kpi-card">
              <p>Data selecionada</p>
              <strong>{selectedGroup?.label || "-"}</strong>
              <span>{selectedGroup?.count || 0} pedido(s)</span>
            </article>
            <article className="kpi-card">
              <p>Valor da data</p>
              <strong>{fmtMoney(selectedGroup?.amount || 0)}</strong>
              <span>Somatorio dos pedidos do dia</span>
            </article>
          </div>

          <div className="soft-panel">
            <p>Datas da visao selecionada</p>
            {groupedByDate.length === 0 ? (
              <span className="page-text">Nenhum pedido encontrado para esta visao.</span>
            ) : (
              <div className="ml-order-filters">
                {groupedByDate.map((group) => (
                  <button
                    key={group.dateKey}
                    type="button"
                    className={`ml-order-filter-chip ${selectedDate === group.dateKey ? "active" : ""}`}
                    onClick={() => setSelectedDate(group.dateKey)}
                  >
                    {group.label} ({group.count})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ml-orders-table-wrap">
            <div className="ml-orders-head">
              <h3>{modeTitle} • {selectedGroup?.label || "-"}</h3>
              <span>{selectedGroup?.count || 0} registro(s)</span>
            </div>
            <div className="table-wrap">
              <table className="table clean">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Titulo</th>
                    <th>SKU</th>
                    <th>Qtde</th>
                    <th>Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {!selectedGroup || selectedGroup.orders.length === 0 ? (
                    <tr>
                      <td colSpan={8}>Sem pedidos para a data selecionada.</td>
                    </tr>
                  ) : (
                    selectedGroup.orders.map((order) => {
                      const summary = orderSummary(order);
                      return (
                        <tr key={order.id}>
                          <td className="ml-col-order-id">#{order.id}</td>
                          <td>{fmtDate(resolveShippingDate(order))}</td>
                          <td>{summary.buyer}</td>
                          <td className="ml-col-title">{summary.title}</td>
                          <td>{summary.sku}</td>
                          <td>{summary.qty}</td>
                          <td>{fmtMoney(summary.amount)}</td>
                          <td>{order.status || "-"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!userId && !loading && <p className="page-text">Entre na conta para visualizar os pedidos.</p>}
    </section>
  );
}
