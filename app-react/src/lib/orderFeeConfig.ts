import { supabase } from "./supabase";

export type FeeOverride = {
  id: string;
  name: string;
  percent: number;
  fixed: number;
};

export type OrderFeeConfig = {
  default: {
    percent: number;
    fixed: number;
  };
  overrides: FeeOverride[];
};

export const ORDER_FEE_SETTINGS_ID = "global_order_fee_config";

export const DEFAULT_ORDER_FEE_CONFIG: OrderFeeConfig = {
  default: {
    percent: 16,
    fixed: 6.5
  },
  overrides: [
    { id: "mercado_livre", name: "Mercado Livre", percent: 16, fixed: 6.5 },
    { id: "shopee", name: "Shopee", percent: 20, fixed: 4 },
    { id: "amazon", name: "Amazon", percent: 17, fixed: 6 }
  ]
};

function normalize(input: unknown): OrderFeeConfig {
  if (!input || typeof input !== "object") return DEFAULT_ORDER_FEE_CONFIG;

  const raw = input as Partial<OrderFeeConfig>;
  const basePercent = Number(raw.default?.percent);
  const baseFixed = Number(raw.default?.fixed);

  const overrides = Array.isArray(raw.overrides)
    ? raw.overrides
        .map((item) => ({
          id: String(item.id || item.name || crypto.randomUUID()).toLowerCase().replace(/\s+/g, "_"),
          name: String(item.name || "").trim(),
          percent: Number(item.percent) || 0,
          fixed: Number(item.fixed) || 0
        }))
        .filter((item) => item.name)
    : DEFAULT_ORDER_FEE_CONFIG.overrides;

  return {
    default: {
      percent: Number.isFinite(basePercent) ? basePercent : DEFAULT_ORDER_FEE_CONFIG.default.percent,
      fixed: Number.isFinite(baseFixed) ? baseFixed : DEFAULT_ORDER_FEE_CONFIG.default.fixed
    },
    overrides: overrides.length ? overrides : DEFAULT_ORDER_FEE_CONFIG.overrides
  };
}

export async function loadOrderFeeConfig(): Promise<OrderFeeConfig> {
  if (!supabase) return DEFAULT_ORDER_FEE_CONFIG;

  const { data, error } = await supabase
    .from("app_settings")
    .select("config_data")
    .eq("id", ORDER_FEE_SETTINGS_ID)
    .maybeSingle();

  if (error) return DEFAULT_ORDER_FEE_CONFIG;
  return normalize(data?.config_data);
}

export async function saveOrderFeeConfig(config: OrderFeeConfig): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: "Supabase nao configurado." };

  const normalized = normalize(config);
  const { error } = await supabase.from("app_settings").upsert({
    id: ORDER_FEE_SETTINGS_ID,
    config_data: normalized
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: "Configuracoes salvas com sucesso." };
}
