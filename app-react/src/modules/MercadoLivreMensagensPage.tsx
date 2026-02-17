import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const DEFAULT_TEMPLATE =
  "Ola! Obrigado pela compra. Para iniciar a personalizacao, envie: nome/texto, tema/cores e detalhes do pedido.";

function templateSettingId(userId: string) {
  return `ml_customization_template_${userId}`;
}

export function MercadoLivreMensagensPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [status, setStatus] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      if (!supabase) {
        setStatus("Supabase nao configurado.");
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id || null;
      setUserId(uid);
      if (!uid) {
        setStatus("Usuario nao autenticado.");
        setLoading(false);
        return;
      }

      const { data: row } = await supabase
        .from("app_settings")
        .select("config_data")
        .eq("id", templateSettingId(uid))
        .maybeSingle();

      const saved = String((row?.config_data as { template?: string } | null)?.template || "").trim();
      if (saved) {
        setTemplate(saved);
      }
      setLoading(false);
    }

    void run();
  }, []);

  async function saveTemplate() {
    if (!supabase || !userId) return;
    setSaving(true);
    setStatus(null);
    const clean = template.trim() || DEFAULT_TEMPLATE;

    const { error } = await supabase.from("app_settings").upsert({
      id: templateSettingId(userId),
      config_data: {
        template: clean,
        updated_at: new Date().toISOString()
      }
    });

    setSaving(false);
    if (error) {
      setStatus(`Erro ao salvar: ${error.message}`);
      return;
    }
    setTemplate(clean);
    setStatus("Mensagem padrao salva com sucesso.");
  }

  return (
    <section className="page">
      <div className="section-head">
        <h2>Mensagens Mercado Livre</h2>
        <p className="page-text">Defina o texto padrao enviado ao comprador para coletar dados da personalizacao.</p>
      </div>

      {loading && (
        <div className="loading-indicator centered" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Carregando configuracao de mensagens...</span>
        </div>
      )}

      {!loading && (
        <div className="soft-panel">
          <label className="field">
            <span>Mensagem padrao de personalizacao</span>
            <textarea
              rows={6}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder={DEFAULT_TEMPLATE}
            />
          </label>

          <div className="actions-row">
            <button type="button" className="ghost-btn" onClick={() => setTemplate(DEFAULT_TEMPLATE)}>
              Restaurar padrao
            </button>
            <button type="button" className="primary-btn" onClick={() => void saveTemplate()} disabled={saving}>
              {saving ? "Salvando..." : "Salvar mensagem"}
            </button>
          </div>
          {status && <p className="page-text">{status}</p>}
        </div>
      )}
    </section>
  );
}
