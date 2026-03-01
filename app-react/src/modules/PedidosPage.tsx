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
  status?: string;
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

type PedidosMode = "pendentes" | "nota-fiscal" | "imprimir" | "retirada";

type Props = {
  mode: PedidosMode;
};

type OrderOpsRecord = {
  labelPrintedAt?: string;
  invoiceNumber?: string;
  invoiceKey?: string;
  invoiceIssuedAt?: string;
  pickupReady?: boolean;
};

type OrderOpsMap = Record<string, OrderOpsRecord>;
type DebugInfo = {
  source: "ml-sync" | "cache" | "empty";
  totalLoaded: number;
  totalPendingShipment: number;
  statuses: Array<{ status: string; count: number }>;
  sample: Array<{ id: number; status: string; date: string }>;
};

function ordersCacheKey(userId: string) {
  return `ml_orders_cache_${userId}`;
}

function orderOpsKey(userId: string) {
  return `ml_order_ops_${userId}`;
}

function orderOpsSettingId(userId: string) {
  return `ml_order_ops_${userId}`;
}

function tokenSettingId(userId: string) {
  return `ml_access_token_${userId}`;
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

function isPendingStatus(status: string) {
  return (
    status.includes("pending") ||
    status.includes("payment_required") ||
    status.includes("under_review") ||
    status.includes("in_process")
  );
}

function isReadyStatus(status: string) {
  return (
    status.includes("paid") ||
    status.includes("ready_to_ship") ||
    status.includes("confirmed") ||
    status.includes("handling") ||
    status.includes("to_be_agreed")
  );
}

function isSentStatus(status: string) {
  return (
    status.includes("shipped") ||
    status.includes("delivered") ||
    status.includes("in_transit") ||
    status.includes("not_delivered")
  );
}

function isCancelled(order: Order) {
  const status = normalizeStatus(order.status);
  return status.includes("cancel");
}

function modeTitle(mode: PedidosMode) {
  if (mode === "pendentes") return "Pedidos pendentes";
  if (mode === "nota-fiscal") return "Para emitir nota fiscal";
  if (mode === "imprimir") return "Para imprimir";
  return "Para retirada";
}

function modePath(mode: PedidosMode) {
  if (mode === "pendentes") return "/pedidos/pendentes";
  if (mode === "nota-fiscal") return "/pedidos/nota-fiscal";
  if (mode === "imprimir") return "/pedidos/imprimir";
  return "/pedidos/retirada";
}

function filterOrdersByMode(orders: Order[], mode: PedidosMode, opsMap: OrderOpsMap) {
  return orders.filter((order) => {
    if (isCancelled(order)) return false;

    const status = normalizeStatus(order.status);
    const op = opsMap[String(order.id)] || {};

    if (mode === "pendentes") {
      return isPendingStatus(status);
    }

    if (mode === "nota-fiscal") {
      return !isSentStatus(status) && isReadyStatus(status) && !op.invoiceIssuedAt;
    }

    if (mode === "imprimir") {
      return !isSentStatus(status) && isReadyStatus(status) && Boolean(op.invoiceIssuedAt) && !op.labelPrintedAt;
    }

    return isSentStatus(status) || Boolean(op.pickupReady);
  });
}

function isPendingShipment(order: Order) {
  const status = normalizeStatus(order.status);
  if (status.includes("cancel")) return false;
  if (isSentStatus(status)) return false;
  // Mercado Livre pode retornar "paid/confirmed/handling" antes de "ready_to_ship".
  return (
    status.includes("ready_to_ship") ||
    status.includes("to_be_agreed") ||
    status.includes("paid") ||
    status.includes("confirmed") ||
    status.includes("handling") ||
    status.includes("in_process")
  );
}

function orderSummary(order: Order) {
  const first = order.order_items?.[0];
  const item = first?.item;
  const title = item?.title || "Produto sem titulo";
  const qty = Number(first?.quantity ?? item?.quantity) || 0;
  const sku = item?.seller_sku || "-";
  const thumb = String(item?.thumbnail || "").trim();
  const amount = Number(order.total_amount) || 0;
  const buyerName =
    order.buyer?.nickname ||
    [order.buyer?.first_name, order.buyer?.last_name].filter(Boolean).join(" ") ||
    "Cliente";
  return { title, qty, sku, thumb, amount, buyerName };
}

function openLabelPrint(orders: Order[]) {
  if (!orders.length) return;
  const popup = window.open("", "_blank", "width=980,height=780");
  if (!popup) return;

  const cards = orders
    .map((order) => {
      const row = orderSummary(order);
      return `
        <article class="label">
          <h3>Pedido #${order.id}</h3>
          <p><strong>Produto:</strong> ${row.title}</p>
          <p><strong>SKU:</strong> ${row.sku}</p>
          <p><strong>Quantidade:</strong> ${row.qty}</p>
          <p><strong>Cliente:</strong> ${row.buyerName}</p>
          <p><strong>Data:</strong> ${fmtDate(order.date_created)}</p>
          <p><strong>Valor:</strong> ${fmtMoney(row.amount)}</p>
        </article>
      `;
    })
    .join("");

  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Etiquetas de Pedidos</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8mm;
          }
          .label {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 5mm;
            break-inside: avoid;
          }
          .label h3 { margin: 0 0 4mm; font-size: 12pt; }
          .label p { margin: 0 0 2mm; font-size: 9pt; line-height: 1.35; }
        </style>
      </head>
      <body>
        <section class="grid">${cards}</section>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  popup.document.close();
}

