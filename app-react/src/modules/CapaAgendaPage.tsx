import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type AgendaTab = "todo" | "printed";

type CapaAgendaItem = {
  id: string;
  orderId: string;
  frontImage: string;
  backImage: string;
  printed: boolean;
  createdAt: string;
  printedAt?: string;
};

type CapaAgendaDbRow = {
  id: string;
  user_id: string;
  order_id: string;
  front_image: string;
  back_image: string;
  printed: boolean;
  created_at: string;
  printed_at: string | null;
  updated_at: string;
};

function mapRowToItem(row: CapaAgendaDbRow): CapaAgendaItem {
  return {
    id: row.id,
    orderId: row.order_id,
    frontImage: row.front_image,
    backImage: row.back_image,
    printed: row.printed,
    createdAt: row.created_at,
    printedAt: row.printed_at || undefined
  };
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openPdfForItems(items: CapaAgendaItem[]) {
  if (!items.length) return;
  const popup = window.open("", "_blank", "width=1100,height=900");
  if (!popup) return;

  const pages = items
    .flatMap((item) => {
      const blocks: string[] = [];
      if (item.frontImage) {
        blocks.push(`
          <section class="sheet-page">
            <header>Pedido #${item.orderId || "-"} • Capa Frente</header>
            <div class="cover-wrap"><img src="${item.frontImage}" alt="Capa frente" /></div>
          </section>
        `);
      }
      if (item.backImage) {
        blocks.push(`
          <section class="sheet-page">
            <header>Pedido #${item.orderId || "-"} • Capa Verso</header>
            <div class="cover-wrap"><img src="${item.backImage}" alt="Capa verso" /></div>
          </section>
        `);
      }
      return blocks;
    })
    .join("");

  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Capa Agenda - PDF</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #0f172a; }
          .sheet-page {
            width: 100%;
            min-height: 277mm;
            display: grid;
            grid-template-rows: auto 1fr;
            gap: 5mm;
            page-break-after: always;
          }
          .sheet-page:last-child { page-break-after: auto; }
          .sheet-page header {
            font-size: 10pt;
            font-weight: 700;
            color: #334155;
          }
          .cover-wrap {
            width: 175mm;
            height: 245mm;
            border: 0.3mm dashed #cbd5e1;
            display: grid;
            place-items: center;
            overflow: hidden;
            background: #fff;
          }
          .cover-wrap img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
            background: #fff;
          }
        </style>
      </head>
      <body>
        ${pages}
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);

  popup.document.close();
}

