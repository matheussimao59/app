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
  pack_id?: number | string;
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
  netRevenue: number;
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
  packId: number;
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

type AlertItem = {
  level: "high" | "medium" | "low";
  title: string;
  detail: string;
  action?: {
    label: string;
    filter: OrderQuickFilter;
  };
};

type OrderQuickFilter = "all" | "without_cost" | "high_fee" | "negative_profit";

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

const DEFAULT_CUSTOMIZATION_TEMPLATE =
  "Ola! Obrigado pela compra. Para iniciar a personalizacao, envie: nome/texto, tema/cores e detalhes do pedido.";

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

function fmtPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2).replace(".", ",")}%`;
}

function friendlySyncError(message?: string | null) {
  const raw = String(message || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();

  if (lower.includes("mensagem de personalizacao")) {
    return raw;
  }

  if (lower.includes("timeout_sync")) {
    return "Sincronizacao demorou mais do que o esperado. Tente novamente em alguns segundos.";
  }
  if (lower.includes("functionsfetcherror") || lower.includes("failed to send a request to the edge function")) {
    return "Nao foi possivel comunicar com o servidor de sincronizacao. Verifique se a internet esta estavel e tente novamente.";
  }
  if (lower.includes("oauth") || lower.includes("token")) {
    return "Falha na conexao com a conta Mercado Livre. Clique em Conectar conta e autorize novamente.";
  }
  if (lower.includes("nao autenticado") || lower.includes("usuario")) {
    return "Sua sessao expirou. Entre novamente para continuar.";
  }
  if (lower.includes("supabase")) {
    return "Configuracao do sistema incompleta para sincronizacao.";
  }
  if (lower.includes("permissoes")) {
    return "Permissao insuficiente para sincronizar dados da conta.";
  }

  return "Nao foi possivel sincronizar agora. Tente novamente em instantes.";
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

function customizationSentSettingId(userId: string) {
  return `ml_customization_sent_${userId}`;
}

function customizationTemplateSettingId(userId: string) {
  return `ml_customization_template_${userId}`;
}

function normalizeKey(text?: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sellerCacheKey(userId: string) {
  return `ml_seller_cache_${userId}`;
}

function tokenCacheKey(userId: string) {
  return `ml_token_cache_${userId}`;
}

function ordersCacheKey(userId: string) {
  return `ml_orders_cache_${userId}`;
}

function lastSyncCacheKey(userId: string) {
  return `ml_last_sync_cache_${userId}`;
}

function customizationSentCacheKey(userId: string) {
  return `ml_customization_sent_${userId}`;
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
      packId: Number(order.pack_id) || 0,
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
  const netRevenue = grossRevenue - feesEstimated;
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
      netRevenue,
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
    lines: lines.sort((a, b) => (a.id < b.id ? 1 : -1))
  };
}

export function MercadoLivrePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loading, setLoading] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [oauthCode, setOauthCode] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState(1);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([]);
  const [costLinks, setCostLinks] = useState<CostLinks>({});
  const [savingLinkKey, setSavingLinkKey] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [orderQuickFilter, setOrderQuickFilter] = useState<OrderQuickFilter>("all");
  const [customizationSent, setCustomizationSent] = useState<Record<number, true>>({});
  const [sendingCustomizationKey, setSendingCustomizationKey] = useState<string | null>(null);
  const [customizationTemplate, setCustomizationTemplate] = useState(DEFAULT_CUSTOMIZATION_TEMPLATE);
  const handledOauthCodeRef = useRef<string | null>(null);
  const syncRunningRef = useRef(false);
  const ordersTableRef = useRef<HTMLDivElement | null>(null);

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
      const cachedToken = localStorage.getItem(tokenCacheKey(uid)) || "";
      if (cachedToken) {
        setAccessToken(cachedToken);
      }
      try {
        const cachedSeller = localStorage.getItem(sellerCacheKey(uid));
        if (cachedSeller) {
          const parsed = JSON.parse(cachedSeller) as SellerProfile;
          if (parsed?.id) setSeller(parsed);
        }
      } catch {
        // ignore
      }
      try {
        const cachedOrders = localStorage.getItem(ordersCacheKey(uid));
        if (cachedOrders) {
          const parsedOrders = JSON.parse(cachedOrders) as Order[];
          if (Array.isArray(parsedOrders) && parsedOrders.length > 0) {
            setOrders(parsedOrders);
          }
        }
      } catch {
        // ignore
      }
      const cachedLastSync = localStorage.getItem(lastSyncCacheKey(uid));
      if (cachedLastSync) {
        setLastSyncAt(cachedLastSync);
      }
      try {
        const cachedCustomization = localStorage.getItem(customizationSentCacheKey(uid));
        if (cachedCustomization) {
          const parsed = JSON.parse(cachedCustomization) as Array<number | string>;
          if (Array.isArray(parsed)) {
            const mapped: Record<number, true> = {};
            for (const orderId of parsed) {
              const n = Number(orderId) || 0;
              if (n > 0) mapped[n] = true;
            }
            setCustomizationSent(mapped);
          }
        }
      } catch {
        // ignore
      }

      const { data: tokenRow } = await supabase
        .from("app_settings")
        .select("config_data")
        .eq("id", tokenSettingId(uid))
        .maybeSingle();

      const token = String(tokenRow?.config_data?.access_token || "").trim();
      if (token) {
        setAccessToken(token);
        localStorage.setItem(tokenCacheKey(uid), token);
        try {
          const cached = localStorage.getItem(sellerCacheKey(uid));
          if (cached) {
            const parsed = JSON.parse(cached) as SellerProfile;
            if (parsed?.id) setSeller(parsed);
          }
        } catch {
          // ignore
        }
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

      const { data: customizationRow } = await supabase
        .from("app_settings")
        .select("config_data")
        .eq("id", customizationSentSettingId(uid))
        .maybeSingle();
      const sentOrderIds =
        ((customizationRow?.config_data as { sent_order_ids?: Array<number | string> } | null)
          ?.sent_order_ids || []) as Array<number | string>;
      if (Array.isArray(sentOrderIds) && sentOrderIds.length > 0) {
        const mapped: Record<number, true> = {};
        for (const orderId of sentOrderIds) {
          const n = Number(orderId) || 0;
          if (n > 0) mapped[n] = true;
        }
        setCustomizationSent(mapped);
        localStorage.setItem(
          customizationSentCacheKey(uid),
          JSON.stringify(Object.keys(mapped).map((id) => Number(id)))
        );
      }

      const { data: templateRow } = await supabase
        .from("app_settings")
        .select("config_data")
        .eq("id", customizationTemplateSettingId(uid))
        .maybeSingle();
      const savedTemplate = String(
        (templateRow?.config_data as { template?: string } | null)?.template || ""
      ).trim();
      if (savedTemplate) {
        setCustomizationTemplate(savedTemplate);
      }
      setBootstrapping(false);
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

    loadUserAndToken().finally(() => setBootstrapping(false));
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
  const isConnected = Boolean(accessToken);
  const isConnectingState = bootstrapping || (isConnected && !seller);
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
      // Lucro real por venda: valor - tarifa ML - custo do produto
      const netProfit = line.amount - line.fee - totalCost;
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

  const filteredLines = useMemo(() => {
    if (orderQuickFilter === "without_cost") {
      return linesWithCost.filter((row) => !row.linkedProductId);
    }
    if (orderQuickFilter === "high_fee") {
      return linesWithCost.filter((row) => row.amount > 0 && row.fee / row.amount >= 0.28);
    }
    if (orderQuickFilter === "negative_profit") {
      return linesWithCost.filter((row) => row.netProfit < 0);
    }
    return linesWithCost;
  }, [linesWithCost, orderQuickFilter]);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filteredLines.length / pageSize));
  const pagedLines = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLines.slice(start, start + pageSize);
  }, [filteredLines, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [rangeDays, orders.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [orderQuickFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const realProfitTotal = useMemo(() => {
    return linesWithCost.reduce((acc, row) => {
      const cancelled = String(row.status || "").toLowerCase().includes("cancel");
      return cancelled ? acc : acc + row.netProfit;
    }, 0);
  }, [linesWithCost]);

  const realAvgProfit = useMemo(() => {
    return dashboard.stats.ordersCount > 0 ? realProfitTotal / dashboard.stats.ordersCount : 0;
  }, [dashboard.stats.ordersCount, realProfitTotal]);

  const profitMarginPct = useMemo(() => {
    if (dashboard.stats.grossRevenue <= 0) return 0;
    return (realProfitTotal / dashboard.stats.grossRevenue) * 100;
  }, [dashboard.stats.grossRevenue, realProfitTotal]);

  const profitAnalysis = useMemo(() => {
    if (dashboard.stats.grossRevenue <= 0) {
      return "Sem vendas no periodo para analisar margem.";
    }
    if (profitMarginPct < 0) {
      return "Margem negativa: operacao no prejuizo.";
    }
    if (profitMarginPct < 8) {
      return "Margem baixa: revisar custo e precificacao.";
    }
    if (profitMarginPct < 18) {
      return "Margem positiva, mas com ponto de atencao.";
    }
    return "Margem saudavel no periodo.";
  }, [dashboard.stats.grossRevenue, profitMarginPct]);

  const profitTone = useMemo(() => {
    if (dashboard.stats.grossRevenue <= 0) return "neutral";
    if (profitMarginPct < 0) return "negative";
    if (profitMarginPct < 8) return "warning";
    return "positive";
  }, [dashboard.stats.grossRevenue, profitMarginPct]);

  const alerts = useMemo(() => {
    const list: AlertItem[] = [];
    const validSales = linesWithCost.filter((row) => !String(row.status || "").toLowerCase().includes("cancel"));
    const salesCount = validSales.length;
    const withoutCost = validSales.filter((row) => !row.linkedProductId).length;
    const highFeeOrders = validSales.filter((row) => row.amount > 0 && row.fee / row.amount >= 0.28).length;
    const feeRatio = dashboard.stats.grossRevenue > 0 ? (dashboard.stats.feesEstimated / dashboard.stats.grossRevenue) * 100 : 0;

    if (dashboard.stats.grossRevenue <= 0) {
      list.push({
        level: "low",
        title: "Sem vendas no periodo",
        detail: "Nao ha pedidos pagos no intervalo selecionado."
      });
    }

    if (profitMarginPct < 0) {
      list.push({
        level: "high",
        title: "Margem negativa",
        detail: `Lucro em prejuizo (${fmtPercent(profitMarginPct)}). Revise custos e tarifa aplicada.`,
        action: {
          label: "Ver pedidos com prejuizo",
          filter: "negative_profit"
        }
      });
    } else if (profitMarginPct < 8 && dashboard.stats.grossRevenue > 0) {
      list.push({
        level: "medium",
        title: "Margem baixa",
        detail: `Margem atual ${fmtPercent(profitMarginPct)}. Ganho apertado por venda.`,
        action: {
          label: "Ver menor margem",
          filter: "negative_profit"
        }
      });
    }

    if (withoutCost > 0 && salesCount > 0) {
      const percent = (withoutCost / salesCount) * 100;
      list.push({
        level: percent >= 35 ? "high" : "medium",
        title: "Pedidos sem custo vinculado",
        detail: `${withoutCost} pedido(s) sem produto/custo anexado (${fmtPercent(percent)}).`,
        action: {
          label: "Anexar custos agora",
          filter: "without_cost"
        }
      });
    }

    if (feeRatio >= 22 && dashboard.stats.grossRevenue > 0) {
      const healthyMargin = profitMarginPct >= 20;
      list.push({
        level: healthyMargin ? "low" : feeRatio >= 28 ? "high" : "medium",
        title: healthyMargin ? "Tarifa alta com margem saudavel" : "Tarifa media elevada",
        detail: healthyMargin
          ? `Tarifas em ${fmtPercent(feeRatio)}, porem a margem atual (${fmtPercent(profitMarginPct)}) segue saudavel.`
          : `Tarifas em ${fmtPercent(feeRatio)} da receita bruta no periodo, com impacto direto na margem.`,
        action: {
          label: "Ver pedidos com tarifa alta",
          filter: "high_fee"
        }
      });
    }

    if (highFeeOrders > 0) {
      list.push({
        level: "low",
        title: "Pedidos com tarifa alta",
        detail: `${highFeeOrders} pedido(s) com tarifa acima de 28% do valor de venda.`,
        action: {
          label: "Filtrar tarifas altas",
          filter: "high_fee"
        }
      });
    }

    return list.slice(0, 4);
  }, [linesWithCost, dashboard.stats.grossRevenue, dashboard.stats.feesEstimated, profitMarginPct]);

  const connectionStatus = useMemo(() => {
    if (loading || backgroundSyncing) {
      return { tone: "sync", label: "Sincronizando dados" };
    }
    if (syncError) {
      return { tone: "error", label: "Falha na sincronizacao" };
    }
    if (accessToken && seller) {
      return { tone: "ok", label: "Conta conectada" };
    }
    if (accessToken && !seller) {
      return { tone: "sync", label: "Conectando conta" };
    }
    return { tone: "idle", label: "Conta desconectada" };
  }, [loading, backgroundSyncing, syncError, accessToken, seller]);

  const syncErrorFriendly = useMemo(() => friendlySyncError(syncError), [syncError]);

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

  async function sendCustomizationRequest(row: (typeof linesWithCost)[number]) {
    if (!supabase || !userId) return;
    if (!accessToken || !seller?.id) {
      setSyncError("Conecte a conta Mercado Livre para enviar mensagem de personalizacao.");
      return;
    }
    if (customizationSent[row.id]) {
      setSyncInfo(`Mensagem de personalizacao ja enviada para o pedido #${row.id}.`);
      return;
    }

    const buttonKey = `${row.id}-${row.packId}`;
    setSendingCustomizationKey(buttonKey);
    setSyncError(null);

    try {
      const { data, error } = await supabase.functions.invoke("ml-send-customization", {
        body: {
          access_token: accessToken,
          seller_id: seller.id,
          order_id: row.id,
          pack_id: row.packId || null,
          message:
            customizationTemplate
        }
      });
      if (error) throw new Error(error.message);
      const ok = Boolean((data as { ok?: boolean } | null)?.ok);
      if (!ok) throw new Error("Resposta invalida no envio da mensagem.");

      const next: Record<number, true> = { ...customizationSent, [row.id]: true as const };
      setCustomizationSent(next);
      const sentOrderIds = Object.keys(next).map((id) => Number(id)).filter((id) => id > 0);
      localStorage.setItem(customizationSentCacheKey(userId), JSON.stringify(sentOrderIds));
      await supabase.from("app_settings").upsert({
        id: customizationSentSettingId(userId),
        config_data: {
          sent_order_ids: sentOrderIds,
          updated_at: new Date().toISOString()
        }
      });
      setSyncInfo(`Mensagem de personalizacao enviada para o pedido #${row.id}.`);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "erro_desconhecido";
      setSyncError(`Nao foi possivel enviar mensagem de personalizacao. Detalhe tecnico: ${message}`);
    } finally {
      setSendingCustomizationKey(null);
    }
  }

  function runAlertAction(filter: OrderQuickFilter) {
    setOrderQuickFilter(filter);
    setCurrentPage(1);
    const message =
      filter === "without_cost"
        ? "Filtro aplicado: pedidos sem custo vinculado."
        : filter === "high_fee"
          ? "Filtro aplicado: pedidos com tarifa alta."
          : filter === "negative_profit"
            ? "Filtro aplicado: pedidos com lucro negativo."
            : "Filtro removido.";
    setSyncInfo(message);
    ordersTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function syncData(token: string, days = rangeDays, silent = false) {
    if (syncRunningRef.current) return;
    syncRunningRef.current = true;
    if (silent) {
      setBackgroundSyncing(true);
    } else {
      setLoading(true);
    }
    if (!silent) {
      setSyncError(null);
      setSyncInfo(null);
    }

    try {
      const { fromDate, toDate } = getRangeByPeriod(days);
      if (!supabase) {
        throw new Error("Supabase nao configurado para sincronizar.");
      }

      const invokePromise = supabase.functions.invoke("ml-sync", {
        body: {
          access_token: token,
          from_date: fromDate,
          to_date: toDate,
          include_payments_details: !silent
        }
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout_sync")), 15000)
      );
      const { data, error } = (await Promise.race([invokePromise, timeoutPromise])) as {
        data: unknown;
        error: { message?: string } | null;
      };

      if (error) throw new Error(error.message);
      const payload = (data || {}) as SyncResponse;
      if (!payload?.seller) throw new Error("Resposta invalida da funcao ml-sync.");

      setSeller(payload.seller);
      setOrders(payload.orders || []);
      const syncedAt = new Date().toISOString();
      setLastSyncAt(syncedAt);
      if (userId && payload.seller) {
        localStorage.setItem(sellerCacheKey(userId), JSON.stringify(payload.seller));
        localStorage.setItem(ordersCacheKey(userId), JSON.stringify(payload.orders || []));
        localStorage.setItem(lastSyncCacheKey(userId), syncedAt);
      }
      const label = PERIODS.find((p) => p.days === days)?.label || `${days} dias`;
      setSyncInfo(silent ? `Atualizado automaticamente (${label}).` : `Dados sincronizados com sucesso (${label}).`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao sincronizar dados do Mercado Livre.";
      const normalizedMessage =
        message === "timeout_sync"
          ? "A sincronizacao demorou mais que o esperado. Tente novamente em alguns segundos."
          : message;
      const hint =
        normalizedMessage.includes("Failed to send a request to the Edge Function") ||
        normalizedMessage.includes("FunctionsFetchError")
          ? " Verifique se a funcao `ml-sync` foi deployada no Supabase."
          : "";
      if (!silent) {
        setSyncError(`Nao foi possivel sincronizar. Verifique token/permissoes. Detalhe: ${normalizedMessage}.${hint}`);
      }
    } finally {
      setLoading(false);
      setBackgroundSyncing(false);
      syncRunningRef.current = false;
    }
  }

  async function disconnect() {
    if (supabase && userId) {
      await supabase.from("app_settings").delete().eq("id", tokenSettingId(userId));
    }
    if (userId) {
      localStorage.removeItem(sellerCacheKey(userId));
      localStorage.removeItem(tokenCacheKey(userId));
      localStorage.removeItem(ordersCacheKey(userId));
      localStorage.removeItem(lastSyncCacheKey(userId));
      localStorage.removeItem(customizationSentCacheKey(userId));
    }
    setAccessToken("");
    setSeller(null);
    setOrders([]);
    setCustomizationSent({});
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
      localStorage.setItem(tokenCacheKey(userId), token);
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
            to_date: toDate,
            include_payments_details: false
          }
        }
      );

      if (syncErrorResponse) throw new Error(syncErrorResponse.message);
      const syncPayload = (syncDataResponse || {}) as SyncResponse;
      if (!syncPayload?.seller) throw new Error("Resposta invalida da funcao ml-sync.");

      setSeller(syncPayload.seller);
      setOrders(syncPayload.orders || []);
      const syncedAt = new Date().toISOString();
      setLastSyncAt(syncedAt);
      localStorage.setItem(sellerCacheKey(userId), JSON.stringify(syncPayload.seller));
      localStorage.setItem(ordersCacheKey(userId), JSON.stringify(syncPayload.orders || []));
      localStorage.setItem(lastSyncCacheKey(userId), syncedAt);
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
          <div className={`ml-connection-pill ${connectionStatus.tone}`}>
            <span>{connectionStatus.label}</span>
            {lastSyncAt && <small>Ultima atualizacao: {fmtDate(lastSyncAt)}</small>}
          </div>
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
            disabled={!accessToken || loading || backgroundSyncing}
          >
            {loading || backgroundSyncing ? "Sincronizando..." : "Sincronizar agora"}
          </button>
        </div>
      </div>

      <div className="ml-summary-head">
        <div>
          <p className="ml-summary-label">
            💰 Receita liquida
            <span className="ml-help" title="Valor de venda menos tarifas do Mercado Livre.">?</span>
          </p>
          <strong>{fmtMoney(dashboard.stats.netRevenue)}</strong>
          <span className="ml-summary-sub">Venda menos tarifas ML</span>
        </div>
        <div>
          <p className="ml-summary-label">
            📈 Lucro estimado
            <span className="ml-help" title="Lucro estimado = venda - tarifa ML - custo do produto vinculado.">?</span>
          </p>
          <strong className={realProfitTotal >= 0 ? "kpi-up" : "kpi-warn"}>
            {fmtMoney(realProfitTotal)}
          </strong>
          <div className={`ml-profit-insight ${profitTone}`}>
            <span className="ml-profit-badge">Margem {fmtPercent(profitMarginPct)}</span>
            <span className="ml-profit-text">{profitAnalysis}</span>
          </div>
        </div>
        <div>
          <p className="ml-summary-label">🏪 Conta</p>
          <strong>{seller?.nickname || (isConnectingState ? "Conectando..." : "Nao conectada")}</strong>
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
          <strong>{fmtMoney(realAvgProfit)}</strong>
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
          <p>
            💵 Receita bruta
            <span className="ml-help" title="Soma total das vendas antes de descontar tarifas, impostos e frete.">?</span>
          </p>
          <strong>{fmtMoney(dashboard.stats.grossRevenue)}</strong>
          <span>Antes dos descontos</span>
        </article>
      </div>

      <div className="ml-alerts-board">
        <div className="ml-alerts-head">
          <h3>Alertas automaticos</h3>
          <span>{alerts.length} alerta(s)</span>
        </div>
        {alerts.length === 0 ? (
          <p className="page-text">Sem alertas criticos no periodo atual.</p>
        ) : (
          <div className="ml-alerts-grid">
            {alerts.map((alert, idx) => (
              <article key={`${alert.title}-${idx}`} className={`ml-alert-item ${alert.level}`}>
                <strong>{alert.title}</strong>
                <p>{alert.detail}</p>
                {alert.action && (
                  <button
                    type="button"
                    className="ml-alert-action-btn"
                    onClick={() => runAlertAction(alert.action!.filter)}
                  >
                    {alert.action.label}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="ml-ads-strip">
        <div>
          <p>Investimento em Ads</p>
          <strong>{fmtMoney(0)}</strong>
        </div>
        <div>
          <p>Receita bruta</p>
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
              <li>Receita paga: {fmtMoney(dashboard.stats.grossRevenue)}</li>
            </ul>
          ) : isConnectingState ? (
            <p className="page-text">Conta conectada. Sincronizando dados...</p>
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

      <div className="ml-orders-table-wrap" ref={ordersTableRef}>
        <div className="ml-orders-head">
          <h3>Pedidos recentes</h3>
          <span>
            {filteredLines.length} de {linesWithCost.length} registros
          </span>
        </div>
        <div className="ml-order-filters">
          <button
            type="button"
            className={`ml-order-filter-chip ${orderQuickFilter === "all" ? "active" : ""}`}
            onClick={() => setOrderQuickFilter("all")}
          >
            Todos
          </button>
          <button
            type="button"
            className={`ml-order-filter-chip ${orderQuickFilter === "without_cost" ? "active" : ""}`}
            onClick={() => setOrderQuickFilter("without_cost")}
          >
            Sem custo
          </button>
          <button
            type="button"
            className={`ml-order-filter-chip ${orderQuickFilter === "high_fee" ? "active" : ""}`}
            onClick={() => setOrderQuickFilter("high_fee")}
          >
            Tarifa alta
          </button>
          <button
            type="button"
            className={`ml-order-filter-chip ${orderQuickFilter === "negative_profit" ? "active" : ""}`}
            onClick={() => setOrderQuickFilter("negative_profit")}
          >
            Lucro negativo
          </button>
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
                <th>Acoes</th>
                <th>Custo Produto</th>
                <th>Lucro</th>
              </tr>
            </thead>
            <tbody>
              {pagedLines.length === 0 ? (
                <tr>
                  <td colSpan={11}>Sem pedidos no periodo selecionado.</td>
                </tr>
              ) : (
                pagedLines.map((row) => (
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
                      <button
                        type="button"
                        className="ml-alert-action-btn"
                        onClick={() => void sendCustomizationRequest(row)}
                        disabled={
                          !accessToken ||
                          Boolean(customizationSent[row.id]) ||
                          sendingCustomizationKey === `${row.id}-${row.packId}`
                        }
                        title={!row.packId ? "Sem pack_id: sera tentado fallback por order_id." : ""}
                      >
                        {customizationSent[row.id]
                          ? "Mensagem enviada"
                          : sendingCustomizationKey === `${row.id}-${row.packId}`
                              ? "Enviando..."
                              : "Solicitar dados"}
                      </button>
                    </td>
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
                              {`${(p.product_name || "Sem nome").slice(0, 15)}${(p.product_name || "").length > 15 ? "..." : ""}`} - {fmtMoney(Number(p.base_cost) || 0)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className={row.netProfit >= 0 ? "profit-up" : "profit-down"}>{fmtMoney(row.netProfit)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredLines.length > pageSize && (
          <div className="ml-pagination">
            <button
              type="button"
              className="ghost-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <span>
              Pagina {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              className="ghost-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Proxima
            </button>
          </div>
        )}
      </div>

      {oauthCode && (
        <div className="soft-panel">
          <p>Conexao em andamento</p>
          <ul>
            <li>Estamos finalizando a autorizacao da sua conta.</li>
            <li>Nenhuma acao manual e necessaria agora.</li>
          </ul>
        </div>
      )}

      {!accessToken && !loading && (
        <div className="soft-panel">
          <p>Primeiro acesso ao Mercado Livre</p>
          <ul>
            <li>Clique em Conectar conta Mercado Livre.</li>
            <li>Autorize o acesso na pagina do Mercado Livre.</li>
            <li>A sincronizacao sera iniciada automaticamente.</li>
          </ul>
        </div>
      )}

      {syncError && <p className="error-text">{syncErrorFriendly}</p>}
      {syncInfo && <p className="page-text">{syncInfo}</p>}

      {!hasOAuthConfig && (
        <p className="info">OAuth nao configurado. Adicione `VITE_ML_CLIENT_ID` no arquivo `.env`.</p>
      )}
    </section>
  );
}
