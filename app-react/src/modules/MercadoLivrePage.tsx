import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type SellerProfile = {
  id: number;
  nickname?: string;
  first_name?: string;
  last_name?: string;
};

type OrderItem = {
  title?: string;
  quantity?: number;
  unit_price?: number;
};

type Order = {
  id: number;
  date_created?: string;
  status?: string;
  total_amount?: number;
  paid_amount?: number;
  order_items?: Array<{ item?: OrderItem; quantity?: number; unit_price?: number }>;
};

type OrdersResponse = {
  results?: Order[];
};

type DashboardStats = {
  ordersCount: number;
  unitsCount: number;
  grossRevenue: number;
  paidRevenue: number;
  avgTicket: number;
};

type TopProduct = {
  title: string;
  units: number;
  amount: number;
};

function fmtMoney(value: number) {
  return (Number(value) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function tokenSettingId(userId: string) {
  return `ml_access_token_${userId}`;
}

function normalizeMlRedirectUri(input?: string) {
  const base = (input || `${window.location.origin}/mercado-livre`).trim();
  try {
    const url = new URL(base);
    // Se vier sem caminho ("/"), força callback da página do módulo.
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/mercado-livre";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return `${window.location.origin}/mercado-livre`;
  }
}

async function fetchMl<T>(path: string, token: string) {
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Erro ${response.status} ao consultar Mercado Livre.`);
  }

  return (await response.json()) as T;
}

function computeStats(orders: Order[]): { stats: DashboardStats; topProducts: TopProduct[] } {
  const ordersCount = orders.length;
  let unitsCount = 0;
  let grossRevenue = 0;
  let paidRevenue = 0;
  const topMap = new Map<string, { units: number; amount: number }>();

  for (const order of orders) {
    grossRevenue += Number(order.total_amount) || 0;
    paidRevenue += Number(order.paid_amount) || 0;
    const items = order.order_items || [];

    for (const row of items) {
      const item = row.item || {};
      const qty = Number(row.quantity ?? item.quantity) || 0;
      const unitPrice = Number(row.unit_price ?? item.unit_price) || 0;
      const title = item.title?.trim() || "Produto sem titulo";
      const amount = qty * unitPrice;

      unitsCount += qty;
      const current = topMap.get(title) || { units: 0, amount: 0 };
      current.units += qty;
      current.amount += amount;
      topMap.set(title, current);
    }
  }

  const avgTicket = ordersCount > 0 ? grossRevenue / ordersCount : 0;
  const topProducts = [...topMap.entries()]
    .map(([title, values]) => ({
      title,
      units: values.units,
      amount: values.amount
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  return {
    stats: {
      ordersCount,
      unitsCount,
      grossRevenue,
      paidRevenue,
      avgTicket
    },
    topProducts
  };
}

export function MercadoLivrePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [oauthCode, setOauthCode] = useState<string | null>(null);

  const viteEnv = ((import.meta as any)?.env || {}) as Record<string, string | undefined>;
  const fallbackMlClientId = "3165979914917791";
  const clientId = (viteEnv.VITE_ML_CLIENT_ID || fallbackMlClientId)?.trim();
  const redirectUri = normalizeMlRedirectUri(viteEnv.VITE_ML_REDIRECT_URI);
  const adminAccessToken = viteEnv.VITE_ML_ADMIN_ACCESS_TOKEN?.trim();
  const hasOAuthConfig = Boolean(clientId);

  useEffect(() => {
    let mounted = true;

    async function loadUserAndToken() {
      if (!supabase) return;

      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id || null;
      if (!mounted) return;

      setUserId(uid);

      if (!uid) return;
      const { data: tokenRow } = await supabase
        .from("app_settings")
        .select("config_data")
        .eq("id", tokenSettingId(uid))
        .maybeSingle();

      const token = String(tokenRow?.config_data?.access_token || "").trim();
      if (token) {
        setAccessToken(token);
        return;
      }

      if (adminAccessToken) {
        setAccessToken(adminAccessToken);
      }
    }

    function readCodeFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (!code) return;
      setOauthCode(code);
      setSyncInfo("Codigo OAuth recebido. Clique em trocar codigo por token.");
    }

    loadUserAndToken();
    readCodeFromUrl();

    return () => {
      mounted = false;
    };
  }, []);

  const statsAndTop = useMemo(() => computeStats(orders), [orders]);

  async function syncData(token: string) {
    setLoading(true);
    setSyncError(null);
    setSyncInfo(null);

    try {
      const profile = await fetchMl<SellerProfile>("/users/me", token);
      const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const ordersResponse = await fetchMl<OrdersResponse>(
        `/orders/search?seller=${profile.id}&sort=date_desc&limit=50&order.date_created.from=${encodeURIComponent(fromDate)}`,
        token
      );

      setSeller(profile);
      setOrders(ordersResponse.results || []);
      setSyncInfo("Dados sincronizados com sucesso (janela de 30 dias).");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao sincronizar dados do Mercado Livre.";
      setSyncError(
        `Nao foi possivel sincronizar. Verifique token/permissoes. Detalhe: ${message}`
      );
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (supabase && userId) {
      await supabase.from("app_settings").delete().eq("id", tokenSettingId(userId));
    }
    setAccessToken(adminAccessToken || "");
    setSeller(null);
    setOrders([]);
    setOauthCode(null);
    setSyncInfo("Conexao removida.");
    setSyncError(null);
  }

  function startOAuth() {
    if (!hasOAuthConfig || !clientId) {
      setSyncError("Configure VITE_ML_CLIENT_ID no .env.");
      return;
    }

    const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", crypto.randomUUID());
    window.location.assign(authUrl.toString());
  }

  async function exchangeCodeWithEdgeFunction() {
    if (!supabase) {
      setSyncError("Supabase nao configurado para trocar o codigo.");
      return;
    }
    if (!oauthCode) {
      setSyncError("Nao existe codigo OAuth na URL.");
      return;
    }

    setLoading(true);
    setSyncError(null);

    try {
      const { data, error } = await supabase.functions.invoke("ml-oauth-token", {
        body: {
          code: oauthCode,
          redirect_uri: redirectUri
        }
      });

      if (error) throw new Error(error.message);
      const token = String(data?.access_token || "").trim();
      if (!token) throw new Error("Edge Function nao retornou access_token.");

      if (!userId) throw new Error("Usuario nao autenticado para salvar token.");

      const { error: saveError } = await supabase.from("app_settings").upsert({
        id: tokenSettingId(userId),
        config_data: { access_token: token }
      });

      if (saveError) throw new Error(saveError.message);

      setAccessToken(token);
      setSyncInfo("Token recebido com sucesso via Edge Function.");
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, cleanUrl);
      setOauthCode(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao trocar codigo por token.";
      setSyncError(`Nao foi possivel trocar o codigo. Detalhe: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page ml-page">
      <div className="ml-hero">
        <div>
          <p className="eyebrow">Novo modulo</p>
          <h2>Painel Mercado Livre</h2>
          <p className="page-text">
            Conecte sua conta e acompanhe vendas, faturamento, ticket medio e top produtos em um
            painel unico.
          </p>
        </div>
        <div className="ml-hero-actions">
          <button className="primary-btn" onClick={startOAuth} type="button">
            Conectar conta Mercado Livre
          </button>
          <button
            className="ghost-btn"
            onClick={() => syncData(accessToken)}
            type="button"
            disabled={!accessToken || loading}
          >
            {loading ? "Sincronizando..." : "Sincronizar agora"}
          </button>
        </div>
      </div>

      <div className="ml-connection-card">
        <h3>Conexao</h3>
        <p className="page-text">
          Clique em conectar para autorizar sua conta automaticamente.
        </p>
        <div className="actions-row">
          <button className="ghost-btn" onClick={disconnect} type="button">
            Desconectar conta atual
          </button>
        </div>

        {!hasOAuthConfig && (
          <p className="info">
            OAuth nao configurado. Adicione `VITE_ML_CLIENT_ID` no arquivo `.env`.
          </p>
        )}

        {oauthCode && (
          <div className="soft-panel">
            <p>Codigo OAuth detectado</p>
            <ul>
              <li>Codigo recebido na URL e pronto para troca por token.</li>
              <li>
                Proximo passo seguro: usar Edge Function `ml-oauth-token` com `client_secret`.
              </li>
            </ul>
            <button
              className="primary-btn"
              onClick={exchangeCodeWithEdgeFunction}
              type="button"
              disabled={loading}
            >
              Trocar codigo por token (Edge Function)
            </button>
          </div>
        )}

        {syncError && <p className="error-text">{syncError}</p>}
        {syncInfo && <p className="page-text">{syncInfo}</p>}
      </div>

      <div className="kpi-grid kpi-grid-4">
        <article className="kpi-card elevated">
          <p>Vendas (30 dias)</p>
          <strong>{statsAndTop.stats.ordersCount}</strong>
        </article>
        <article className="kpi-card elevated">
          <p>Unidades vendidas</p>
          <strong>{statsAndTop.stats.unitsCount}</strong>
        </article>
        <article className="kpi-card elevated">
          <p>Faturamento bruto</p>
          <strong>{fmtMoney(statsAndTop.stats.grossRevenue)}</strong>
        </article>
        <article className="kpi-card elevated">
          <p>Ticket medio</p>
          <strong>{fmtMoney(statsAndTop.stats.avgTicket)}</strong>
        </article>
      </div>

      <div className="ops-grid">
        <article className="ops-card">
          <h3>Conta conectada</h3>
          {seller ? (
            <ul className="task-list">
              <li>Seller ID: {seller.id}</li>
              <li>Nickname: {seller.nickname || "-"}</li>
              <li>
                Nome: {[seller.first_name, seller.last_name].filter(Boolean).join(" ") || "-"}
              </li>
              <li>Receita paga: {fmtMoney(statsAndTop.stats.paidRevenue)}</li>
            </ul>
          ) : (
            <p className="page-text">Nenhuma conta sincronizada ainda.</p>
          )}
        </article>

        <article className="ops-card">
          <h3>Top produtos por faturamento</h3>
          {statsAndTop.topProducts.length === 0 ? (
            <p className="page-text">Sincronize para visualizar produtos mais vendidos.</p>
          ) : (
            <div className="ml-top-list">
              {statsAndTop.topProducts.map((item) => (
                <div key={item.title} className="ml-top-item">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.units} unidade(s)</p>
                  </div>
                  <span>{fmtMoney(item.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
