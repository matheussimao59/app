import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type SellerProfile = {
  id: number;
  nickname?: string;
  first_name?: string;
  last_name?: string;
};

type OrderItem = {
  id?: string;
  title?: string;
  quantity?: number;
  unit_price?: number;
  seller_sku?: string;
  thumbnail?: string;
  sale_fee?: number;
};

type Order = {
  id: number;
  date_created?: string;
  status?: string;
  total_amount?: number;
  paid_amount?: number;
  shipping_cost?: number;
  taxes_amount?: number;
  payments?: Array<{
    status?: string;
    marketplace_fee?: number;
    taxes_amount?: number;
    shipping_cost?: number;
    total_paid_amount?: number;
    transaction_amount?: number;
    fee_amount?: number;
    charges_details?: Array<{ name?: string; amount?: number }>;
    fee_details?: Array<{ type?: string; amount?: number }>;
  }>;
  order_items?: Array<{
    item?: OrderItem;
    quantity?: number;
    unit_price?: number;
    sale_fee?: number;
    listing_fee?: number;
  }>;
};

type SyncResponse = {
  seller?: SellerProfile;
  orders?: Order[];
};

type DashboardStats = {
  ordersCount: number;
  unitsCount: number;
  grossRevenue: number;
  paidRevenue: number;
  avgTicket: number;
  cancelledCount: number;
  cancelledAmount: number;
  feesEstimated: number;
  taxesEstimated: number;
  shippingEstimated: number;
  profitEstimated: number;
  avgProfit: number;
};

type TopProduct = {
  title: string;
  units: number;
  amount: number;
  share: number;
};

type OrderLine = {
  id: number;
  title: string;
  sku: string;
  thumb: string;
  date: string;
  qty: number;
  amount: number;
  fee: number;
  profit: number;
  status: string;
};

type SavedProduct = {
  id: string | number;
  product_name: string | null;
  base_cost: number | null;
  materials_json?: unknown;
};

type CostLinks = {
  by_sku?: Record<string, string>;
  by_title?: Record<string, string>;
};

const PERIODS = [
  { label: "Hoje", days: 1 },
  { label: "Ontem", days: 2 },
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "Mes atual", days: 31 }
];

function getRangeByPeriod(days: number) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (days === 1) {
    start.setHours(0, 0, 0, 0);
    return { fromDate: start.toISOString(), toDate: end.toISOString() };
  }

  if (days === 2) {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return { fromDate: start.toISOString(), toDate: end.toISOString() };
  }

  if (days === 31) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { fromDate: start.toISOString(), toDate: end.toISOString() };
  }

  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { fromDate: start.toISOString(), toDate: end.toISOString() };
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
  const s = String(status || "").toLowerCase();
  if (s.includes("cancel")) return "Cancelada";
  if (s.includes("paid")) return "Paga";
  if (s.includes("payment")) return "Pagamento";
  if (s.includes("deliv")) return "Entregue";
  return status || "-";
}

function orderItemThumb(order: Order) {
  const first = order.order_items?.[0]?.item?.thumbnail?.trim();
  return first || "";
}

function calcPaymentFee(payment: NonNullable<Order["payments"]>[number]) {
  const direct =
    Number(payment.marketplace_fee) || Number(payment.fee_amount) || 0;
  if (direct > 0) return direct;

  const chargeFee = (payment.charges_details || [])
    .filter((c) => String(c.name || "").toLowerCase().includes("fee"))
    .reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  if (chargeFee > 0) return chargeFee;

  const feeDetail = (payment.fee_details || [])
    .reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  if (feeDetail > 0) return feeDetail;

  const transactionAmount = Number(payment.transaction_amount) || 0;
  const totalPaidAmount = Number(payment.total_paid_amount) || 0;
  const diff = Math.max(transactionAmount - totalPaidAmount, 0);
  if (diff > 0) return diff;

  return 0;
}

