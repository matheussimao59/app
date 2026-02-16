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
  provider_base_url: string;
  cnpj: string;
  ie: string;
  razao_social: string;
  nome_fantasia: string;
  regime_tributario: string;
  email_fiscal: string;
  telefone_fiscal: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  certificate_provider_ref: string;
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

function missingFiscalFields(settings: FiscalSettings) {
  const required: Array<[keyof FiscalSettings, string]> = [
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
  ];

  return required
    .filter(([field]) => !String(settings[field] || "").trim())
    .map(([, label]) => label);
}

export function NotaFiscalPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [orders, setOrders] = useState<CachedOrder[]>([]);
  const [docs, setDocs] = useState<FiscalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [issuingOrderId, setIssuingOrderId] = useState<number | null>(null);
  const [refreshingDocId, setRefreshingDocId] = useState<string | null>(null);
  const [settings, setSettings] = useState<FiscalSettings>({
    invoice_series: "1",
    environment: "homologacao",
    provider_name: "nuvemfiscal",
    provider_base_url: "https://api.nuvemfiscal.com.br",
    cnpj: "",
    ie: "",
    razao_social: "",
    nome_fantasia: "",
    regime_tributario: "simples_nacional",
    email_fiscal: "",
    telefone_fiscal: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    certificate_provider_ref: ""
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
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();

      if (settingsRow && mounted) {
        setSettings((prev) => ({
          ...prev,
          invoice_series: String(settingsRow.invoice_series || "1"),
          environment:
            String(settingsRow.environment || "homologacao") === "producao"
              ? "producao"
              : "homologacao",
          provider_name: String(settingsRow.provider_name || "nuvemfiscal"),
          provider_base_url: String(settingsRow.provider_base_url || "https://api.nuvemfiscal.com.br"),
          cnpj: String(settingsRow.cnpj || ""),
          ie: String(settingsRow.ie || ""),
          razao_social: String(settingsRow.razao_social || ""),
          nome_fantasia: String(settingsRow.nome_fantasia || ""),
          regime_tributario: String(settingsRow.regime_tributario || "simples_nacional"),
          email_fiscal: String(settingsRow.email_fiscal || ""),
          telefone_fiscal: String(settingsRow.telefone_fiscal || ""),
          cep: String(settingsRow.cep || ""),
          logradouro: String(settingsRow.logradouro || ""),
          numero: String(settingsRow.numero || ""),
          complemento: String(settingsRow.complemento || ""),
          bairro: String(settingsRow.bairro || ""),
          cidade: String(settingsRow.cidade || ""),
          uf: String(settingsRow.uf || ""),
          certificate_provider_ref: String(settingsRow.certificate_provider_ref || "")
        }));
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
      ...settings
    });
    if (upsertError) {
      setError(`Nao foi possivel salvar configuracoes fiscais: ${upsertError.message}`);
      return;
    }
    setInfo("Configuracoes fiscais salvas.");
  }

  async function emitNf(order: CachedOrder) {
    if (!supabase || !userId) return;

    const missing = missingFiscalFields(settings);
    if (missing.length > 0) {
      setError(`Complete os dados fiscais antes de emitir NF: ${missing.join(", ")}.`);
      return;
    }

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
          provider_name: settings.provider_name,
          provider_base_url: settings.provider_base_url,
          order_title: titleFromOrder(order),
          buyer_name: buyerFromOrder(order),
          emitter: {
            cnpj: settings.cnpj,
            ie: settings.ie,
            razao_social: settings.razao_social,
            nome_fantasia: settings.nome_fantasia,
            regime_tributario: settings.regime_tributario,
            email_fiscal: settings.email_fiscal,
            telefone_fiscal: settings.telefone_fiscal,
            cep: settings.cep,
            logradouro: settings.logradouro,
            numero: settings.numero,
            complemento: settings.complemento,
            bairro: settings.bairro,
            cidade: settings.cidade,
            uf: settings.uf,
            certificate_provider_ref: settings.certificate_provider_ref
          }
        }
      });

      if (fnError) throw new Error(fnError.message);

      const resp = (payload || {}) as Record<string, unknown>;
      const status = String(resp.status || "pending_provider");
      const invoiceNumber = String(resp.invoice_number || "");
      const accessKey = String(resp.access_key || "");
      const providerRef = String(resp.provider_ref || "");
      const providerMessage = String(resp.message || "");
      const xmlUrl = String(resp.xml_url || "");
      const pdfUrl = String(resp.pdf_url || "");

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
          xml_url: xmlUrl || null,
          pdf_url: pdfUrl || null,
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
          ? "Funcao nf-emit nao encontrada. Faca deploy da Edge Function."
          : `Falha ao emitir NF: ${message}`;
      setError(friendly);
    } finally {
      setIssuingOrderId(null);
    }
  }

  async function refreshDocStatus(doc: FiscalDoc) {
    if (!supabase || !userId || !doc.provider_ref) return;
    setRefreshingDocId(doc.id);
    setError(null);
    try {
      const { data: payload, error: fnError } = await supabase.functions.invoke("nf-status", {
        body: {
          provider_ref: doc.provider_ref,
          provider_name: settings.provider_name,
          provider_base_url: settings.provider_base_url,
          environment: settings.environment
        }
      });
      if (fnError) throw new Error(fnError.message);

      const resp = (payload || {}) as Record<string, unknown>;
      const status = String(resp.status || doc.status || "pending_provider");
      const invoiceNumber = String(resp.invoice_number || doc.invoice_number || "");
      const accessKey = String(resp.access_key || doc.access_key || "");
      const xmlUrl = String(resp.xml_url || doc.xml_url || "");
      const pdfUrl = String(resp.pdf_url || doc.pdf_url || "");
      const providerMessage = String(resp.message || "");

      const { data: savedDoc, error: saveError } = await supabase
        .from("fiscal_documents")
        .update({
          status,
          invoice_number: invoiceNumber || null,
          access_key: accessKey || null,
          xml_url: xmlUrl || null,
          pdf_url: pdfUrl || null,
          error_message: status.includes("error") ? providerMessage || "Falha no emissor." : null,
          issued_at:
            status.includes("authoriz") && !doc.issued_at ? new Date().toISOString() : doc.issued_at
        })
        .eq("id", doc.id)
        .select("*")
        .single();
      if (saveError) throw new Error(saveError.message);

      setDocs((prev) => prev.map((d) => (d.id === doc.id ? (savedDoc as FiscalDoc) : d)));
    } catch (statusError) {
      const message = statusError instanceof Error ? statusError.message : "Falha ao consultar status da NF.";
      setError(`Nao foi possivel atualizar status: ${message}`);
    } finally {
      setRefreshingDocId(null);
    }
  }

  return (
    <section className="page">
      <div className="products-head">
        <div>
          <h2>Nota Fiscal</h2>
          <p className="page-text">Emissao e acompanhamento de NF por pedido.</p>
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
          <label className="field">
            <span>URL base provedor</span>
            <input
              value={settings.provider_base_url}
              onChange={(e) => setSettings((s) => ({ ...s, provider_base_url: e.target.value }))}
              placeholder="https://api.nuvemfiscal.com.br"
            />
          </label>
          <label className="field">
            <span>CNPJ</span>
            <input value={settings.cnpj} onChange={(e) => setSettings((s) => ({ ...s, cnpj: e.target.value }))} />
          </label>
          <label className="field">
            <span>IE</span>
            <input value={settings.ie} onChange={(e) => setSettings((s) => ({ ...s, ie: e.target.value }))} />
          </label>
          <label className="field">
            <span>Razao social</span>
            <input
              value={settings.razao_social}
              onChange={(e) => setSettings((s) => ({ ...s, razao_social: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Nome fantasia</span>
            <input
              value={settings.nome_fantasia}
              onChange={(e) => setSettings((s) => ({ ...s, nome_fantasia: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Regime tributario</span>
            <select
              value={settings.regime_tributario}
              onChange={(e) => setSettings((s) => ({ ...s, regime_tributario: e.target.value }))}
            >
              <option value="simples_nacional">Simples Nacional</option>
              <option value="lucro_presumido">Lucro Presumido</option>
              <option value="lucro_real">Lucro Real</option>
            </select>
          </label>
          <label className="field">
            <span>Email fiscal</span>
            <input
              value={settings.email_fiscal}
              onChange={(e) => setSettings((s) => ({ ...s, email_fiscal: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Telefone</span>
            <input
              value={settings.telefone_fiscal}
              onChange={(e) => setSettings((s) => ({ ...s, telefone_fiscal: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>CEP</span>
            <input value={settings.cep} onChange={(e) => setSettings((s) => ({ ...s, cep: e.target.value }))} />
          </label>
          <label className="field">
            <span>Logradouro</span>
            <input
              value={settings.logradouro}
              onChange={(e) => setSettings((s) => ({ ...s, logradouro: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Numero</span>
            <input value={settings.numero} onChange={(e) => setSettings((s) => ({ ...s, numero: e.target.value }))} />
          </label>
          <label className="field">
            <span>Complemento</span>
            <input
              value={settings.complemento}
              onChange={(e) => setSettings((s) => ({ ...s, complemento: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Bairro</span>
            <input value={settings.bairro} onChange={(e) => setSettings((s) => ({ ...s, bairro: e.target.value }))} />
          </label>
          <label className="field">
            <span>Cidade</span>
            <input value={settings.cidade} onChange={(e) => setSettings((s) => ({ ...s, cidade: e.target.value }))} />
          </label>
          <label className="field">
            <span>UF</span>
            <input value={settings.uf} maxLength={2} onChange={(e) => setSettings((s) => ({ ...s, uf: e.target.value.toUpperCase() }))} />
          </label>
          <label className="field">
            <span>Referencia certificado (provedor)</span>
            <input
              value={settings.certificate_provider_ref}
              onChange={(e) =>
                setSettings((s) => ({ ...s, certificate_provider_ref: e.target.value }))
              }
              placeholder="ID/alias do certificado A1 no provedor"
            />
          </label>
        </div>
        <div className="actions-row">
          <button type="button" className="primary-btn" onClick={saveSettings}>
            Salvar configuracoes
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              const pending = docs.filter((d) => String(d.status || "").toLowerCase().includes("pending"));
              void Promise.all(pending.map((d) => refreshDocStatus(d)));
            }}
            disabled={docs.length === 0}
          >
            Atualizar NF pendentes
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
                <th>XML/PDF</th>
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
                  <td>
                    <div className="materials-actions-cell">
                      {doc?.xml_url ? (
                        <a className="ghost-link" href={doc.xml_url} target="_blank" rel="noreferrer">
                          XML
                        </a>
                      ) : (
                        <span>-</span>
                      )}
                      {doc?.pdf_url ? (
                        <a className="ghost-link" href={doc.pdf_url} target="_blank" rel="noreferrer">
                          PDF
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td>{doc?.access_key || "-"}</td>
                  <td>
                    <div className="materials-actions-cell">
                      <button
                        type="button"
                        className="ghost-btn"
                        disabled={issuingOrderId === order.id}
                        onClick={() => void emitNf(order)}
                      >
                        {issuingOrderId === order.id ? "Emitindo..." : "Emitir NF"}
                      </button>
                      {doc?.provider_ref ? (
                        <button
                          type="button"
                          className="ghost-btn"
                          disabled={refreshingDocId === doc.id}
                          onClick={() => void refreshDocStatus(doc)}
                        >
                          {refreshingDocId === doc.id ? "Atualizando..." : "Status"}
                        </button>
                      ) : null}
                    </div>
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
