import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

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

export function ProductsPage() {
  const [items, setItems] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProductRow | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState(0);
  const [editCost, setEditCost] = useState(0);
  const [editMargin, setEditMargin] = useState(0);
  const [editKitQty, setEditKitQty] = useState(1);
  const [editImageData, setEditImageData] = useState("");

  useEffect(() => {
    let mounted = true;

    async function run() {
      if (!supabase) {
        setError("Supabase nao configurado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (!userId) {
        if (!mounted) return;
        setItems([]);
        setError("Usuario nao autenticado.");
        setLoading(false);
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
        setItems((data || []) as ProductRow[]);
      }

      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
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
    setEditMode(true);
    setEditStatus(null);
    setEditName(product.product_name || "");
    setEditPrice(Number(product.selling_price) || 0);
    setEditCost(Number(product.base_cost) || 0);
    setEditMargin(Number(product.final_margin) || 0);
    setEditKitQty(Math.max(1, Math.floor(Number(json.kit_qty) || 1)));
    setEditImageData(product.product_image_data || "");
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
    const nextJson: ProductJson = {
      ...oldJson,
      kit_qty: Math.max(1, Math.floor(editKitQty || 1))
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
        <input
          className="products-search"
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="page-text">Carregando produtos...</p>}
      {!loading && error && <p className="error-text">Erro: {error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="page-text">Nenhum produto encontrado.</p>
      )}

      <div className="products-grid">
        {filtered.map((p) => {
          const json = parseJson(p.materials_json);
          const kitQty = Math.max(1, Math.floor(Number(json.kit_qty) || 1));
          const price = Number(p.selling_price) || 0;
          const cost = Number(p.base_cost) || 0;
          const profit = price - cost;

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
                  <span>Custo: {fmt(cost)}</span>
                  <span className={profit >= 0 ? "profit-up" : "profit-down"}>
                    Lucro: {fmt(profit)}
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
                  <span className="page-text">Nenhuma estrategia.</span>
                ) : (
                  <ul>
                    {selectedStrategies.slice(0, 8).map((s, i) => (
                      <li key={`${s.name || "estrategia"}-${i}`}>
                        {s.name || "Canal"} - {fmt(Number(s.price) || 0)}
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
