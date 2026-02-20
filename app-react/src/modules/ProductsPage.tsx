import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  DEFAULT_ORDER_FEE_CONFIG,
  type OrderFeeConfig,
  loadOrderFeeConfig
} from "../lib/orderFeeConfig";

type ProductRow = {
  id: string | number;
  product_name: string | null;
  product_image_data: string | null;
  selling_price: number | null;
  base_cost: number | null;
  final_margin: number | null;
  materials_json: unknown;
};

type ProductJson = {
  kit_qty?: number;
  materials?: Array<{ name?: string; qty?: number; unit_cost?: number; cost?: number }>;
  strategies?: Array<{ name?: string; price?: number; pct?: number; fix?: number }>;
  history?: Array<{ date?: string; msg?: string; type?: string; old?: number; new?: number }>;
  salary_target?: number;
  hours_per_month?: number;
  minutes_per_unit?: number;
  fixed_pct?: number;
};

type EditMaterial = {
  id: string;
  name: string;
  qty: number;
  unit_cost: number;
};

type EditStrategy = {
  id: string;
  name: string;
  pct: number;
  fix: number;
};

type MaterialLibraryRow = {
  id: string;
  name: string;
  unit_cost?: number | null;
  cost_per_unit?: number | null;
};

type FeePreview = {
  label: string;
  percent: number;
  fixed: number;
  fee: number;
};