function calcOrderFee(order: Order, total: number, paid: number) {
  const payments = order.payments || [];
  let feeByPayments = 0;
  for (const p of payments) {
    if (String(p.status || "").toLowerCase() === "cancelled") continue;
    feeByPayments += calcPaymentFee(p);
  }
  if (feeByPayments > 0) return feeByPayments;

  let feeByItems = 0;
  for (const row of order.order_items || []) {
    const item = row.item || {};
    const qty = Number(row.quantity ?? item.quantity) || 0;
    const saleFee =
      Number(row.sale_fee) ||
      Number((row as { listing_fee?: number }).listing_fee) ||
      Number(item.sale_fee) ||
      0;
    feeByItems += saleFee * Math.max(1, qty);
  }
  if (feeByItems > 0) return feeByItems;

  return Math.max(total - paid, 0);
}

function calcOrderTaxes(order: Order) {
  const payments = order.payments || [];
  let taxesByPayments = 0;
  for (const p of payments) {
    if (String(p.status || "").toLowerCase() === "cancelled") continue;
    taxesByPayments += Number(p.taxes_amount) || 0;
  }
  const taxesRoot = Number(order.taxes_amount) || 0;
  return taxesByPayments > 0 ? taxesByPayments : taxesRoot;
}

function calcOrderShipping(order: Order) {
  const payments = order.payments || [];
  let shippingByPayments = 0;
  for (const p of payments) {
    if (String(p.status || "").toLowerCase() === "cancelled") continue;
    shippingByPayments += Number(p.shipping_cost) || 0;
  }
  const shippingRoot = Number(order.shipping_cost) || 0;
  return shippingByPayments > 0 ? shippingByPayments : shippingRoot;
}

function tokenSettingId(userId: string) {
  return `ml_access_token_${userId}`;
}

function costLinksSettingId(userId: string) {
  return `ml_cost_links_${userId}`;
}

