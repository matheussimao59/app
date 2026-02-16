import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type CachedOrder = {
  id: number;
  date_created?: string;
  total_amount?: number;
  buyer?: {
    nickname?: string;
    first_name?: string;
    last_name?: string;
  };
  order_items?: Array<{
    item?: {
      title?: string;
      seller_sku?: string;
    };
    quantity?: number;
  }>;
};

type FiscalDoc = {
  id: string;
  user_id: string;
  order_id: number;
  status: string;
  invoice_number: string | null;
  invoice_series: string | null;
  access_key: string | null;
  provider_ref: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  error_message: string | null;
  issued_at: string | null;
  created_at: string;
};

type FiscalSettings = {
  invoice_series: string;
  environment: "homologacao" | "producao";
  provider_name: string;
};

function ordersCacheKey(userId: string) {
  return `ml_orders_cache_${userId}`;
}

function fmtMoney(value?: number) {
  return (Number(value) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function titleFromOrder(order: CachedOrder) {
  return order.order_items?.[0]?.item?.title || "Produto sem titulo";
}

function buyerFromOrder(order: CachedOrder) {
  return (
    order.buyer?.nickname ||
    [order.buyer?.first_name, order.buyer?.last_name].filter(Boolean).join(" ") ||
    "-"
  );
}

function statusLabel(status?: string) {
  const value = String(status || "").toLowerCase();
  if (value.includes("authoriz")) return "Autorizada";
  if (value.includes("error") || value.includes("reject")) return "Erro";
  if (value.includes("pending")) return "Pendente";
  if (value.includes("draft")) return "Rascunho";
  return status || "-";
}

export function NotaFiscalPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [orders, setOrders] = useState<CachedOrder[]>([]);
  const [docs, setDocs] = useState<FiscalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [issuingOrderId, setIssuingOrderId] = useState<number | null>(null);
  const [settings, setSettings] = useState<FiscalSettings>({
    invoice_series: "1",
    environment: "homologacao",
    provider_name: "nuvemfiscal"
  });

  useEffect(() => {
    let mounted = true;

    async function run() {
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

      try {
        const cached = localStorage.getItem(ordersCacheKey(uid));
        const parsed = cached ? (JSON.parse(cached) as CachedOrder[]) : [];
        if (mounted) setOrders(Array.isArray(parsed) ? parsed : []);
      } catch {
        if (mounted) setOrders([]);
      }

      const { data: docsRows, error: docsError } = await supabase
        .from("fiscal_documents")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(300);

      if (docsError) {
        if (mounted) {
          setError(
            "Tabela fiscal_documents nao encontrada. Execute o SQL em supabase/sql/2026-02-16_fiscal_documents.sql e tente novamente."
          );
          setLoading(false);
        }
        return;
      }

      const { data: settingsRow } = await supabase
        .from("fiscal_settings")
        .select("invoice_series, environment, provider_name")
        .eq("user_id", uid)
        .maybeSingle();

      if (settingsRow && mounted) {
        setSettings({
          invoice_series: String(settingsRow.invoice_series || "1"),
          environment:
            String(settingsRow.environment || "homologacao") === "producao"
              ? "producao"
              : "homologacao",
          provider_name: String(settingsRow.provider_name || "nuvemfiscal")
        });
      }

      if (mounted) {
        setDocs((docsRows || []) as FiscalDoc[]);
        setLoading(false);
      }
    }

    void run();
    return () => {
      mounted = false;
    };
  }, []);

  const docsByOrder = useMemo(() => {
    const map = new Map<number, FiscalDoc>();
    for (const d of docs) {
      if (!map.has(d.order_id)) map.set(d.order_id, d);
    }
    return map;
  }, [docs]);

  const rows = useMemo(() => {
    return orders
      .slice()
      .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
      .map((order) => ({
        order,
        doc: docsByOrder.get(order.id) || null
      }));
  }, [orders, docsByOrder]);

  async function saveSettings() {
    if (!supabase || !userId) return;
    const { error: upsertError } = await supabase.from("fiscal_settings").upsert({
      user_id: userId,
      invoice_series: settings.invoice_series,
      environment: settings.environment,
      provider_name: settings.provider_name
    });
    if (upsertError) {
      setError(`Nao foi possivel salvar configuracoes fiscais: ${upsertError.message}`);
      return;
    }
    setInfo("Configuracoes fiscais salvas.");
  }

  async function emitNf(order: CachedOrder) {
    if (!supabase || !userId) return;
    setIssuingOrderId(order.id);
    setError(null);
    setInfo(null);

    try {
      const { data: payload, error: fnError } = await supabase.functions.invoke("nf-emit", {
        body: {
          order_id: order.id,
          order_total: Number(order.total_amount) || 0,
          invoice_series: settings.invoice_series,
          environment: settings.environment,
          provider_name: settings.provider_name
        }
      });

      if (fnError) throw new Error(fnError.message);

      const resp = (payload || {}) as Record<string, unknown>;
      const status = String(resp.status || "pending_provider");
      const invoiceNumber = String(resp.invoice_number || "");
      const accessKey = String(resp.access_key || "");
      const providerRef = String(resp.provider_ref || "");
      const providerMessage = String(resp.message || "");

      const { data: savedDoc, error: saveError } = await supabase
        .from("fiscal_documents")
        .upsert({
          user_id: userId,
          order_id: order.id,
          status,
          invoice_number: invoiceNumber || null,
          invoice_series: settings.invoice_series || null,
          access_key: accessKey || null,
          provider_ref: providerRef || null,
          error_message: status.includes("error") ? providerMessage || "Falha no emissor." : null,
          issued_at: status.includes("authoriz") ? new Date().toISOString() : null
        })
        .select("*")
        .single();

      if (saveError) throw new Error(saveError.message);

      setDocs((prev) => {
        const filtered = prev.filter((item) => item.order_id !== order.id);
        return [savedDoc as FiscalDoc, ...filtered];
      });
      setInfo(
        status.includes("authoriz")
          ? `NF autorizada para pedido #${order.id}.`
          : `Pedido #${order.id} enviado ao emissor (${statusLabel(status)}).`
      );
    } catch (emitError) {
      const message = emitError instanceof Error ? emitError.message : "Erro ao emitir NF.";
      const friendly =
        message.includes("Function not found") || message.includes("404")
          ? "Funcao nf-emit nao encontrada. Faça deploy da Edge Function."
          : `Falha ao emitir NF: ${message}`;
      setError(friendly);
    } finally {
      setIssuingOrderId(null);
    }
  }

  return (
    <section className="page">
      <div className="products-head">
        <div>
          <h2>Nota Fiscal</h2>
          <p className="page-text">Emissao inicial de NF por pedido com status salvo no Supabase.</p>
        </div>
      </div>

      <div className="nf-settings-card">
        <h3>Configuracao fiscal</h3>
        <div className="form-grid three-col">
          <label className="field">
            <span>Serie NF</span>
            <input
              value={settings.invoice_series}
              onChange={(e) => setSettings((s) => ({ ...s, invoice_series: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Ambiente</span>
            <select
              value={settings.environment}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  environment: e.target.value === "producao" ? "producao" : "homologacao"
                }))
              }
            >
              <option value="homologacao">Homologacao</option>
              <option value="producao">Producao</option>
            </select>
          </label>
          <label className="field">
            <span>Provedor</span>
            <input
              value={settings.provider_name}
              onChange={(e) => setSettings((s) => ({ ...s, provider_name: e.target.value }))}
            />
          </label>
        </div>
        <div className="actions-row">
          <button type="button" className="primary-btn" onClick={saveSettings}>
            Salvar configuracoes
          </button>
        </div>
      </div>

      {loading && <p className="page-text">Carregando pedidos e documentos fiscais...</p>}
      {error && <p className="error-text">{error}</p>}
      {info && <p className="page-text">{info}</p>}

      {!loading && rows.length === 0 && (
        <p className="page-text">Nenhum pedido encontrado no cache. Sincronize no modulo Mercado Livre.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="table-wrap">
          <table className="table clean">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Data</th>
                <th>Cliente</th>
                <th>Titulo</th>
                <th>Valor</th>
                <th>Status NF</th>
                <th>Chave</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ order, doc }) => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>{fmtDate(order.date_created)}</td>
                  <td>{buyerFromOrder(order)}</td>
                  <td>{titleFromOrder(order)}</td>
                  <td>{fmtMoney(order.total_amount)}</td>
                  <td>
                    <span className={`nf-chip ${String(doc?.status || "").toLowerCase()}`}>
                      {statusLabel(doc?.status)}
                    </span>
                  </td>
                  <td>{doc?.access_key || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={issuingOrderId === order.id}
                      onClick={() => void emitNf(order)}
                    >
                      {issuingOrderId === order.id ? "Emitindo..." : "Emitir NF"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