function fmt(value: number) {
  return (Number(value) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function parseJson(raw: unknown): ProductJson {
  if (!raw) return {};
  try {
    if (typeof raw === "string") return JSON.parse(raw) as ProductJson;
    if (typeof raw === "object") return raw as ProductJson;
    return {};
  } catch {
    return {};
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function makeEditMaterial(): EditMaterial {
  return { id: crypto.randomUUID(), name: "", qty: 1, unit_cost: 0 };
}

function makeEditStrategy(): EditStrategy {
  return { id: crypto.randomUUID(), name: "", pct: 0, fix: 0 };
}

function makeEditStrategyFromFeeOverride(item: {
  id?: string;
  name?: string;
  percent?: number;
  fixed?: number;
}): EditStrategy {
  return {
    id: item.id || crypto.randomUUID(),
    name: String(item.name || ""),
    pct: Number(item.percent) || 0,
    fix: Number(item.fixed) || 0
  };
}

function normalizeKey(text?: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function calcBaseCostFromJson(json: ProductJson) {
  const kitQty = Math.max(1, Math.floor(Number(json.kit_qty) || 1));
  const materialsCostPerUnit = (json.materials || []).reduce((acc, m) => {
    return acc + (Number(m.qty) || 0) * (Number(m.unit_cost) || 0);
  }, 0);
  const salaryTarget = Number(json.salary_target) || 0;
  const hoursPerMonth = Number(json.hours_per_month) || 0;
  const minutesPerUnit = Number(json.minutes_per_unit) || 0;
  const laborHourCost = hoursPerMonth > 0 ? salaryTarget / hoursPerMonth : 0;
  const laborPerUnit = laborHourCost * (minutesPerUnit / 60);
  const fixedPct = Number(json.fixed_pct) || 0;
  const subtotalKit = (materialsCostPerUnit + laborPerUnit) * kitQty;
  return subtotalKit * (1 + fixedPct / 100);
}

function pickMarketplaceFee(json: ProductJson, sellingPrice: number, feeConfig: OrderFeeConfig): FeePreview {
  const strategies = Array.isArray(json.strategies) ? json.strategies : [];
  const mlStrategy = strategies.find((s) => {
    const name = normalizeKey(s.name);
    return name.includes("mercado livre") || name === "ml";
  });

  if (mlStrategy) {
    const percent = Number(mlStrategy.pct) || 0;
    const fixed = Number(mlStrategy.fix) || 0;
    return {
      label: mlStrategy.name || "Mercado Livre",
      percent,
      fixed,
      fee: sellingPrice * (percent / 100) + fixed
    };
  }

  const mlOverride =
    feeConfig.overrides.find((o) => normalizeKey(o.name).includes("mercado livre")) || feeConfig.overrides[0];
  const percent = Number(mlOverride?.percent ?? feeConfig.default.percent) || 0;
  const fixed = Number(mlOverride?.fixed ?? feeConfig.default.fixed) || 0;
  return {
    label: mlOverride?.name || "Marketplace",
    percent,
    fixed,
    fee: sellingPrice * (percent / 100) + fixed
  };
}

export function ProductsPage() {
  const [items, setItems] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProductRow | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState(0);
  const [editCost, setEditCost] = useState(0);
  const [editMargin, setEditMargin] = useState(0);
  const [editKitQty, setEditKitQty] = useState(1);
  const [editImageData, setEditImageData] = useState("");
  const [editMaterials, setEditMaterials] = useState<EditMaterial[]>([makeEditMaterial()]);
  const [editStrategies, setEditStrategies] = useState<EditStrategy[]>([makeEditStrategy()]);
  const [autoSyncInfo, setAutoSyncInfo] = useState<string | null>(null);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [feeConfig, setFeeConfig] = useState<OrderFeeConfig>(DEFAULT_ORDER_FEE_CONFIG);
  const syncRunningRef = useRef(false);
  const runSyncRef = useRef<null | (() => Promise<void>)>(null);

  useEffect(() => {
    let mounted = true;

    async function syncProductsByMaterialChange(
      userId: string,
      products: ProductRow[],
      forceFullFix = false
    ) {
      if (!supabase || syncRunningRef.current) return products;
      syncRunningRef.current = true;
      try {
        const { data: libRows } = await supabase
          .from("pricing_materials")
          .select("id, name, unit_cost, cost_per_unit")
          .eq("user_id", userId);

        const libMap = new Map<string, number>();
        ((libRows || []) as MaterialLibraryRow[]).forEach((row) => {
          const key = normalizeKey(row.name);
          if (!key) return;
          const price = Number(row.unit_cost ?? row.cost_per_unit ?? 0) || 0;
          libMap.set(key, price);
        });

        let changedProducts = 0;
        const nextProducts = [...products];

        for (let i = 0; i < nextProducts.length; i += 1) {
          const p = nextProducts[i];
          const json = parseJson(p.materials_json);
          const mats = json.materials || [];
          if (!mats.length) continue;

          let changedMats = 0;
          const updatedMaterials = mats.map((m) => {
            const key = normalizeKey(m.name);
            const currentCost = Number(m.unit_cost) || 0;
            const libCost = key ? libMap.get(key) : undefined;
            if (typeof libCost === "number" && Math.abs(libCost - currentCost) > 0.0001) {
              changedMats += 1;
              const qty = Number(m.qty) || 0;
              return { ...m, unit_cost: libCost, cost: qty * libCost };
            }
            return {
              ...m,
              cost: (Number(m.qty) || 0) * (Number(m.unit_cost) || 0)
            };
          });

          const oldBase = Number(p.base_cost) || 0;
          const oldPrice = Number(p.selling_price) || 0;
          const marginPct = Number(p.final_margin) || 0;
          const nextJsonBase: ProductJson = {
            ...json,
            materials: updatedMaterials
          };
          const nextBaseRaw = calcBaseCostFromJson(nextJsonBase);
          const nextBase = Number(nextBaseRaw.toFixed(2));
          const safeMultiplier = 1 - marginPct / 100;
          const nextPriceRaw = safeMultiplier > 0 ? nextBaseRaw / safeMultiplier : oldPrice;
          const nextPrice = Number(nextPriceRaw.toFixed(2));

          const hasWrongBase = Math.abs(nextBase - oldBase) > 0.01;
          const shouldFix = changedMats > 0 || (forceFullFix && hasWrongBase);

          if (!shouldFix) continue;

          const reason =
            changedMats > 0
              ? `${changedMats} material(is) com preco novo da biblioteca`
              : "correcao manual de valores inconsistentes";
          const nextJson: ProductJson = {
            ...nextJsonBase,
            history: [
              {
                date: new Date().toISOString(),
                msg: `Atualizacao automatica: ${reason}`,
                type: changedMats > 0 ? "material_sync" : "value_fix",
                old: oldBase
              },
              ...(json.history || [])
            ].slice(0, 50)
          };

          if (nextJson.history && nextJson.history[0]) {
            nextJson.history[0].new = nextBase;
          }

          const { error: updateError } = await supabase
            .from("pricing_products")
            .update({
              materials_json: nextJson,
              base_cost: nextBase
            })
            .eq("id", p.id)
            .eq("user_id", userId);

          if (!updateError) {
            changedProducts += 1;
            nextProducts[i] = {
              ...p,
              materials_json: nextJson,
              base_cost: nextBase
            };
          }
        }

        if (changedProducts > 0) {
          setAutoSyncInfo(
            `Atualizacao automatica: ${changedProducts} produto(s) recalculado(s).`
          );
        } else if (forceFullFix) {
          setAutoSyncInfo("Nenhuma correcao de valor necessaria no momento.");
        }

        return nextProducts;
      } finally {
        syncRunningRef.current = false;
      }
    }

    async function run(initial = false, forceFullFix = false) {
      if (!supabase) {
        setError("Supabase nao configurado.");
        setLoading(false);
        return;
      }

      if (initial) setLoading(true);
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (!userId) {
        if (!mounted) return;
        setItems([]);
        setError("Usuario nao autenticado.");
        if (initial) setLoading(false);
        return;
      }

      const { data, error: queryError } = await supabase
        .from("pricing_products")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (queryError) {
        setItems([]);
        setError(queryError.message);
      } else {
        const syncedItems = await syncProductsByMaterialChange(
          userId,
          (data || []) as ProductRow[],
          forceFullFix
        );
        if (!mounted) return;
        setItems(syncedItems);
        const cfg = await loadOrderFeeConfig();
        if (mounted) setFeeConfig(cfg);
        setSelected((prev) => {
          if (!prev) return null;
          return syncedItems.find((item) => String(item.id) === String(prev.id)) || prev;
        });
      }

      if (initial) setLoading(false);
    }

    void run(true);
    runSyncRef.current = async () => {
      setManualSyncing(true);
      await run(false, true);
      setManualSyncing(false);
    };
    const timer = window.setInterval(() => {
      void run(false);
    }, 20_000);

    return () => {
      mounted = false;
      runSyncRef.current = null;
      window.clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => (p.product_name || "").toLowerCase().includes(q));
  }, [items, search]);

  const selectedJson = parseJson(selected?.materials_json);
  const selectedKit = Math.max(1, Math.floor(Number(selectedJson.kit_qty) || 1));
  const selectedMaterials = selectedJson.materials || [];
  const selectedStrategies = selectedJson.strategies || [];
  const selectedHistory = selectedJson.history || [];

  function startEdit(product: ProductRow) {
    const json = parseJson(product.materials_json);
    const sourceMaterials = (json.materials || [])
      .map((m) => ({
        id: crypto.randomUUID(),
        name: String(m.name || ""),
        qty: Number(m.qty) || 0,
        unit_cost: Number(m.unit_cost) || 0
      }))
      .filter((m) => m.name || m.qty > 0 || m.unit_cost > 0);
    const sourceStrategies = (json.strategies || [])
      .map((s) => ({
        id: crypto.randomUUID(),
        name: String(s.name || ""),
        pct: Number(s.pct) || 0,
        fix: Number(s.fix) || 0
      }))
      .filter((s) => s.name || s.pct !== 0 || s.fix !== 0);
    const fallbackStrategies = (feeConfig.overrides || []).map((item) =>
      makeEditStrategyFromFeeOverride(item)
    );
    const strategiesToEdit =
      sourceStrategies.length > 0
        ? sourceStrategies
        : fallbackStrategies.length > 0
          ? fallbackStrategies
          : [makeEditStrategyFromFeeOverride({ name: "Mercado Livre", percent: feeConfig.default.percent, fixed: feeConfig.default.fixed })];

    setEditMode(true);
    setEditStatus(null);
    setEditName(product.product_name || "");
    setEditPrice(Number(product.selling_price) || 0);
    setEditCost(Number(product.base_cost) || 0);
    setEditMargin(Number(product.final_margin) || 0);
    setEditKitQty(Math.max(1, Math.floor(Number(json.kit_qty) || 1)));
    setEditImageData(product.product_image_data || "");
    setEditMaterials(sourceMaterials.length > 0 ? sourceMaterials : [makeEditMaterial()]);
    setEditStrategies(strategiesToEdit);
  }

  function cancelEdit() {
    setEditMode(false);
    setSavingEdit(false);
    setEditStatus(null);
  }

  async function onEditImageChange(file: File | null) {
    if (!file) return;
    const b64 = await fileToDataUrl(file);
    setEditImageData(b64);
  }

  async function saveEdit() {
    if (!supabase || !selected) {
      setEditStatus("Supabase nao configurado.");
      return;
    }

    const name = editName.trim();
    if (!name) {
      setEditStatus("Informe o nome do produto.");
      return;
    }

    setSavingEdit(true);
    setEditStatus(null);

    const oldJson = parseJson(selected.materials_json);
    const cleanMaterials = editMaterials
      .map((m) => ({
        name: m.name.trim(),
        qty: Number(m.qty) || 0,
        unit_cost: Number(m.unit_cost) || 0
      }))
      .filter((m) => m.name);
    const cleanStrategies = editStrategies
      .map((s) => ({
        name: s.name.trim(),
        pct: Number(s.pct) || 0,
        fix: Number(s.fix) || 0
      }))
      .filter((s) => s.name);

    const nextJson: ProductJson = {
      ...oldJson,
      kit_qty: Math.max(1, Math.floor(editKitQty || 1)),
      materials: cleanMaterials.map((m) => ({
        ...m,
        cost: (Number(m.qty) || 0) * (Number(m.unit_cost) || 0)
      })),
      strategies: cleanStrategies.map((s) => ({
        ...s,
        price: Number(editPrice) || 0
      }))
    };

    const { error: updateError } = await supabase
      .from("pricing_products")
      .update({
        product_name: name,
        product_image_data: editImageData || null,
        selling_price: Number(editPrice) || 0,
        base_cost: Number(editCost) || 0,
        final_margin: Number(editMargin) || 0,
        materials_json: nextJson
      })
      .eq("id", selected.id);

    if (updateError) {
      setEditStatus(`Erro ao atualizar: ${updateError.message}`);
      setSavingEdit(false);
      return;
    }

    const updatedProduct: ProductRow = {
      ...selected,
      product_name: name,
      product_image_data: editImageData || null,
      selling_price: Number(editPrice) || 0,
      base_cost: Number(editCost) || 0,
      final_margin: Number(editMargin) || 0,
      materials_json: nextJson
    };

    setItems((prev) => prev.map((item) => (String(item.id) === String(selected.id) ? updatedProduct : item)));
    setSelected(updatedProduct);
    setEditStatus("Produto atualizado com sucesso.");
    setSavingEdit(false);
    setEditMode(false);
  }

  async function duplicateSelectedProduct() {
    if (!supabase || !selected) {
      setEditStatus("Supabase nao configurado.");
      return;
    }

    setDuplicating(true);
    setEditStatus(null);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (authError || !userId) {
      setEditStatus("Usuario nao autenticado para duplicar.");
      setDuplicating(false);
      return;
    }

    const cloneNameBase = (selected.product_name || "Produto").trim() || "Produto";
    const cloneName = `${cloneNameBase} (copia)`;

    const payload = {
      user_id: userId,
      product_name: cloneName,
      product_image_data: selected.product_image_data || null,
      selling_price: Number(selected.selling_price) || 0,
      base_cost: Number(selected.base_cost) || 0,
      final_margin: Number(selected.final_margin) || 0,
      materials_json: parseJson(selected.materials_json)
    };

    const { data: inserted, error: insertError } = await supabase
      .from("pricing_products")
      .insert(payload)
      .select("*")
      .single();

    if (insertError || !inserted) {
      setEditStatus(`Erro ao duplicar: ${insertError?.message || "falha ao criar copia"}`);
      setDuplicating(false);
      return;
    }

    const cloned = inserted as ProductRow;
    setItems((prev) => [cloned, ...prev]);
    setSelected(cloned);
    startEdit(cloned);
    setEditStatus("Anuncio duplicado. Agora edite e salve as informacoes.");
    setDuplicating(false);
  }

  function updateEditMaterial(
    id: string,
    field: "name" | "qty" | "unit_cost",
    value: string
  ) {
    setEditMaterials((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "name") return { ...item, name: value };
        if (field === "qty") return { ...item, qty: Number(value) || 0 };
        return { ...item, unit_cost: Number(value) || 0 };
      })
    );
  }

  function addEditMaterial() {
    setEditMaterials((prev) => [...prev, makeEditMaterial()]);
  }

  function updateEditStrategy(
    id: string,
    field: "name" | "pct" | "fix",
    value: string
  ) {
    setEditStrategies((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "name") return { ...item, name: value };
        if (field === "pct") return { ...item, pct: Number(value) || 0 };
        return { ...item, fix: Number(value) || 0 };
      })
    );
  }

  function addEditStrategy() {
    setEditStrategies((prev) => [...prev, makeEditStrategy()]);
  }

  function removeEditStrategy(id: string) {
    setEditStrategies((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)));
  }

  function removeEditMaterial(id: string) {
    setEditMaterials((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)));
  }

  function closeModal() {
    setSelected(null);
    setEditMode(false);
    setEditStatus(null);
    setSavingEdit(false);
  }

  return (
    <section className="page">
      <div className="products-head">
        <div>
          <h2>Meus Produtos</h2>
          <p className="page-text">Modulo real em React conectado ao Supabase.</p>
        </div>
        <button
          type="button"
          className="ghost-btn"
          disabled={manualSyncing}
          onClick={() => void runSyncRef.current?.()}
        >
          {manualSyncing ? "Atualizando..." : "Atualizar agora"}
        </button>
        <input
          className="products-search"
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && (
        <div className="loading-indicator centered" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Carregando produtos...</span>
        </div>
      )}
      {!loading && error && <p className="error-text">Erro: {error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="page-text">Nenhum produto encontrado.</p>
      )}
      {autoSyncInfo && <p className="page-text">{autoSyncInfo}</p>}

      <div className="products-grid">
        {filtered.map((p) => {
          const json = parseJson(p.materials_json);
          const kitQty = Math.max(1, Math.floor(Number(json.kit_qty) || 1));
          const price = Number(p.selling_price) || 0;
          const cost = Number(p.base_cost) || 0;
          const feePreview = pickMarketplaceFee(json, price, feeConfig);
          const profit = price - feePreview.fee - cost;

          return (
            <button key={String(p.id)} className="product-card" onClick={() => setSelected(p)}>
              <div className="product-thumb">
                {p.product_image_data ? (
                  <img src={p.product_image_data} alt={p.product_name || "Produto"} />
                ) : (
                  <div className="product-noimg">Sem imagem</div>
                )}
                <div className="kit-pill">KIT {kitQty} UN</div>
              </div>
              <div className="product-body">
                <h3>{p.product_name || "Sem nome"}</h3>
                <p className="product-price">{fmt(price)}</p>
                <div className="product-meta">
                  <span>
                    Regra: {Number(feePreview.percent).toLocaleString("pt-BR")} % + {fmt(Number(feePreview.fixed) || 0)}
                  </span>
                  <span>Taxa: {fmt(feePreview.fee)}</span>
                  <span>Custo: {fmt(cost)}</span>
                  <span className={profit >= 0 ? "profit-up" : "profit-down"}>
                    Lucro liquido: {fmt(profit)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-head">
              <h3>{selected.product_name || "Produto"}</h3>
              <div className="materials-actions-cell">
                {!editMode && (
                  <button type="button" className="ghost-btn" onClick={() => void duplicateSelectedProduct()} disabled={duplicating}>
                    {duplicating ? "Duplicando..." : "Duplicar anuncio"}
                  </button>
                )}
                {!editMode && (
                  <button type="button" className="ghost-btn" onClick={() => startEdit(selected)}>
                    Editar
                  </button>
                )}
                <button onClick={closeModal}>Fechar</button>
              </div>
            </div>

            {editMode && (
              <div className="soft-panel">
                <p>Editar produto</p>
                <div className="form-grid three-col">
                  <label className="field">
                    <span>Nome</span>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Preco</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editPrice}
                      onChange={(e) => setEditPrice(Number(e.target.value) || 0)}
                    />
                  </label>
                  <label className="field">
                    <span>Custo</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editCost}
                      onChange={(e) => setEditCost(Number(e.target.value) || 0)}
                    />
                  </label>
                  <label className="field">
                    <span>Margem final (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editMargin}
                      onChange={(e) => setEditMargin(Number(e.target.value) || 0)}
                    />
                  </label>
                  <label className="field">
                    <span>Qtd kit</span>
                    <input
                      type="number"
                      min={1}
                      value={editKitQty}
                      onChange={(e) => setEditKitQty(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </label>
                  <label className="field">
                    <span>Imagem (opcional)</span>
                    <input type="file" accept="image/*" onChange={(e) => void onEditImageChange(e.target.files?.[0] || null)} />
                  </label>
                </div>

                <p className="pricing-lib-title">Materiais do produto</p>
                <div className="pricing-rows">
                  {editMaterials.map((item) => (
                    <div className="pricing-row" key={item.id}>
                      <input
                        className="pricing-item-input"
                        value={item.name}
                        onChange={(e) => updateEditMaterial(item.id, "name", e.target.value)}
                        placeholder="Item"
                      />
                      <input
                        className="pricing-small-input"
                        type="number"
                        step="0.01"
                        value={item.qty}
                        onChange={(e) => updateEditMaterial(item.id, "qty", e.target.value)}
                      />
                      <input
                        className="pricing-small-input"
                        type="number"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) => updateEditMaterial(item.id, "unit_cost", e.target.value)}
                        placeholder="$ Unit"
                      />
                      <input
                        className="pricing-total-input"
                        readOnly
                        value={((Number(item.qty) || 0) * (Number(item.unit_cost) || 0)).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      />
                      <button
                        type="button"
                        className="pricing-trash"
                        onClick={() => removeEditMaterial(item.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="pricing-add-line" onClick={addEditMaterial}>
                  + Adicionar material
                </button>

                <p className="pricing-lib-title">Taxas por marketplace</p>
                <div className="pricing-rows">
                  {editStrategies.map((item) => (
                    <div className="pricing-row" key={item.id}>
                      <input
                        className="pricing-item-input"
                        value={item.name}
                        onChange={(e) => updateEditStrategy(item.id, "name", e.target.value)}
                        placeholder="Marketplace"
                      />
                      <input
                        className="pricing-small-input"
                        type="number"
                        step="0.01"
                        value={item.pct}
                        onChange={(e) => updateEditStrategy(item.id, "pct", e.target.value)}
                        placeholder="%"
                      />
                      <input
                        className="pricing-small-input"
                        type="number"
                        step="0.01"
                        value={item.fix}
                        onChange={(e) => updateEditStrategy(item.id, "fix", e.target.value)}
                        placeholder="Fixo"
                      />
                      <input
                        className="pricing-total-input"
                        readOnly
                        value={fmt((Number(editPrice) || 0) * ((Number(item.pct) || 0) / 100) + (Number(item.fix) || 0))}
                      />
                      <button
                        type="button"
                        className="pricing-trash"
                        onClick={() => removeEditStrategy(item.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="pricing-add-line" onClick={addEditStrategy}>
                  + Adicionar taxa
                </button>

                {editImageData && (
                  <div className="pricing-image-preview-wrap">
                    <img src={editImageData} alt="Preview produto editado" className="pricing-image-preview" />
                  </div>
                )}

                <div className="actions-row">
                  <button type="button" className="ghost-btn" onClick={cancelEdit}>
                    Cancelar
                  </button>
                  <button type="button" className="primary-btn" onClick={saveEdit} disabled={savingEdit}>
                    {savingEdit ? "Salvando..." : "Salvar alteracoes"}
                  </button>
                </div>

                {editStatus && <p className="page-text">{editStatus}</p>}
              </div>
            )}

            <div className="product-modal-grid">
              <div className="soft-panel">
                <p>Resumo</p>
                <ul>
                  <li>Kit: {selectedKit} unidade(s)</li>
                  <li>Preco: {fmt(Number(selected.selling_price) || 0)}</li>
                  <li>Custo: {fmt(Number(selected.base_cost) || 0)}</li>
                  <li>
                    Margem final: {(Number(selected.final_margin) || 0).toLocaleString("pt-BR")}%
                  </li>
                </ul>
              </div>

              <div className="soft-panel">
                <p>Materiais ({selectedMaterials.length})</p>
                {selectedMaterials.length === 0 ? (
                  <span className="page-text">Nenhum material.</span>
                ) : (
                  <ul>
                    {selectedMaterials.slice(0, 8).map((m, i) => (
                      <li key={`${m.name || "item"}-${i}`}>
                        {m.name || "Material"} - {Number(m.qty) || 0} x {fmt(Number(m.unit_cost) || 0)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="product-modal-grid">
              <div className="soft-panel">
                <p>Estrategias ({selectedStrategies.length})</p>
                {selectedStrategies.length === 0 ? (
                  <div>
                    <span className="page-text">Nenhuma estrategia no produto. Usando taxas cadastradas:</span>
                    <ul>
                      {(feeConfig.overrides.length > 0 ? feeConfig.overrides : [{
                        id: "padrao",
                        name: "Padrao",
                        percent: feeConfig.default.percent,
                        fixed: feeConfig.default.fixed
                      }]).slice(0, 8).map((s) => (
                        <li key={`${s.id}-${s.name}`}>
                          {s.name} - {Number(s.percent).toLocaleString("pt-BR")} % + {fmt(Number(s.fixed) || 0)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <ul>
                    {selectedStrategies.slice(0, 8).map((s, i) => (
                      <li key={`${s.name || "estrategia"}-${i}`}>
                        {s.name || "Canal"} - {Number(s.pct || 0).toLocaleString("pt-BR")} % + {fmt(Number(s.fix) || 0)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="soft-panel">
                <p>Historico ({selectedHistory.length})</p>
                {selectedHistory.length === 0 ? (
                  <span className="page-text">Sem historico.</span>
                ) : (
                  <ul>
                    {selectedHistory.slice(0, 8).map((h, i) => (
                      <li key={`${h.date || "h"}-${i}`}>
                        {(h.date && new Date(h.date).toLocaleDateString("pt-BR")) || "Data"} -{" "}
                        {h.msg || h.type || "Atualizacao"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}