function normalizeKey(text?: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeMlRedirectUri(input?: string) {
  const base = (input || `${window.location.origin}/mercado-livre`).trim();
  try {
    const url = new URL(base);
    const currentHost = window.location.hostname;
    const inputHost = url.hostname;

    // Evita usar redirect de dominio errado em producao (ex: .com vs .com.br).
    if (
      input &&
      inputHost &&
      currentHost &&
      inputHost !== currentHost &&
      currentHost !== "localhost" &&
      currentHost !== "127.0.0.1"
    ) {
      return `${window.location.origin}/mercado-livre`;
    }

    // Se vier sem caminho ("/"), força callback da página do módulo.
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/mercado-livre";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return `${window.location.origin}/mercado-livre`;
  }
}

function base64UrlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createCodeVerifier(size = 96) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const arr = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

async function createCodeChallenge(verifier: string) {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64UrlEncode(digest);
}

function computeStats(orders: Order[]): { stats: DashboardStats; topProducts: TopProduct[]; lines: OrderLine[] } {
  const validOrders = orders.filter((order) => !String(order.status || "").toLowerCase().includes("cancel"));
  const ordersCount = validOrders.length;
  let unitsCount = 0;
  let grossRevenue = 0;
  let paidRevenue = 0;
  let cancelledCount = 0;
  let cancelledAmount = 0;
  let feesEstimated = 0;
  let taxesEstimated = 0;
  let shippingEstimated = 0;
  const topMap = new Map<string, { units: number; amount: number }>();
  const lines: OrderLine[] = [];

  for (const order of orders) {
    const total = Number(order.total_amount) || 0;
    const paid = Number(order.paid_amount) || 0;
    const fee = calcOrderFee(order, total, paid);
    const taxes = calcOrderTaxes(order);
    const shipping = calcOrderShipping(order);
    const isCancelled = String(order.status || "").toLowerCase().includes("cancel");
    const items = order.order_items || [];
    let rowQty = 0;
    let rowTitle = "Produto sem titulo";
    let rowSku = "-";

    if (isCancelled) {
      cancelledCount += 1;
      cancelledAmount += total;
    } else {
      grossRevenue += total;
      paidRevenue += paid;
      feesEstimated += fee;
      taxesEstimated += taxes;
      shippingEstimated += shipping;
    }

    for (const row of items) {
      const item = row.item || {};
      const qty = Number(row.quantity ?? item.quantity) || 0;
      const unitPrice = Number(row.unit_price ?? item.unit_price) || 0;
      const title = item.title?.trim() || "Produto sem titulo";
      const amount = qty * unitPrice;

      if (!isCancelled) {
        unitsCount += qty;
        const current = topMap.get(title) || { units: 0, amount: 0 };
        current.units += qty;
        current.amount += amount;
        topMap.set(title, current);
      }

      rowQty += qty;
      if (rowTitle === "Produto sem titulo" && title) rowTitle = title;
      if (rowSku === "-" && item.seller_sku) rowSku = item.seller_sku;
    }

    lines.push({
      id: order.id,
      title: rowTitle,
      sku: rowSku,
      thumb: orderItemThumb(order),
      date: fmtDate(order.date_created),
      qty: rowQty,
      amount: total,
      fee,
      profit: total - fee - taxes - shipping,
      status: normalizeStatus(order.status)
    });
  }

  const avgTicket = ordersCount > 0 ? grossRevenue / ordersCount : 0;
  const profitEstimated = grossRevenue - feesEstimated - taxesEstimated - shippingEstimated;
  const avgProfit = ordersCount > 0 ? profitEstimated / ordersCount : 0;
  const topProducts = [...topMap.entries()]
    .map(([title, values]) => ({
      title,
      units: values.units,
      amount: values.amount,
      share: grossRevenue > 0 ? (values.amount / grossRevenue) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  return {
    stats: {
      ordersCount,
      unitsCount,
      grossRevenue,
      paidRevenue,
      avgTicket,
      cancelledCount,
      cancelledAmount,
      feesEstimated,
      taxesEstimated,
      shippingEstimated,
      profitEstimated,
      avgProfit
    },
    topProducts,
    lines: lines.sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 20)
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
  const [rangeDays, setRangeDays] = useState(30);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([]);
  const [costLinks, setCostLinks] = useState<CostLinks>({});
  const [savingLinkKey, setSavingLinkKey] = useState<string | null>(null);
  const handledOauthCodeRef = useRef<string | null>(null);
  const syncRunningRef = useRef(false);

  const viteEnv = ((import.meta as any)?.env || {}) as Record<string, string | undefined>;
  const fallbackMlClientId = "3165979914917791";
  const clientId = (viteEnv.VITE_ML_CLIENT_ID || fallbackMlClientId)?.trim();
  const redirectUri = normalizeMlRedirectUri(viteEnv.VITE_ML_REDIRECT_URI);
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
      }

      const { data: productsData } = await supabase
        .from("pricing_products")
        .select("id, product_name, base_cost, materials_json")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      setSavedProducts((productsData || []) as SavedProduct[]);

      const { data: linksRow } = await supabase
        .from("app_settings")
        .select("config_data")
        .eq("id", costLinksSettingId(uid))
        .maybeSingle();
      const rawLinks = (linksRow?.config_data || {}) as CostLinks;
      setCostLinks({
        by_sku: rawLinks.by_sku || {},
        by_title: rawLinks.by_title || {}
      });
    }

    function readCodeFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get("error");
      const oauthDesc = params.get("error_description");
      if (oauthError) {
        setSyncError(
          `OAuth Mercado Livre: ${oauthError}${oauthDesc ? ` - ${decodeURIComponent(oauthDesc)}` : ""}`
        );
        return;
      }
      const code = params.get("code");
      if (!code) return;
      setOauthCode(code);
      setSyncInfo("Codigo OAuth recebido. Finalizando conexao automaticamente...");
    }

    loadUserAndToken();
    readCodeFromUrl();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!oauthCode || !userId) return;
    if (handledOauthCodeRef.current === oauthCode) return;
    handledOauthCodeRef.current = oauthCode;
    void completeOAuthAndSync(oauthCode);
  }, [oauthCode, userId]);

  useEffect(() => {
    if (!accessToken || !userId) return;

    void syncData(accessToken, rangeDays, true);
    const timer = window.setInterval(() => {
      void syncData(accessToken, rangeDays, true);
    }, 20_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [accessToken, rangeDays, userId]);

  const dashboard = useMemo(() => computeStats(orders), [orders]);
  const productsById = useMemo(() => {
    const map = new Map<string, SavedProduct>();
    for (const p of savedProducts) {
      map.set(String(p.id), p);
    }
    return map;
  }, [savedProducts]);

  function findMatchedProduct(line: OrderLine) {
    const skuKey = normalizeKey(line.sku);
    const titleKey = normalizeKey(line.title);

    const linkBySku = skuKey && costLinks.by_sku?.[skuKey];
    if (linkBySku && productsById.has(linkBySku)) return productsById.get(linkBySku) || null;

    const linkByTitle = titleKey && costLinks.by_title?.[titleKey];
    if (linkByTitle && productsById.has(linkByTitle)) return productsById.get(linkByTitle) || null;

    const exactTitle = savedProducts.find((p) => normalizeKey(p.product_name || "") === titleKey);
    if (exactTitle) return exactTitle;

    const containsTitle = savedProducts.find((p) =>
      normalizeKey(p.product_name || "").includes(titleKey) || titleKey.includes(normalizeKey(p.product_name || ""))
    );
    if (containsTitle) return containsTitle;

    return null;
  }

  const linesWithCost = useMemo(() => {
    return dashboard.lines.map((line) => {
      const product = findMatchedProduct(line);
      const unitCost = Number(product?.base_cost) || 0;
      const totalCost = unitCost * Math.max(1, Number(line.qty) || 1);
      const netProfit = line.profit - totalCost;
      return {
        ...line,
        linkedProductId: product ? String(product.id) : "",
        linkedProductName: product?.product_name || "",
        unitCost,
        totalCost,
        netProfit
      };
    });
  }, [dashboard.lines, savedProducts, costLinks, productsById]);

  async function saveCostLink(line: OrderLine, productId: string) {
    if (!supabase || !userId) return;
    const skuKey = normalizeKey(line.sku);
    const titleKey = normalizeKey(line.title);
    const next: CostLinks = {
      by_sku: { ...(costLinks.by_sku || {}) },
      by_title: { ...(costLinks.by_title || {}) }
    };

    if (skuKey) next.by_sku![skuKey] = productId;
    if (titleKey) next.by_title![titleKey] = productId;

    setSavingLinkKey(`${line.id}-${line.sku}-${line.title}`);
    setCostLinks(next);

    const { error } = await supabase.from("app_settings").upsert({
      id: costLinksSettingId(userId),
      config_data: next
    });
    if (error) {
      setSyncError(`Nao foi possivel salvar vinculo de custo: ${error.message}`);
    }
    setSavingLinkKey(null);
  }

  async function syncData(token: string, days = rangeDays, silent = false) {
    if (syncRunningRef.current) return;
    syncRunningRef.current = true;
    setLoading(true);
    if (!silent) {
      setSyncError(null);
      setSyncInfo(null);
    }

    try {
      const { fromDate, toDate } = getRangeByPeriod(days);
      if (!supabase) {
        throw new Error("Supabase nao configurado para sincronizar.");
      }

      const { data, error } = await supabase.functions.invoke("ml-sync", {
        body: {
          access_token: token,
          from_date: fromDate,
          to_date: toDate
        }
      });

      if (error) throw new Error(error.message);
      const payload = (data || {}) as SyncResponse;
      if (!payload?.seller) throw new Error("Resposta invalida da funcao ml-sync.");

      setSeller(payload.seller);
      setOrders(payload.orders || []);
      setLastSyncAt(new Date().toISOString());
      const label = PERIODS.find((p) => p.days === days)?.label || `${days} dias`;
      setSyncInfo(silent ? `Atualizado automaticamente (${label}).` : `Dados sincronizados com sucesso (${label}).`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao sincronizar dados do Mercado Livre.";
      const hint =
        message.includes("Failed to send a request to the Edge Function") ||
        message.includes("FunctionsFetchError")
          ? " Verifique se a funcao `ml-sync` foi deployada no Supabase."
          : "";
      if (!silent) {
        setSyncError(`Nao foi possivel sincronizar. Verifique token/permissoes. Detalhe: ${message}.${hint}`);
      }
    } finally {
      setLoading(false);
      syncRunningRef.current = false;
    }
  }

  async function disconnect() {
    if (supabase && userId) {
      await supabase.from("app_settings").delete().eq("id", tokenSettingId(userId));
    }
    setAccessToken("");
    setSeller(null);
    setOrders([]);
    setOauthCode(null);
    setSyncInfo("Conexao removida.");
    setSyncError(null);
  }

  async function startOAuth() {
    if (!hasOAuthConfig || !clientId) {
      setSyncError("Configure VITE_ML_CLIENT_ID no .env.");
      return;
    }

    const verifier = createCodeVerifier();
    const challenge = await createCodeChallenge(verifier);
    sessionStorage.setItem("ml_pkce_verifier", verifier);

    const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", crypto.randomUUID());
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    window.location.assign(authUrl.toString());
  }

  async function completeOAuthAndSync(code: string) {
    if (!supabase) {
      setSyncError("Supabase nao configurado para trocar o codigo.");
      return;
    }
    if (!code) {
      setSyncError("Nao existe codigo OAuth na URL.");
      return;
    }
    if (!userId) {
      setSyncError("Usuario nao autenticado para salvar token.");
      return;
    }

    setLoading(true);
    setSyncError(null);
    setSyncInfo("Conectando conta e sincronizando...");

    try {
      const { data, error } = await supabase.functions.invoke("ml-oauth-token", {
        body: {
          code,
          redirect_uri: redirectUri,
          code_verifier: sessionStorage.getItem("ml_pkce_verifier") || undefined
        }
      });

      if (error) throw new Error(error.message);
      const token = String(data?.access_token || "").trim();
      if (!token) throw new Error("Edge Function nao retornou access_token.");

      const { error: saveError } = await supabase.from("app_settings").upsert({
        id: tokenSettingId(userId),
        config_data: { access_token: token }
      });

      if (saveError) throw new Error(saveError.message);

      setAccessToken(token);
      sessionStorage.removeItem("ml_pkce_verifier");
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, cleanUrl);
      setOauthCode(null);

      const { fromDate, toDate } = getRangeByPeriod(rangeDays);
      const { data: syncDataResponse, error: syncErrorResponse } = await supabase.functions.invoke(
        "ml-sync",
        {
          body: {
            access_token: token,
            from_date: fromDate,
            to_date: toDate
          }
        }
      );

      if (syncErrorResponse) throw new Error(syncErrorResponse.message);
      const syncPayload = (syncDataResponse || {}) as SyncResponse;
      if (!syncPayload?.seller) throw new Error("Resposta invalida da funcao ml-sync.");

      setSeller(syncPayload.seller);
      setOrders(syncPayload.orders || []);
      setLastSyncAt(new Date().toISOString());
      setSyncInfo("Conta conectada e sincronizada com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao concluir conexao automatica.";
      const hint =
        message.includes("Failed to send a request to the Edge Function") ||
        message.includes("FunctionsFetchError")
          ? " Verifique se as funcoes `ml-oauth-token` e `ml-sync` foram deployadas no Supabase e se os secrets ML_CLIENT_ID/ML_CLIENT_SECRET estao definidos."
          : "";
      setSyncError(`Nao foi possivel concluir conexao automatica. Detalhe: ${message}.${hint}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page ml-page ml-v2">
      <div className="ml-v2-hero">
        <div>
          <p className="eyebrow">Mercado Livre</p>
          <h2>Painel de Vendas</h2>
          <p className="page-text">Layout profissional com indicadores principais para usuarios comuns.</p>
          <div className="ml-v2-periods">
            {PERIODS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`ml-pill ${rangeDays === p.days ? "active" : ""}`}
                onClick={() => {
                  setRangeDays(p.days);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-hero-actions">
          <button className="primary-btn" onClick={startOAuth} type="button" disabled={loading}>
            {loading ? "Conectando..." : "Conectar conta Mercado Livre"}
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

      <div className="ml-summary-head">
        <div>
          <p className="ml-summary-label">💰 Faturamento</p>
          <strong>{fmtMoney(dashboard.stats.grossRevenue)}</strong>
        </div>
        <div>
          <p className="ml-summary-label">📈 Lucro estimado</p>
          <strong className={dashboard.stats.profitEstimated >= 0 ? "kpi-up" : "kpi-warn"}>
            {fmtMoney(dashboard.stats.profitEstimated)}
          </strong>
        </div>
        <div>
          <p className="ml-summary-label">🏪 Conta</p>
          <strong>{seller?.nickname || "Nao conectada"}</strong>
          <span className="ml-summary-sub">
            {lastSyncAt ? `Atualizado ${fmtDate(lastSyncAt)}` : "Sem sincronizacao"}
          </span>
        </div>
      </div>

      <div className="kpi-grid kpi-grid-4 ml-kpi-grid">
        <article className="kpi-card elevated">
          <p>🛒 Vendas</p>
          <strong>{dashboard.stats.ordersCount}</strong>
          <span>{dashboard.stats.unitsCount} unidades</span>
        </article>
        <article className="kpi-card elevated">
          <p>🎫 Ticket medio</p>
          <strong>{fmtMoney(dashboard.stats.avgTicket)}</strong>
        </article>
        <article className="kpi-card elevated">
          <p>💹 Lucro medio</p>
          <strong>{fmtMoney(dashboard.stats.avgProfit)}</strong>
        </article>
        <article className="kpi-card elevated">
          <p>❌ Canceladas</p>
          <strong>{dashboard.stats.cancelledCount}</strong>
          <span>{fmtMoney(dashboard.stats.cancelledAmount)}</span>
        </article>
        <article className="kpi-card elevated">
          <p>🧾 Tarifas</p>
          <strong>{fmtMoney(dashboard.stats.feesEstimated)}</strong>
          <span>Estimado</span>
        </article>
        <article className="kpi-card elevated">
          <p>🏛️ Impostos</p>
          <strong>{fmtMoney(dashboard.stats.taxesEstimated)}</strong>
          <span>Estimado</span>
        </article>
        <article className="kpi-card elevated">
          <p>🚚 Frete</p>
          <strong>{fmtMoney(dashboard.stats.shippingEstimated)}</strong>
          <span>Estimado</span>
        </article>
        <article className="kpi-card elevated">
          <p>💵 Receita paga</p>
          <strong>{fmtMoney(dashboard.stats.paidRevenue)}</strong>
        </article>
      </div>

      <div className="ml-ads-strip">
        <div>
          <p>Investimento em Ads</p>
          <strong>{fmtMoney(0)}</strong>
        </div>
        <div>
          <p>Receita</p>
          <strong>{fmtMoney(dashboard.stats.grossRevenue)}</strong>
        </div>
        <div>
          <p>ROAS</p>
          <strong>N/D</strong>
        </div>
        <div>
          <p>ACOS</p>
          <strong>N/D</strong>
        </div>
        <div>
          <p>TACOS</p>
          <strong>N/D</strong>
        </div>
      </div>

      <div className="ops-grid ml-ops-grid">
        <article className="ops-card">
          <h3>Top produtos por faturamento</h3>
          {dashboard.topProducts.length === 0 ? (
            <p className="page-text">Sincronize para visualizar produtos mais vendidos.</p>
          ) : (
            <div className="ml-top-list">
              {dashboard.topProducts.map((item) => (
                <div key={item.title} className="ml-top-item ml-top-item-v2">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.units} un. • {fmtMoney(item.amount)}</p>
                  </div>
                  <div className="ml-share">
                    <span>{item.share.toFixed(1)}%</span>
                    <i style={{ width: `${Math.min(100, Math.max(8, item.share))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="ops-card">
          <h3>Conta conectada</h3>
          {seller ? (
            <ul className="task-list">
              <li>Seller ID: {seller.id}</li>
              <li>Nickname: {seller.nickname || "-"}</li>
              <li>Nome: {[seller.first_name, seller.last_name].filter(Boolean).join(" ") || "-"}</li>
              <li>Receita paga: {fmtMoney(dashboard.stats.paidRevenue)}</li>
            </ul>
          ) : (
            <p className="page-text">Nenhuma conta sincronizada ainda.</p>
          )}
          <div className="actions-row">
            <button className="ghost-btn" onClick={disconnect} type="button">
              Desconectar conta atual
            </button>
          </div>
        </article>
      </div>

      <div className="ml-orders-table-wrap">
        <div className="ml-orders-head">
          <h3>Pedidos recentes</h3>
          <span>{linesWithCost.length} registros</span>
        </div>
        <div className="table-wrap">
          <table className="table clean">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Pedido</th>
                <th>Titulo</th>
                <th>SKU</th>
                <th>Data</th>
                <th>Qtde</th>
                <th>Valor</th>
                <th>Tarifa</th>
                <th>Custo Produto</th>
                <th>Lucro</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {linesWithCost.length === 0 ? (
                <tr>
                  <td colSpan={11}>Sem pedidos no periodo selecionado.</td>
                </tr>
              ) : (
                linesWithCost.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.thumb ? (
                        <img className="ml-thumb" src={row.thumb} alt={row.title} />
                      ) : (
                        <span className="ml-thumb-fallback">📦</span>
                      )}
                    </td>
                    <td>#{row.id}</td>
                    <td className="ml-col-title">{row.title}</td>
                    <td>{row.sku}</td>
                    <td>{row.date}</td>
                    <td>{row.qty}</td>
                    <td>{fmtMoney(row.amount)}</td>
                    <td>{fmtMoney(row.fee)}</td>
                    <td>
                      <div className="ml-cost-cell">
                        <strong>{fmtMoney(row.totalCost)}</strong>
                        <select
                          className="ml-cost-select"
                          value={row.linkedProductId}
                          onChange={(e) => void saveCostLink(row, e.target.value)}
                          disabled={savingLinkKey === `${row.id}-${row.sku}-${row.title}`}
                        >
                          <option value="">Anexar produto...</option>
                          {savedProducts.map((p) => (
                            <option key={String(p.id)} value={String(p.id)}>
                              {(p.product_name || "Sem nome")} - {fmtMoney(Number(p.base_cost) || 0)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className={row.netProfit >= 0 ? "profit-up" : "profit-down"}>{fmtMoney(row.netProfit)}</td>
                    <td>{row.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {oauthCode && (
        <div className="soft-panel">
          <p>Codigo OAuth detectado</p>
          <ul>
            <li>Conexao automatica em andamento.</li>
            <li>Nenhuma acao manual necessaria.</li>
          </ul>
        </div>
      )}

      {syncError && <p className="error-text">{syncError}</p>}
      {syncInfo && <p className="page-text">{syncInfo}</p>}

      {!hasOAuthConfig && (
        <p className="info">OAuth nao configurado. Adicione `VITE_ML_CLIENT_ID` no arquivo `.env`.</p>
      )}
    </section>
  );
}

