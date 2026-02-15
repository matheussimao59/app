import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  DEFAULT_ORDER_FEE_CONFIG,
  loadOrderFeeConfig,
  type OrderFeeConfig
} from "../lib/orderFeeConfig";

type Material = {
  id: string;
  name: string;
  qty: number;
  unit_cost: number;
};

type MaterialLibraryRow = {
  id: string;
  name: string;
  unit_cost?: number | null;
  cost_per_unit?: number | null;
  unit_of_measure?: string | null;
  user_id?: string | null;
};

const STEPS = [
  { id: 1, label: "1. Materiais" },
  { id: 2, label: "2. Mao de Obra" },
  { id: 3, label: "3. Custos Fixos" },
  { id: 4, label: "4. Resumo" },
  { id: 5, label: "5. Preco" },
  { id: 6, label: "6. Marketplaces" }
] as const;

function money(value: number) {
  return (Number(value) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function moneyShort(value: number) {
  return (Number(value) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function makeMaterial(): Material {
  return { id: crypto.randomUUID(), name: "", qty: 1, unit_cost: 0 };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PricingPage() {
  const [step, setStep] = useState<number>(1);
  const [feeConfig, setFeeConfig] = useState<OrderFeeConfig>(DEFAULT_ORDER_FEE_CONFIG);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [productName, setProductName] = useState("");
  const [productImageData, setProductImageData] = useState("");
  const [kitQty, setKitQty] = useState(1);

  const [materials, setMaterials] = useState<Material[]>([makeMaterial()]);
  const [libraryItems, setLibraryItems] = useState<MaterialLibraryRow[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [showMaterialsModal, setShowMaterialsModal] = useState(false);
  const [editingLibraryId, setEditingLibraryId] = useState<string | null>(null);
  const [libName, setLibName] = useState("");
  const [libUnitCost, setLibUnitCost] = useState(0);
  const [libUnit, setLibUnit] = useState("un");
  const [libSaving, setLibSaving] = useState(false);
  const [libStatus, setLibStatus] = useState<string | null>(null);

  const [salaryTarget, setSalaryTarget] = useState(3000);
  const [hoursPerMonth, setHoursPerMonth] = useState(160);
  const [minutesPerUnit, setMinutesPerUnit] = useState(20);

  const [fixedPct, setFixedPct] = useState(10);
  const [marginPct, setMarginPct] = useState(30);
  const [manualPrice, setManualPrice] = useState(0);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const currentStepLabel = STEPS.find((item) => item.id === step)?.label || "Cadastro";

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoadingConfig(true);
      const config = await loadOrderFeeConfig();
      if (!mounted) return;
      setFeeConfig(config);
      setLoadingConfig(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, []);

  async function loadLibrary() {
    if (!supabase) {
      setLibraryItems([]);
      setLoadingLibrary(false);
      return;
    }

    setLoadingLibrary(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      let data: MaterialLibraryRow[] | null = null;

      if (userId) {
        const res = await supabase
          .from("pricing_materials")
          .select("*")
          .eq("user_id", userId)
          .order("name", { ascending: true });

        if (!res.error && res.data) {
          data = res.data as MaterialLibraryRow[];
        }
      }

      if (!data || data.length === 0) {
        const fallback = await supabase
          .from("pricing_materials")
          .select("*")
          .order("name", { ascending: true })
          .limit(80);

        if (!fallback.error && fallback.data) {
          data = fallback.data as MaterialLibraryRow[];
        }
      }

      setLibraryItems(data || []);
    } catch {
      setLibraryItems([]);
    } finally {
      setLoadingLibrary(false);
    }
  }

  useEffect(() => {
    loadLibrary();
  }, []);

  const perUnitMaterialCost = useMemo(
    () =>
      materials.reduce(
        (acc, item) => acc + (Number(item.qty) || 0) * (Number(item.unit_cost) || 0),
        0
      ),
    [materials]
  );

  const laborHourCost = useMemo(() => {
    const salary = Number(salaryTarget) || 0;
    const hours = Number(hoursPerMonth) || 0;
    return hours > 0 ? salary / hours : 0;
  }, [salaryTarget, hoursPerMonth]);

  const laborPerUnit = useMemo(() => {
    const mins = Number(minutesPerUnit) || 0;
    return laborHourCost * (mins / 60);
  }, [laborHourCost, minutesPerUnit]);

  const costPerUnit = useMemo(() => perUnitMaterialCost + laborPerUnit, [perUnitMaterialCost, laborPerUnit]);

  const subtotalKit = useMemo(
    () => costPerUnit * Math.max(1, Math.floor(kitQty || 1)),
    [costPerUnit, kitQty]
  );

  const totalCostWithFixed = useMemo(
    () => subtotalKit * (1 + (Number(fixedPct) || 0) / 100),
    [subtotalKit, fixedPct]
  );

  const breakEvenMultiplier = useMemo(() => {
    const margin = Number(marginPct) || 0;
    const result = 1 - margin / 100;
    return result > 0 ? result : 0.01;
  }, [marginPct]);

  const suggestedPrice = useMemo(
    () => totalCostWithFixed / breakEvenMultiplier,
    [totalCostWithFixed, breakEvenMultiplier]
  );

  const sellingPrice = manualPrice > 0 ? manualPrice : suggestedPrice;
  const estimatedProfit = useMemo(
    () => sellingPrice - totalCostWithFixed,
    [sellingPrice, totalCostWithFixed]
  );

  const marginReal = useMemo(
    () => (sellingPrice > 0 ? (estimatedProfit / sellingPrice) * 100 : 0),
    [sellingPrice, estimatedProfit]
  );

  const channelPreview = useMemo(() => {
    const channels = feeConfig.overrides.length
      ? feeConfig.overrides
      : [
          {
            id: "padrao",
            name: "Padrao",
            percent: feeConfig.default.percent,
            fixed: feeConfig.default.fixed
          }
        ];

    return channels.map((m) => {
      const fee = sellingPrice * (m.percent / 100) + m.fixed;
      const net = sellingPrice - fee;
      const profit = net - totalCostWithFixed;
      const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
      return { ...m, fee, net, profit, margin };
    });
  }, [feeConfig, sellingPrice, totalCostWithFixed]);

  function updateMaterial(id: string, field: "name" | "qty" | "unit_cost", value: string) {
    setMaterials((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "name") return { ...item, name: value };
        if (field === "qty") return { ...item, qty: Number(value) || 0 };
        return { ...item, unit_cost: Number(value) || 0 };
      })
    );
  }

  function addMaterial() {
    setMaterials((prev) => [...prev, makeMaterial()]);
  }

  function removeMaterial(id: string) {
    setMaterials((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)));
  }

  function addFromLibrary(item: MaterialLibraryRow) {
    const unitCost = Number(item.unit_cost ?? item.cost_per_unit ?? 0) || 0;
    setMaterials((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: item.name,
        qty: 1,
        unit_cost: unitCost
      }
    ]);
  }

  async function openMaterialsModal() {
    setLibStatus(null);
    setShowMaterialsModal(true);
    await loadLibrary();
  }

  function startEditLibrary(item: MaterialLibraryRow) {
    setEditingLibraryId(item.id);
    setLibName(item.name || "");
    setLibUnitCost(Number(item.unit_cost ?? item.cost_per_unit ?? 0) || 0);
    setLibUnit(item.unit_of_measure || "un");
    setLibStatus(null);
  }

  function clearLibraryForm() {
    setEditingLibraryId(null);
    setLibName("");
    setLibUnitCost(0);
    setLibUnit("un");
  }

  async function saveLibraryMaterial() {
    setLibStatus(null);
    if (!supabase) {
      setLibStatus("Supabase nao configurado.");
      return;
    }

    const name = libName.trim();
    if (!name) {
      setLibStatus("Informe o nome do material.");
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      setLibStatus("Usuario nao autenticado.");
      return;
    }

    setLibSaving(true);
    const payload = {
      user_id: userId,
      name,
      unit_cost: Number(libUnitCost) || 0,
      unit_of_measure: libUnit.trim() || "un"
    };

    let errorMessage: string | null = null;
    if (editingLibraryId) {
      const { error } = await supabase.from("pricing_materials").update(payload).eq("id", editingLibraryId);
      if (error) errorMessage = error.message;
    } else {
      const { error } = await supabase.from("pricing_materials").insert(payload);
      if (error) errorMessage = error.message;
    }

    if (errorMessage) {
      setLibStatus(`Erro ao salvar: ${errorMessage}`);
      setLibSaving(false);
      return;
    }

    clearLibraryForm();
    setLibStatus("Material salvo com sucesso.");
    setLibSaving(false);
    await loadLibrary();
  }

  async function deleteLibraryMaterial(id: string) {
    if (!supabase) return;
    setLibStatus(null);
    const { error } = await supabase.from("pricing_materials").delete().eq("id", id);
    if (error) {
      setLibStatus(`Erro ao excluir: ${error.message}`);
      return;
    }
    setLibStatus("Material excluido.");
    if (editingLibraryId === id) clearLibraryForm();
    await loadLibrary();
  }

  async function onImageChange(file: File | null) {
    if (!file) return;
    const b64 = await fileToDataUrl(file);
    setProductImageData(b64);
  }

  async function saveProduct() {
    setStatus(null);

    if (!supabase) {
      setStatus("Supabase nao configurado.");
      return;
    }

    const name = productName.trim();
    if (!name) {
      setStatus("Informe o nome do produto.");
      return;
    }

    const cleanMaterials = materials
      .map((item) => ({
        name: item.name.trim(),
        qty: Number(item.qty) || 0,
        unit_cost: Number(item.unit_cost) || 0,
        cost: (Number(item.qty) || 0) * (Number(item.unit_cost) || 0)
      }))
      .filter((item) => item.name);

    if (cleanMaterials.length === 0) {
      setStatus("Adicione ao menos um material.");
      return;
    }

    setSaving(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) {
        setStatus("Usuario nao autenticado.");
        return;
      }

      const payload = {
        user_id: userId,
        product_name: name,
        product_image_data: productImageData || null,
        selling_price: Number(sellingPrice.toFixed(2)),
        base_cost: Number(totalCostWithFixed.toFixed(2)),
        final_margin: Number(marginReal.toFixed(2)),
        materials_json: {
          kit_qty: Math.max(1, Math.floor(kitQty || 1)),
          materials: cleanMaterials,
          salary_target: Number(salaryTarget) || 0,
          hours_per_month: Number(hoursPerMonth) || 0,
          minutes_per_unit: Number(minutesPerUnit) || 0,
          fixed_pct: Number(fixedPct) || 0,
          strategies: channelPreview.map((c) => ({
            name: c.name,
            pct: c.percent,
            fix: c.fixed,
            price: Number(sellingPrice.toFixed(2)),
            fee: Number(c.fee.toFixed(2)),
            profit: Number(c.profit.toFixed(2))
          })),
          history: [
            {
              date: new Date().toISOString(),
              msg: "Produto salvo pelo modulo React de precificacao",
              type: "create",
              new: Number(sellingPrice.toFixed(2))
            }
          ]
        }
      };

      const { error } = await supabase.from("pricing_products").insert(payload);
      if (error) {
        setStatus(`Erro ao salvar: ${error.message}`);
        return;
      }

      setStatus("Produto salvo com sucesso em Meus Produtos.");
      setProductName("");
      setProductImageData("");
      setKitQty(1);
      setMaterials([makeMaterial()]);
      setManualPrice(0);
      setStep(1);
    } finally {
      setSaving(false);
    }
  }

  function nextStep() {
    setStep((prev) => Math.min(6, prev + 1));
  }

  function prevStep() {
    setStep((prev) => Math.max(1, prev - 1));
  }

  return (
    <section className="page pricing-page pricing-mirror">
      <div className="pricing-header-row">
        <h2>Precificacao</h2>
        <div className="pricing-header-actions">
          <button className="ghost-btn" type="button" onClick={openMaterialsModal}>Materiais</button>
          <Link to="/produtos" className="pricing-link-btn">Meus Produtos</Link>
        </div>
      </div>

      <div className="pricing-kit-box">
        <p>Precificacao por Kit</p>
        <label>
          <span>Qtd do kit:</span>
          <input
            type="number"
            min={1}
            value={kitQty}
            onChange={(e) => setKitQty(Math.max(1, Number(e.target.value) || 1))}
          />
          <small>Ex: 15 calendarios</small>
        </label>
      </div>

      <div className="pricing-product-head">
        <div className="pricing-product-name">
          <label>Nome do Produto</label>
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Ex: Camiseta"
          />
        </div>

        <div className="pricing-product-image">
          <label>Imagem</label>
          <label className="pricing-image-drop">
            <input type="file" accept="image/*" onChange={(e) => onImageChange(e.target.files?.[0] || null)} />
            <span className="pricing-image-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
                <circle cx="9" cy="10" r="1.5" />
                <path d="M5.5 16l4.5-4 3 2.5 2.5-2 3 3.5" />
              </svg>
            </span>
            <span className="pricing-image-text">Selecionar</span>
          </label>
        </div>
      </div>

      {productImageData && (
        <div className="pricing-image-preview-wrap">
          <img src={productImageData} alt="Preview produto" className="pricing-image-preview" />
        </div>
      )}

      <div className="pricing-step-line">
        <span>Etapa atual: {currentStepLabel}</span>
      </div>

      {step === 1 && (
        <section className="pricing-materials-block">
          <h3>Materiais</h3>
          <div className="pricing-tip-box">
            Liste tudo o que voce gasta para fazer <strong>1 unidade</strong> do seu produto.
          </div>

          <div className="pricing-rows">
            {materials.map((item) => (
              <div className="pricing-row" key={item.id}>
                <input
                  className="pricing-item-input"
                  value={item.name}
                  onChange={(e) => updateMaterial(item.id, "name", e.target.value)}
                  placeholder="Item"
                />
                <input
                  className="pricing-small-input"
                  type="number"
                  step="0.01"
                  value={item.qty}
                  onChange={(e) => updateMaterial(item.id, "qty", e.target.value)}
                />
                <input
                  className="pricing-small-input"
                  type="number"
                  step="0.01"
                  value={item.unit_cost}
                  onChange={(e) => updateMaterial(item.id, "unit_cost", e.target.value)}
                  placeholder="$ Unit"
                />
                <input
                  className="pricing-total-input"
                  readOnly
                  value={moneyShort((Number(item.qty) || 0) * (Number(item.unit_cost) || 0))}
                />
                <button type="button" className="pricing-trash" onClick={() => removeMaterial(item.id)}>
                  Excluir
                </button>
              </div>
            ))}
          </div>

          <p className="pricing-lib-title">MATERIAIS DA BIBLIOTECA</p>
          {loadingLibrary ? (
            <p className="page-text">Carregando materiais cadastrados...</p>
          ) : libraryItems.length === 0 ? (
            <p className="page-text">Nenhum material cadastrado encontrado.</p>
          ) : (
            <div className="pricing-chip-grid">
              {libraryItems.map((item) => {
                const price = Number(item.unit_cost ?? item.cost_per_unit ?? 0) || 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="pricing-chip"
                    onClick={() => addFromLibrary(item)}
                  >
                    + {item.name} (R$ {moneyShort(price)})
                  </button>
                );
              })}
            </div>
          )}

          <button type="button" className="pricing-add-line" onClick={addMaterial}>
            + Adicionar linha vazia
          </button>

          <div className="pricing-total-row">
            <strong>Total materiais: {money(perUnitMaterialCost)}</strong>
            <button className="primary-btn" type="button" onClick={nextStep}>Proximo</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="soft-panel pricing-stage">
          <h3>Mao de Obra</h3>
          <div className="form-grid three-col">
            <label className="field">
              <span>Salario desejado</span>
              <input type="number" value={salaryTarget} onChange={(e) => setSalaryTarget(Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              <span>Horas por mes</span>
              <input type="number" value={hoursPerMonth} onChange={(e) => setHoursPerMonth(Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              <span>Minutos por unidade</span>
              <input type="number" value={minutesPerUnit} onChange={(e) => setMinutesPerUnit(Number(e.target.value) || 0)} />
            </label>
          </div>
          <p className="page-text">Custo/hora: {money(laborHourCost)} | Mao de obra por unidade: {money(laborPerUnit)}</p>
          <div className="actions-row">
            <button className="ghost-btn" type="button" onClick={prevStep}>Voltar</button>
            <button className="primary-btn" type="button" onClick={nextStep}>Proximo</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="soft-panel pricing-stage">
          <h3>Custos Fixos</h3>
          <div className="form-grid two-col">
            <label className="field">
              <span>Custos fixos (%)</span>
              <input type="number" step="0.01" value={fixedPct} onChange={(e) => setFixedPct(Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              <span>Subtotal do kit</span>
              <input value={money(subtotalKit)} readOnly />
            </label>
          </div>
          <p className="page-text">Custo total com fixos: {money(totalCostWithFixed)}</p>
          <div className="actions-row">
            <button className="ghost-btn" type="button" onClick={prevStep}>Voltar</button>
            <button className="primary-btn" type="button" onClick={nextStep}>Proximo</button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="soft-panel pricing-stage">
          <h3>Resumo</h3>
          <ul className="task-list">
            <li>Kit: {kitQty} unidade(s)</li>
            <li>Materiais por unidade: {money(perUnitMaterialCost)}</li>
            <li>Mao de obra por unidade: {money(laborPerUnit)}</li>
            <li>Custo final do kit: {money(totalCostWithFixed)}</li>
          </ul>
          <div className="actions-row">
            <button className="ghost-btn" type="button" onClick={prevStep}>Voltar</button>
            <button className="primary-btn" type="button" onClick={nextStep}>Proximo</button>
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="soft-panel pricing-stage">
          <h3>Preco</h3>
          <div className="form-grid three-col">
            <label className="field">
              <span>Margem alvo (%)</span>
              <input type="number" step="0.01" value={marginPct} onChange={(e) => setMarginPct(Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              <span>Preco sugerido</span>
              <input readOnly value={money(suggestedPrice)} />
            </label>
            <label className="field">
              <span>Preco manual (opcional)</span>
              <input type="number" step="0.01" value={manualPrice} onChange={(e) => setManualPrice(Number(e.target.value) || 0)} />
            </label>
          </div>
          <p className="page-text">Preco final: {money(sellingPrice)} | Lucro bruto estimado: {money(estimatedProfit)} ({marginReal.toFixed(2)}%)</p>
          <div className="actions-row">
            <button className="ghost-btn" type="button" onClick={prevStep}>Voltar</button>
            <button className="primary-btn" type="button" onClick={nextStep}>Proximo</button>
          </div>
        </section>
      )}

      {step === 6 && (
        <section id="pricing-marketplaces" className="soft-panel pricing-stage">
          <div className="section-head row-between">
            <p>Marketplaces</p>
          </div>

          {loadingConfig && <p className="page-text">Carregando taxas do Supabase...</p>}

          <div className="table-wrap">
            <table className="table clean">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Taxa</th>
                  <th>Receita liquida</th>
                  <th>Lucro</th>
                  <th>Margem</th>
                </tr>
              </thead>
              <tbody>
                {channelPreview.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{money(c.fee)}</td>
                    <td>{money(c.net)}</td>
                    <td className={c.profit >= 0 ? "profit-up" : "profit-down"}>{money(c.profit)}</td>
                    <td>{c.margin.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="actions-row">
            <button className="ghost-btn" type="button" onClick={prevStep}>Voltar</button>
            <button className="primary-btn" type="button" disabled={saving} onClick={saveProduct}>
              {saving ? "Salvando..." : "Salvar produto"}
            </button>
          </div>
        </section>
      )}

      {status && <p className="page-text">{status}</p>}

      {showMaterialsModal && (
        <div className="modal-backdrop" onClick={() => setShowMaterialsModal(false)}>
          <div className="product-modal materials-manager-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-head">
              <h3>Biblioteca de Materiais</h3>
              <button type="button" onClick={() => setShowMaterialsModal(false)}>Fechar</button>
            </div>

            <div className="soft-panel">
              <div className="form-grid three-col">
                <label className="field">
                  <span>Material</span>
                  <input value={libName} onChange={(e) => setLibName(e.target.value)} placeholder="Ex: Papel OffSet 120g" />
                </label>
                <label className="field">
                  <span>Custo unitario (R$)</span>
                  <input type="number" step="0.01" value={libUnitCost} onChange={(e) => setLibUnitCost(Number(e.target.value) || 0)} />
                </label>
                <label className="field">
                  <span>Unidade</span>
                  <input value={libUnit} onChange={(e) => setLibUnit(e.target.value)} placeholder="un, kg, folha..." />
                </label>
              </div>
              <div className="actions-row">
                <button type="button" className="ghost-btn" onClick={clearLibraryForm}>Limpar</button>
                <button type="button" className="primary-btn" onClick={saveLibraryMaterial} disabled={libSaving}>
                  {libSaving ? "Salvando..." : editingLibraryId ? "Salvar alteracoes" : "Adicionar material"}
                </button>
              </div>
              {libStatus && <p className="page-text">{libStatus}</p>}
            </div>

            <div className="table-wrap">
              <table className="table clean">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Custo</th>
                    <th>Unidade</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLibrary && (
                    <tr>
                      <td colSpan={4}>Carregando materiais...</td>
                    </tr>
                  )}
                  {!loadingLibrary && libraryItems.length === 0 && (
                    <tr>
                      <td colSpan={4}>Nenhum material cadastrado.</td>
                    </tr>
                  )}
                  {!loadingLibrary &&
                    libraryItems.map((item) => {
                      const value = Number(item.unit_cost ?? item.cost_per_unit ?? 0) || 0;
                      return (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>{money(value)}</td>
                          <td>{item.unit_of_measure || "un"}</td>
                          <td className="materials-actions-cell">
                            <button type="button" className="ghost-btn" onClick={() => startEditLibrary(item)}>Editar</button>
                            <button type="button" className="danger-btn" onClick={() => deleteLibraryMaterial(item.id)}>Excluir</button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
