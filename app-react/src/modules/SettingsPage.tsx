import { useEffect, useState } from "react";
import {
  DEFAULT_ORDER_FEE_CONFIG,
  loadOrderFeeConfig,
  saveOrderFeeConfig,
  type OrderFeeConfig
} from "../lib/orderFeeConfig";

function cloneConfig(config: OrderFeeConfig): OrderFeeConfig {
  return {
    default: { ...config.default },
    overrides: config.overrides.map((item) => ({ ...item }))
  };
}

export function SettingsPage() {
  const [form, setForm] = useState<OrderFeeConfig>(cloneConfig(DEFAULT_ORDER_FEE_CONFIG));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);
      const config = await loadOrderFeeConfig();
      if (!mounted) return;
      setForm(cloneConfig(config));
      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, []);

  function addOverride() {
    setForm((prev) => ({
      ...prev,
      overrides: [...prev.overrides, { id: crypto.randomUUID(), name: "", percent: 0, fixed: 0 }]
    }));
  }

  function removeOverride(index: number) {
    setForm((prev) => ({
      ...prev,
      overrides: prev.overrides.filter((_, i) => i !== index)
    }));
  }

  function updateOverride(index: number, field: "name" | "percent" | "fixed", value: string) {
    setForm((prev) => {
      const next = cloneConfig(prev);
      const row = next.overrides[index];
      if (!row) return prev;

      if (field === "name") row.name = value;
      if (field === "percent") row.percent = Number(value) || 0;
      if (field === "fixed") row.fixed = Number(value) || 0;
      return next;
    });
  }

  async function save() {
    setStatus(null);
    setSaving(true);

    const clean: OrderFeeConfig = {
      default: {
        percent: Number(form.default.percent) || 0,
        fixed: Number(form.default.fixed) || 0
      },
      overrides: form.overrides
        .map((item) => ({
          id: String(item.id || item.name || crypto.randomUUID()).toLowerCase().replace(/\s+/g, "_"),
          name: item.name.trim(),
          percent: Number(item.percent) || 0,
          fixed: Number(item.fixed) || 0
        }))
        .filter((item) => item.name)
    };

    const result = await saveOrderFeeConfig(clean);
    setStatus(result.message);
    setSaving(false);

    if (result.ok) {
      setForm(cloneConfig(clean));
    }
  }

  function reset() {
    setForm(cloneConfig(DEFAULT_ORDER_FEE_CONFIG));
    setStatus("Padrao carregado. Clique em salvar para enviar ao Supabase.");
  }

  return (
    <section className="page settings-page">
      <div className="section-head">
        <h2>Configuracoes</h2>
        <p className="page-text">Taxas padrao e regras por marketplace salvas no Supabase.</p>
      </div>

      {loading ? (
        <div className="loading-indicator centered" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Carregando configuracoes...</span>
        </div>
      ) : (
        <>
          <div className="form-grid two-col">
            <label className="field">
              <span>Taxa padrao (%)</span>
              <input
                type="number"
                step="0.01"
                value={form.default.percent}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    default: { ...prev.default, percent: Number(e.target.value) || 0 }
                  }))
                }
              />
            </label>

            <label className="field">
              <span>Taxa fixa padrao (R$)</span>
              <input
                type="number"
                step="0.01"
                value={form.default.fixed}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    default: { ...prev.default, fixed: Number(e.target.value) || 0 }
                  }))
                }
              />
            </label>
          </div>

          <div className="soft-panel">
            <div className="section-head row-between">
              <p>Regras por marketplace</p>
              <button className="ghost-btn" type="button" onClick={addOverride}>
                + Adicionar
              </button>
            </div>

            <div className="table-wrap">
              <table className="table clean">
                <thead>
                  <tr>
                    <th>Marketplace</th>
                    <th>%</th>
                    <th>Fixo (R$)</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {form.overrides.map((item, index) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          value={item.name}
                          onChange={(e) => updateOverride(index, "name", e.target.value)}
                          placeholder="Ex: Shopee"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={item.percent}
                          onChange={(e) => updateOverride(index, "percent", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={item.fixed}
                          onChange={(e) => updateOverride(index, "fixed", e.target.value)}
                        />
                      </td>
                      <td>
                        <button className="danger-btn" type="button" onClick={() => removeOverride(index)}>
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="actions-row">
            <button className="ghost-btn" type="button" onClick={reset}>
              Restaurar padrao
            </button>
            <button className="primary-btn" type="button" onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar no Supabase"}
            </button>
          </div>

          {status && <p className="page-text">{status}</p>}
        </>
      )}
    </section>
  );
}