export function PedidosPage({ mode: _mode }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [opsMap, setOpsMap] = useState<OrderOpsMap>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [statusInfo, setStatusInfo] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [nfOrderId, setNfOrderId] = useState<number | null>(null);
  const [nfNumber, setNfNumber] = useState("");
  const [nfKey, setNfKey] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;

    async function run() {
      if (!supabase) {
        setError("Supabase nao configurado.");
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) {
        if (!mounted) return;
        setError("Usuario nao autenticado.");
        setLoading(false);
        return;
      }

      setUserId(uid);

      let loadedOrders: Order[] = [];
      let source: DebugInfo["source"] = "empty";

      try {
        const { data: tokenRow } = await supabase
          .from("app_settings")
          .select("config_data")
          .eq("id", tokenSettingId(uid))
          .maybeSingle();
        const accessToken = String(tokenRow?.config_data?.access_token || "").trim();

        if (accessToken) {
          const fromDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
          const toDate = new Date().toISOString();
          const { data: syncPayload, error: syncError } = await supabase.functions.invoke("ml-sync", {
            body: {
              access_token: accessToken,
              from_date: fromDate,
              to_date: toDate,
              include_payments_details: false,
              max_pages: 60
            }
          });

          if (!syncError) {
            loadedOrders = (((syncPayload || {}) as { orders?: Order[] }).orders || []) as Order[];
            localStorage.setItem(ordersCacheKey(uid), JSON.stringify(loadedOrders));
            source = "ml-sync";
          }
        }
      } catch {
        // fallback abaixo
      }

      if (loadedOrders.length === 0) {
        try {
          const rawOrders = localStorage.getItem(ordersCacheKey(uid));
          const parsedOrders = rawOrders ? (JSON.parse(rawOrders) as Order[]) : [];
          loadedOrders = Array.isArray(parsedOrders) ? parsedOrders : [];
          if (loadedOrders.length > 0) source = "cache";
        } catch {
          loadedOrders = [];
        }
      }

      if (!mounted) return;
      const onlyPendingShipment = loadedOrders.filter((order) => isPendingShipment(order));
      setOrders(onlyPendingShipment);
      const statusMap = new Map<string, number>();
      for (const order of loadedOrders) {
        const key = normalizeStatus(order.status) || "(vazio)";
        statusMap.set(key, (statusMap.get(key) || 0) + 1);
      }
      const statuses = [...statusMap.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);
      setDebugInfo({
        source,
        totalLoaded: loadedOrders.length,
        totalPendingShipment: onlyPendingShipment.length,
        statuses,
        sample: loadedOrders.slice(0, 15).map((order) => ({
          id: Number(order.id) || 0,
          status: normalizeStatus(order.status) || "(vazio)",
          date: fmtDate(order.date_created)
        }))
      });

      try {
        const { data: opsRow } = await supabase
          .from("app_settings")
          .select("config_data")
          .eq("id", orderOpsSettingId(uid))
          .maybeSingle();

        let parsedOps = (opsRow?.config_data || {}) as OrderOpsMap;
        if (!opsRow?.config_data) {
          const rawOps = localStorage.getItem(orderOpsKey(uid));
          parsedOps = rawOps ? (JSON.parse(rawOps) as OrderOpsMap) : {};
          if (parsedOps && Object.keys(parsedOps).length > 0) {
            await supabase.from("app_settings").upsert({
              id: orderOpsSettingId(uid),
              config_data: parsedOps
            });
          }
        }
        if (!mounted) return;
        setOpsMap(parsedOps || {});
      } catch {
        if (!mounted) return;
        setOpsMap({});
      }

      setLoading(false);
    }

    void run();

    return () => {
      mounted = false;
    };
  }, []);

  async function persistOps(next: OrderOpsMap, successMessage?: string) {
    setOpsMap(next);
    if (!supabase || !userId) return;

    localStorage.setItem(orderOpsKey(userId), JSON.stringify(next));

    const { error: saveError } = await supabase.from("app_settings").upsert({
      id: orderOpsSettingId(userId),
      config_data: next
    });

    if (saveError) {
      setStatusInfo(`Erro ao salvar operacao: ${saveError.message}`);
      return;
    }

    if (successMessage) {
      setStatusInfo(successMessage);
    }
  }

  const pendingOnly = useMemo(() => orders.filter((order) => isPendingShipment(order)), [orders]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pendingOnly;
    return pendingOnly.filter((order) => {
      const row = orderSummary(order);
      return (
        String(order.id).includes(q) ||
        row.title.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.buyerName.toLowerCase().includes(q)
      );
    });
  }, [pendingOnly, search]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => searched.some((o) => o.id === id)));
  }, [searched]);

  function toggleSelect(orderId: number) {
    setSelectedIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === searched.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(searched.map((o) => o.id));
  }

  function markLabelPrinted(orderIds: number[]) {
    if (!orderIds.length) return;
    const now = new Date().toISOString();
    const next: OrderOpsMap = { ...opsMap };
    orderIds.forEach((id) => {
      next[String(id)] = {
        ...(next[String(id)] || {}),
        labelPrintedAt: now
      };
    });
    void persistOps(next, `${orderIds.length} pedido(s) marcados com etiqueta impressa.`);
  }

  function openEmitNf(orderId: number) {
    const op = opsMap[String(orderId)] || {};
    setNfOrderId(orderId);
    setNfNumber(op.invoiceNumber || "");
    setNfKey(op.invoiceKey || "");
  }

  function saveNf() {
    if (!nfOrderId) return;
    if (!nfNumber.trim()) {
      setStatusInfo("Informe o numero da nota fiscal.");
      return;
    }

    const next: OrderOpsMap = {
      ...opsMap,
      [String(nfOrderId)]: {
        ...(opsMap[String(nfOrderId)] || {}),
        invoiceNumber: nfNumber.trim(),
        invoiceKey: nfKey.trim(),
        invoiceIssuedAt: new Date().toISOString()
      }
    };

    void persistOps(next, `NF emitida para pedido #${nfOrderId}.`);
    setNfOrderId(null);
    setNfNumber("");
    setNfKey("");
  }

  function togglePickup(orderId: number) {
    const current = opsMap[String(orderId)] || {};
    const next: OrderOpsMap = {
      ...opsMap,
      [String(orderId)]: {
        ...current,
        pickupReady: !current.pickupReady
      }
    };
    void persistOps(
      next,
      `Pedido #${orderId} ${!current.pickupReady ? "marcado para retirada" : "retirado da fila de retirada"}.`
    );
  }

  const selectedOrders = searched.filter((o) => selectedIds.includes(o.id));

  return (
    <section className="page pedidos-page">
      <div className="pedidos-main-col">
        <header className="pedidos-toolbar">
          <div>
            <h2>Pedidos pendentes de envio</h2>
            <p className="page-text">Mostra pedidos não enviados e não cancelados (pagos/confirmados/em preparação).</p>
          </div>
          <div className="pedidos-toolbar-actions">
            <input
              className="products-search"
              placeholder="Buscar por pedido, cliente, SKU ou titulo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="ghost-btn"
              disabled={selectedOrders.length === 0}
              onClick={() => {
                openLabelPrint(selectedOrders);
                markLabelPrinted(selectedOrders.map((o) => o.id));
              }}
            >
              Imprimir em massa ({selectedOrders.length})
            </button>
          </div>
        </header>

        {loading && <p className="page-text">Carregando pedidos...</p>}
        {!loading && error && <p className="error-text">{error}</p>}
        {statusInfo && <p className="page-text">{statusInfo}</p>}
        {!loading && !error && searched.length === 0 && (
          <p className="page-text">Nenhum pedido pendente de envio encontrado.</p>
        )}

        {!loading && !error && searched.length > 0 && (
          <div className="pedidos-table-wrap">
            <div className="pedidos-bulkbar">
              <span>{selectedIds.length} selecionado(s)</span>
              <button type="button" className="ghost-btn" onClick={toggleSelectAll}>
                {selectedIds.length === searched.length ? "Desmarcar todos" : "Selecionar todos"}
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={selectedOrders.length === 0}
                onClick={() => {
                  openLabelPrint(selectedOrders);
                  markLabelPrinted(selectedOrders.map((o) => o.id));
                }}
              >
                Imprimir etiquetas
              </button>
            </div>

            <div className="pedidos-grid">
              {searched.map((order) => {
                const row = orderSummary(order);
                const ops = opsMap[String(order.id)] || {};
                return (
                  <article key={order.id} className="pedidos-card">
                    <label className="pedidos-card-check">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(order.id)}
                        onChange={() => toggleSelect(order.id)}
                      />
                      <span>Selecionar</span>
                    </label>

                    <div className="pedidos-card-head">
                      <strong>#{order.id}</strong>
                      <span>{fmtDate(order.date_created)}</span>
                    </div>

                    <div className="pedidos-card-media">
                      {row.thumb ? (
                        <img src={row.thumb} alt={row.title} loading="lazy" />
                      ) : (
                        <div className="pedidos-card-noimg">Sem foto</div>
                      )}
                    </div>

                    <div className="pedidos-card-body">
                      <h4>{row.title}</h4>
                      <p><b>Cliente:</b> {row.buyerName}</p>
                      <p><b>SKU:</b> {row.sku}</p>
                      <p><b>Qtd:</b> {row.qty} <b>Valor:</b> {fmtMoney(row.amount)}</p>
                    </div>

                    <div className="pedidos-status-stack">
                      <span className={ops.invoiceIssuedAt ? "chip active" : "chip"}>
                        {ops.invoiceIssuedAt ? `NF ${ops.invoiceNumber || "emitida"}` : "NF pendente"}
                      </span>
                      <span className={ops.labelPrintedAt ? "chip active" : "chip"}>
                        {ops.labelPrintedAt ? "Etiqueta ok" : "Sem etiqueta"}
                      </span>
                    </div>

                    <div className="materials-actions-cell pedidos-actions-cell">
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          openLabelPrint([order]);
                          markLabelPrinted([order.id]);
                        }}
                      >
                        Etiqueta
                      </button>
                      <button type="button" className="ghost-btn" onClick={() => openEmitNf(order.id)}>
                        Emitir NF
                      </button>
                      <button type="button" className="ghost-btn" onClick={() => togglePickup(order.id)}>
                        {ops.pickupReady ? "Retirada ok" : "Retirada"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {debugInfo && (
          <details className="pedidos-debug" open>
            <summary>Debug da busca de pedidos</summary>
            <p className="page-text">
              Fonte: <b>{debugInfo.source}</b> | Total recebido: <b>{debugInfo.totalLoaded}</b> | Pendentes de envio:
              {" "}
              <b>{debugInfo.totalPendingShipment}</b>
            </p>
            <div className="pedidos-debug-grid">
              <div>
                <h4>Status recebidos</h4>
                {debugInfo.statuses.length === 0 ? (
                  <p className="page-text">Nenhum status recebido.</p>
                ) : (
                  <ul>
                    {debugInfo.statuses.map((row) => (
                      <li key={row.status}>
                        <code>{row.status}</code> - {row.count}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h4>Amostra de pedidos</h4>
                {debugInfo.sample.length === 0 ? (
                  <p className="page-text">Sem pedidos na amostra.</p>
                ) : (
                  <ul>
                    {debugInfo.sample.map((row) => (
                      <li key={String(row.id)}>
                        #{row.id} - <code>{row.status}</code> - {row.date}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </details>
        )}
      </div>

      {nfOrderId && (
        <div className="modal-backdrop" onClick={() => setNfOrderId(null)}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-head">
              <h3>Emitir nota fiscal - Pedido #{nfOrderId}</h3>
              <button type="button" onClick={() => setNfOrderId(null)}>
                Fechar
              </button>
            </div>
            <div className="form-grid two-col">
              <label className="field">
                <span>Numero da NF</span>
                <input value={nfNumber} onChange={(e) => setNfNumber(e.target.value)} />
              </label>
              <label className="field">
                <span>Chave de acesso (opcional)</span>
                <input value={nfKey} onChange={(e) => setNfKey(e.target.value)} />
              </label>
            </div>
            <div className="actions-row">
              <button type="button" className="ghost-btn" onClick={() => setNfOrderId(null)}>
                Cancelar
              </button>
              <button type="button" className="primary-btn" onClick={saveNf}>
                Salvar NF
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