export function CapaAgendaPage() {
  const [items, setItems] = useState<CapaAgendaItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingInit, setLoadingInit] = useState(true);
  const [tab, setTab] = useState<AgendaTab>("todo");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [frontImage, setFrontImage] = useState("");
  const [backImage, setBackImage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadItems(uid: string) {
    if (!supabase) return;

    const { data, error: loadError } = await supabase
      .from("capa_agenda_items")
      .select("*")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(2000);

    if (loadError) throw new Error(loadError.message);
    setItems(((data || []) as CapaAgendaDbRow[]).map(mapRowToItem));
  }

  useEffect(() => {
    async function run() {
      if (!supabase) {
        setError("Supabase nao configurado.");
        setLoadingInit(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setError(`Falha ao validar usuario: ${authError.message}`);
        setLoadingInit(false);
        return;
      }

      const uid = authData.user?.id || null;
      setUserId(uid);
      if (!uid) {
        setError("Usuario nao autenticado.");
        setLoadingInit(false);
        return;
      }

      try {
        await loadItems(uid);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Falha ao carregar capas.";
        setError(message);
      } finally {
        setLoadingInit(false);
      }
    }

    void run();
  }, []);

  const filtered = useMemo(
    () => items.filter((item) => (tab === "printed" ? item.printed : !item.printed)),
    [items, tab]
  );
  const selectedItems = useMemo(() => filtered.filter((item) => selectedIds.includes(item.id)), [filtered, selectedIds]);
  const allSelected = filtered.length > 0 && selectedItems.length === filtered.length;

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => filtered.some((item) => item.id === id)));
  }, [filtered]);

  async function onPickFront(file: File | null) {
    if (!file) return;
    const dataUrl = await toDataUrl(file);
    setFrontImage(dataUrl);
  }

  async function onPickBack(file: File | null) {
    if (!file) return;
    const dataUrl = await toDataUrl(file);
    setBackImage(dataUrl);
  }

  function resetForm() {
    setOrderId("");
    setFrontImage("");
    setBackImage("");
  }

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setStatus(null);
    resetForm();
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!supabase || !userId) {
      setError("Usuario nao autenticado.");
      return;
    }

    if (!orderId.trim()) {
      setError("Informe o ID do pedido.");
      return;
    }

    if (!frontImage || !backImage) {
      setError("Envie capa frente e capa verso.");
      return;
    }

    const nowIso = new Date().toISOString();
    const payload = {
      user_id: userId,
      order_id: orderId.trim(),
      front_image: frontImage,
      back_image: backImage,
      printed: false,
      printed_at: null,
      updated_at: nowIso
    };

    const { data, error: insertError } = await supabase.from("capa_agenda_items").insert(payload).select("*").single();
    if (insertError) {
      setError(`Nao foi possivel salvar no Supabase: ${insertError.message}`);
      return;
    }

    setItems((prev) => [mapRowToItem(data as CapaAgendaDbRow), ...prev]);
    setStatus("Capa adicionada e salva no Supabase.");
    resetForm();
    setModalOpen(false);
  }

  async function togglePrinted(item: CapaAgendaItem) {
    if (!supabase || !userId) {
      setError("Usuario nao autenticado.");
      return;
    }

    const nextPrinted = !item.printed;
    const printedAt = nextPrinted ? new Date().toISOString() : null;

    const { error: updateError } = await supabase
      .from("capa_agenda_items")
      .update({
        printed: nextPrinted,
        printed_at: printedAt,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .eq("id", item.id);

    if (updateError) {
      setError(`Nao foi possivel atualizar no Supabase: ${updateError.message}`);
      return;
    }

    setItems((prev) =>
      prev.map((row) =>
        row.id === item.id
          ? {
              ...row,
              printed: nextPrinted,
              printedAt: printedAt || undefined
            }
          : row
      )
    );
  }

  async function removeItem(itemId: string) {
    if (!supabase || !userId) {
      setError("Usuario nao autenticado.");
      return;
    }

    const confirmDelete = window.confirm("Excluir esta capa de agenda?");
    if (!confirmDelete) return;

    const { error: deleteError } = await supabase
      .from("capa_agenda_items")
      .delete()
      .eq("user_id", userId)
      .eq("id", itemId);

    if (deleteError) {
      setError(`Nao foi possivel excluir no Supabase: ${deleteError.message}`);
      return;
    }

    setItems((prev) => prev.filter((row) => row.id !== itemId));
    setSelectedIds((prev) => prev.filter((id) => id !== itemId));
  }

  function toggleSelected(itemId: string) {
    setSelectedIds((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]));
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(filtered.map((item) => item.id));
  }

  return (
    <section className="page capa-agenda-page">
      <div className="section-head row-between">
        <div>
          <h2>Capa Agenda</h2>
          <p className="page-text">Upload frente/verso por pedido e geracao de PDF em A4 vertical.</p>
        </div>
      </div>

      <div className="capa-agenda-top-actions">
        <button type="button" className="primary-btn" onClick={() => setModalOpen(true)}>
          + Nova capa
        </button>
        <button type="button" className="ghost-btn" onClick={toggleSelectAll} disabled={filtered.length === 0}>
          {allSelected ? "Limpar seleção" : "Selecionar tudo"}
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => openPdfForItems(selectedItems.length > 0 ? selectedItems : filtered)}
          disabled={filtered.length === 0}
        >
          Gerar PDF {selectedItems.length > 0 ? `(${selectedItems.length})` : ""}
        </button>
      </div>

      <div className="calendar-flow-tabs capa-agenda-tabs">
        <button className={tab === "todo" ? "tab-item active" : "tab-item"} type="button" onClick={() => setTab("todo")}>
          A fazer
        </button>
        <button className={tab === "printed" ? "tab-item active" : "tab-item"} type="button" onClick={() => setTab("printed")}>
          Impresso
        </button>
      </div>

      <div className="capa-agenda-grid">
        {loadingInit ? (
          <article className="capa-card empty">
            <p>Carregando capas...</p>
          </article>
        ) : filtered.length === 0 ? (
          <article className="capa-card empty">
            <p>Nenhuma capa nesta aba.</p>
          </article>
        ) : (
          filtered.map((item) => (
            <article key={item.id} className="capa-card">
              <header>
                <strong>
                  <label className="capa-select">
                    <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} />
                    <span>Pedido #{item.orderId}</span>
                  </label>
                </strong>
                <span>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</span>
              </header>
              <div className="capa-preview-grid">
                <figure>
                  <img src={item.frontImage} alt={`Capa frente ${item.orderId}`} />
                  <figcaption>Frente</figcaption>
                </figure>
                <figure>
                  <img src={item.backImage} alt={`Capa verso ${item.orderId}`} />
                  <figcaption>Verso</figcaption>
                </figure>
              </div>
              <div className="capa-actions">
                <button type="button" className="ghost-btn" onClick={() => openPdfForItems([item])}>
                  Gerar PDF
                </button>
                <button type="button" className={item.printed ? "ghost-btn" : "primary-btn"} onClick={() => void togglePrinted(item)}>
                  {item.printed ? "Voltar p/ A fazer" : "Marcar impresso"}
                </button>
                <button type="button" className="danger-btn" onClick={() => void removeItem(item.id)}>
                  Excluir
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {modalOpen && (
        <div className="assistant-modal-backdrop" onClick={closeModal}>
          <article className="assistant-modal capa-upload-modal" onClick={(e) => e.stopPropagation()}>
            <header className="assistant-modal-head capa-upload-head">
              <h3>🎨 Nova Capa Agenda</h3>
              <button type="button" onClick={closeModal}>Fechar</button>
            </header>

            <form className="capa-upload-form" onSubmit={(e) => void addItem(e)}>
              <div className="capa-upload-tip">
                <p>Adicione frente e verso no mesmo cadastro. O PDF sai em A4 vertical com capa 17,5 x 24,5 cm.</p>
              </div>

              <label className="field">
                <span>ID do pedido</span>
                <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Ex: 200001234567" />
              </label>

              <div className="capa-upload-row">
                <label className="field capa-upload-field">
                  <span>📘 Upload capa frente</span>
                  <input type="file" accept="image/*" onChange={(e) => void onPickFront(e.target.files?.[0] || null)} />
                </label>
                <label className="field capa-upload-field">
                  <span>📕 Upload capa verso</span>
                  <input type="file" accept="image/*" onChange={(e) => void onPickBack(e.target.files?.[0] || null)} />
                </label>
              </div>

              {(frontImage || backImage) && (
                <div className="capa-upload-preview">
                  {frontImage ? <img src={frontImage} alt="Preview frente" /> : <div className="empty">Frente</div>}
                  {backImage ? <img src={backImage} alt="Preview verso" /> : <div className="empty">Verso</div>}
                </div>
              )}

              {error && <p className="error-text">{error}</p>}
              {status && <p className="page-text">{status}</p>}

              <div className="capa-upload-actions">
                <button type="button" className="ghost-btn" onClick={closeModal}>Cancelar</button>
                <button type="submit" className="primary-btn">Salvar capa</button>
              </div>
            </form>
          </article>
        </div>
      )}
    </section>
  );
}
