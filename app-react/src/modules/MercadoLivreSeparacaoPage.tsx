import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type SheetJsModule = {
  read: (data: ArrayBuffer, options: { type: "array" }) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (sheet: unknown, options: { header: 1; defval: string | number }) => unknown[][];
  };
};

type UploadRow = {
  rowId: string;
  platformOrderNumber: string;
  adName: string;
  sku: string;
  variation: string;
  imageUrl: string;
  buyerNotes: string;
  observations: string;
  productQty: number;
  recipientName: string;
  trackingNumber: string;
  raw: Record<string, unknown>;
};

type ShippingOrder = {
  id: string;
  user_id: string;
  platform_order_number: string;
  ad_name: string;
  variation: string | null;
  image_url: string | null;
  buyer_notes: string | null;
  observations: string | null;
  product_qty: number;
  recipient_name: string | null;
  tracking_number: string | null;
  source_file_name: string | null;
  import_key: string;
  row_raw: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function normalizeText(text?: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeTracking(text?: string) {
  return String(text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function valueAsNumber(value: unknown) {
  const raw = String(value ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function guessColumnIndex(headers: string[], aliases: string[]) {
  const normalizedHeaders = headers.map((h) => normalizeText(h));
  for (const alias of aliases) {
    const idx = normalizedHeaders.findIndex((h) => h.includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function toCell(row: unknown[], idx: number) {
  if (idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

function buildImportKey(row: UploadRow) {
  const joined = [
    normalizeText(row.platformOrderNumber),
    normalizeText(row.adName),
    normalizeText(row.sku),
    normalizeText(row.variation),
    normalizeTracking(row.trackingNumber),
    normalizeText(row.recipientName)
  ].join("|");
  return joined || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadSheetJs(): Promise<SheetJsModule> {
  const remoteUrl = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";
  const mod = await import(/* @vite-ignore */ remoteUrl);
  return mod as unknown as SheetJsModule;
}

function parseRowsFromGrid(grid: unknown[][]): UploadRow[] {
  if (!grid.length) return [];

  const headerRow = (grid[0] || []).map((h) => String(h || "").trim());

  const idxOrderNumber = guessColumnIndex(headerRow, [
    "n de pedido da plataforma",
    "no de pedido da plataforma",
    "numero do pedido da plataforma",
    "n do pedido",
    "pedido"
  ]);
  const idxAdName = guessColumnIndex(headerRow, ["nome do anuncio", "titulo", "anuncio"]);
  const idxSku = guessColumnIndex(headerRow, ["sku", "seller sku", "sku do vendedor", "codigo sku", "codigo"]);
  const idxVariation = guessColumnIndex(headerRow, ["variacao", "variação"]);
  const idxImage = guessColumnIndex(headerRow, ["link da imagem", "imagem", "image", "foto"]);
  const idxBuyerNotes = guessColumnIndex(headerRow, ["notas do comprador", "nota do comprador", "mensagem"]);
  const idxObs = guessColumnIndex(headerRow, ["observacoes", "observações", "observacao", "observação"]);
  const idxQty = guessColumnIndex(headerRow, ["qtd. do produto", "qtd do produto", "quantidade", "qty"]);
  const idxRecipient = guessColumnIndex(headerRow, ["nome do destinatario", "destinatario", "destinatário"]);
  const idxTracking = guessColumnIndex(headerRow, ["n de rastreio", "numero de rastreio", "rastreio", "tracking"]);

  if (idxOrderNumber < 0 || idxAdName < 0 || idxQty < 0) {
    throw new Error(
      "Colunas obrigatorias nao encontradas. Necessario: N de Pedido da Plataforma, Nome do Anuncio e Qtd. do Produto."
    );
  }

  const rows: UploadRow[] = [];

  for (let i = 1; i < grid.length; i += 1) {
    const row = grid[i] || [];
    const platformOrderNumber = toCell(row, idxOrderNumber);
    const adName = toCell(row, idxAdName);
    const trackingNumber = toCell(row, idxTracking);

    if (!platformOrderNumber && !adName && !trackingNumber) continue;

    rows.push({
      rowId: `${i}-${Math.random().toString(36).slice(2, 8)}`,
      platformOrderNumber,
      adName,
      sku: toCell(row, idxSku),
      variation: toCell(row, idxVariation),
      imageUrl: toCell(row, idxImage),
      buyerNotes: toCell(row, idxBuyerNotes),
      observations: toCell(row, idxObs),
      productQty: Math.max(1, Math.floor(valueAsNumber(row[idxQty]) || 1)),
      recipientName: toCell(row, idxRecipient),
      trackingNumber,
      raw: {
        order: platformOrderNumber,
        ad_name: adName,
        sku: toCell(row, idxSku),
        variation: toCell(row, idxVariation),
        image_url: toCell(row, idxImage),
        buyer_notes: toCell(row, idxBuyerNotes),
        observations: toCell(row, idxObs),
        product_qty: Math.max(1, Math.floor(valueAsNumber(row[idxQty]) || 1)),
        recipient_name: toCell(row, idxRecipient),
        tracking: trackingNumber
      }
    });
  }

  return rows;
}

function extractUnitsPerOrderFromTitle(title?: string) {
  const text = String(title || "").trim();
  if (!text) return 1;

  const leadingQty = text.match(/^(\d{1,4})\b/);
  if (leadingQty?.[1]) {
    const qty = Number(leadingQty[1]);
    if (Number.isFinite(qty) && qty > 0) return qty;
  }

  const patternQty = text.match(/(?:c\s*\/\s*|kit\s+)(\d{1,4})\s*(?:und|un|u)?/i);
  if (patternQty?.[1]) {
    const qty = Number(patternQty[1]);
    if (Number.isFinite(qty) && qty > 0) return qty;
  }

  return 1;
}

function cleanAdNameForProduction(title?: string) {
  const raw = String(title || "").trim();
  if (!raw) return "Produto sem titulo";

  return raw
    .replace(/^\d{1,4}\s+/, "")
    .replace(/\s*[-–]\s*c\s*\/\s*\d+\s*(und|un|u)?\s*$/i, "")
    .replace(/\s*\(\s*c\s*\/\s*\d+\s*(und|un|u)?\s*\)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function safeRawValue(raw: Record<string, unknown> | null | undefined, key: string) {
  const value = raw && typeof raw === "object" ? raw[key] : null;
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function MercadoLivreSeparacaoPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingRows, setSavingRows] = useState(false);
  const [removingRows, setRemovingRows] = useState(false);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<UploadRow[]>([]);
  const [savedOrders, setSavedOrders] = useState<ShippingOrder[]>([]);
  const [trackingSearch, setTrackingSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<ShippingOrder | null>(null);
  const [scannerMode, setScannerMode] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [deletingFiltered, setDeletingFiltered] = useState(false);
  const trackingInputRef = useRef<HTMLInputElement | null>(null);

  async function loadSavedOrders(uid: string) {
    if (!supabase) return;
    const { data, error: loadError } = await supabase
      .from("ml_shipping_orders")
      .select("*")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(2000);

    if (loadError) {
      setError(`Erro ao carregar pedidos: ${loadError.message}`);
      return;
    }

    setSavedOrders((data || []) as ShippingOrder[]);
  }

  useEffect(() => {
    async function run() {
      if (!supabase) {
        setError("Supabase nao configurado.");
        setLoadingInit(false);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id || null;
      setUserId(uid);

      if (!uid) {
        setError("Usuario nao autenticado.");
        setLoadingInit(false);
        return;
      }

      await loadSavedOrders(uid);
      setLoadingInit(false);
    }

    void run();
  }, []);

  async function importFile(file: File | null) {
    if (!file) return;

    setLoadingFile(true);
    setError(null);
    setStatus(null);

    try {
      const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.type.includes("sheet");
      if (!isXlsx) {
        throw new Error("Arquivo invalido. Envie um arquivo .xlsx.");
      }

      const buffer = await file.arrayBuffer();
      const XLSX = await loadSheetJs();
      const wb = XLSX.read(buffer, { type: "array" });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) throw new Error("Arquivo sem planilha.");

      const firstSheet = wb.Sheets[firstSheetName];
      const grid = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
      const parsed = parseRowsFromGrid(grid);

      if (parsed.length === 0) throw new Error("Nenhum pedido valido encontrado na planilha.");

      setPreviewRows(parsed);
      setFileName(file.name);
      setStatus(`${parsed.length} pedidos lidos na planilha. Clique em salvar para gravar no sistema.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao importar arquivo.";
      setError(message);
      setPreviewRows([]);
      setFileName("");
    } finally {
      setLoadingFile(false);
    }
  }

  async function saveImportedRows() {
    if (!supabase || !userId) return;
    if (!previewRows.length) {
      setError("Importe um arquivo antes de salvar.");
      return;
    }

    setSavingRows(true);
    setError(null);
    setStatus(null);

    try {
      const payload = previewRows.map((row) => ({
        user_id: userId,
        platform_order_number: row.platformOrderNumber || null,
        ad_name: row.adName || "Produto sem titulo",
        variation: row.variation || null,
        image_url: row.imageUrl || null,
        buyer_notes: row.buyerNotes || null,
        observations: row.observations || null,
        product_qty: Math.max(1, Number(row.productQty) || 1),
        recipient_name: row.recipientName || null,
        tracking_number: row.trackingNumber || null,
        source_file_name: fileName || null,
        import_key: buildImportKey(row),
        row_raw: row.raw,
        updated_at: new Date().toISOString()
      }));

      const { error: saveError } = await supabase
        .from("ml_shipping_orders")
        .upsert(payload, { onConflict: "user_id,import_key" });

      if (saveError) throw new Error(saveError.message);

      await loadSavedOrders(userId);
      setStatus(`${payload.length} pedidos salvos/atualizados com sucesso.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao salvar pedidos.";
      setError(`Nao foi possivel salvar: ${message}`);
    } finally {
      setSavingRows(false);
    }
  }

  function clearImportedList() {
    setPreviewRows([]);
    setFileName("");
    setStatus("Lista importada descartada.");
    setError(null);
  }

  async function removeImportedRows() {
    if (!supabase || !userId) return;
    if (!previewRows.length) {
      setError("Importe um arquivo antes de remover a lista.");
      return;
    }

    const shouldDelete = window.confirm("Remover do sistema os pedidos desta lista importada?");
    if (!shouldDelete) return;

    setRemovingRows(true);
    setError(null);
    setStatus(null);

    try {
      const importKeys = previewRows.map((row) => buildImportKey(row));
      const { data: removedRows, error: removeError } = await supabase
        .from("ml_shipping_orders")
        .delete()
        .eq("user_id", userId)
        .in("import_key", importKeys)
        .select("id");

      if (removeError) throw new Error(removeError.message);

      await loadSavedOrders(userId);
      const removedCount = Array.isArray(removedRows) ? removedRows.length : 0;
      setStatus(`${removedCount} pedido(s) removido(s) do sistema para esta lista.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao remover pedidos.";
      setError(`Nao foi possivel remover: ${message}`);
    } finally {
      setRemovingRows(false);
    }
  }

  async function deleteSavedOrder(row: ShippingOrder) {
    if (!supabase || !userId) return;

    const label = row.platform_order_number || row.tracking_number || row.id;
    const shouldDelete = window.confirm(`Excluir o pedido ${label} salvo no sistema?`);
    if (!shouldDelete) return;

    setDeletingOrderId(row.id);
    setError(null);
    setStatus(null);

    try {
      const { error: removeError } = await supabase
        .from("ml_shipping_orders")
        .delete()
        .eq("user_id", userId)
        .eq("id", row.id);

      if (removeError) throw new Error(removeError.message);

      setSavedOrders((prev) => prev.filter((item) => item.id !== row.id));
      if (selectedOrder?.id === row.id) setSelectedOrder(null);
      setStatus("Pedido removido com sucesso.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao excluir pedido.";
      setError(`Nao foi possivel excluir: ${message}`);
    } finally {
      setDeletingOrderId(null);
    }
  }

  async function deleteFilteredOrders() {
    if (!supabase || !userId) return;
    if (!filteredByTracking.length) {
      setError("Nenhum pedido filtrado para excluir.");
      return;
    }

    const shouldDelete = window.confirm(
      `Excluir ${filteredByTracking.length} pedido(s) filtrado(s) salvo(s) no sistema?`
    );
    if (!shouldDelete) return;

    setDeletingFiltered(true);
    setError(null);
    setStatus(null);

    try {
      const ids = filteredByTracking.map((row) => row.id);
      const chunkSize = 400;
      let removedTotal = 0;

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error: removeError } = await supabase
          .from("ml_shipping_orders")
          .delete()
          .eq("user_id", userId)
          .in("id", chunk)
          .select("id");

        if (removeError) throw new Error(removeError.message);
        removedTotal += Array.isArray(data) ? data.length : 0;
      }

      const deletedSet = new Set(ids);
      setSavedOrders((prev) => prev.filter((row) => !deletedSet.has(row.id)));
      if (selectedOrder && deletedSet.has(selectedOrder.id)) setSelectedOrder(null);
      setStatus(`${removedTotal} pedido(s) excluido(s) do sistema.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao excluir pedidos filtrados.";
      setError(`Nao foi possivel excluir filtrados: ${message}`);
    } finally {
      setDeletingFiltered(false);
    }
  }

  const filteredByTracking = useMemo(() => {
    const key = normalizeTracking(trackingSearch);
    if (!key) return savedOrders.slice(0, 30);
    return savedOrders.filter((row) => normalizeTracking(row.tracking_number || "").includes(key));
  }, [savedOrders, trackingSearch]);

  function openByTrackingValue(rawValue: string) {
    const normalized = normalizeTracking(rawValue);
    if (!normalized) return;

    const exact =
      savedOrders.find((row) => normalizeTracking(row.tracking_number || "") === normalized) ||
      null;
    const firstContains =
      savedOrders.find((row) => normalizeTracking(row.tracking_number || "").includes(normalized)) ||
      null;
    const target = exact || firstContains;

    if (!target) {
      setScanStatus(`Rastreio ${normalized} nao encontrado.`);
      return;
    }

    setScanStatus(`Pedido encontrado: ${target.platform_order_number || "-"}`);
    setSelectedOrder(target);
    if (navigator.vibrate) navigator.vibrate(70);
  }

  useEffect(() => {
    if (!scannerMode) return;
    const timer = setInterval(() => {
      if (!selectedOrder && document.visibilityState === "visible") {
        trackingInputRef.current?.focus();
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [scannerMode, selectedOrder]);

  const stats = useMemo(() => {
    const uniqueTrackings = new Set(
      savedOrders
        .map((row) => normalizeTracking(row.tracking_number || ""))
        .filter(Boolean)
    );

    const totalQty = savedOrders.reduce((acc, row) => acc + (Number(row.product_qty) || 0), 0);

    return {
      totalOrders: savedOrders.length,
      totalTrackings: uniqueTrackings.size,
      totalQty
    };
  }, [savedOrders]);

  const productionRows = useMemo(() => {
    const source =
      previewRows.length > 0
        ? previewRows.map((row) => ({
            adName: row.adName,
            sku: row.sku,
            imageUrl: row.imageUrl,
            productQty: Math.max(1, Number(row.productQty) || 1)
          }))
        : savedOrders.map((row) => ({
            adName: row.ad_name || "",
            sku: safeRawValue(row.row_raw, "sku"),
            imageUrl: row.image_url || safeRawValue(row.row_raw, "image_url"),
            productQty: Math.max(1, Number(row.product_qty) || 1)
          }));

    const grouped = new Map<
      string,
      {
        key: string;
        info: string;
        sku: string;
        imageUrl: string;
        unitsPerAd: number;
        cartQty: number;
        totalProduce: number;
        ordersCount: number;
      }
    >();

    for (const row of source) {
      const unitsPerAd = extractUnitsPerOrderFromTitle(row.adName);
      const info = cleanAdNameForProduction(row.adName);
      const sku = row.sku || "-";
      const key = `${normalizeText(info)}|${normalizeText(sku)}|${unitsPerAd}`;

      const current = grouped.get(key) || {
        key,
        info,
        sku,
        imageUrl: row.imageUrl || "",
        unitsPerAd,
        cartQty: 0,
        totalProduce: 0,
        ordersCount: 0
      };

      current.cartQty += Math.max(1, Number(row.productQty) || 1);
      current.totalProduce += Math.max(1, Number(row.productQty) || 1) * unitsPerAd;
      current.ordersCount += 1;
      if (!current.imageUrl && row.imageUrl) current.imageUrl = row.imageUrl;
      grouped.set(key, current);
    }

    return [...grouped.values()].sort((a, b) => b.totalProduce - a.totalProduce);
  }, [previewRows, savedOrders]);

  return (
    <section className="page">
      <div className="section-head row-between">
        <div>
          <h2>Separacao de Pedido</h2>
          <p className="page-text">
            Importe pedidos em .xlsx, organize por rastreio e consulte dados rapidamente para envio e conferencia.
          </p>
        </div>
      </div>

      <div className="ml-kpi-grid ml-production-kpis">
        <article className="kpi-card">
          <p>Pedidos salvos</p>
          <strong>{stats.totalOrders}</strong>
          <span>Base de pedidos para expedicao</span>
        </article>
        <article className="kpi-card">
          <p>Rastreios unicos</p>
          <strong>{stats.totalTrackings}</strong>
          <span>Codigos prontos para busca</span>
        </article>
        <article className="kpi-card">
          <p>Qtd total de produtos</p>
          <strong>{stats.totalQty}</strong>
          <span>Soma da coluna Qtd. do Produto</span>
        </article>
        <article className="kpi-card">
          <p>Ultima importacao</p>
          <strong>{fileName ? "Pronta" : "-"}</strong>
          <span>{fileName || "Nenhum arquivo importado"}</span>
        </article>
      </div>

      <div className="soft-panel ml-upload-panel">
        <p>Menu Separacao de Pedido</p>
        <div className="ml-upload-row">
          <label className="primary-btn" style={{ cursor: "pointer" }}>
            {loadingFile ? "Importando..." : "Selecionar arquivo .xlsx"}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void importFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
              disabled={loadingFile || loadingInit}
            />
          </label>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void saveImportedRows()}
            disabled={!previewRows.length || savingRows || removingRows || loadingInit}
          >
            {savingRows ? "Salvando..." : "Salvar pedidos no sistema"}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void removeImportedRows()}
            disabled={!previewRows.length || savingRows || removingRows || loadingInit}
          >
            {removingRows ? "Removendo..." : "Remover lista do sistema"}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={clearImportedList}
            disabled={!previewRows.length || savingRows || removingRows || loadingInit}
          >
            Descartar lista
          </button>
          {fileName && <span className="page-text">Arquivo: {fileName}</span>}
        </div>
        <span className="page-text">
          Campos importados: N de Pedido da Plataforma, Nome do Anuncio, SKU, Variacao, Link da Imagem, Notas do Comprador,
          Observacoes, Qtd. do Produto, Nome do Destinatario e N de Rastreio (quando existir).
        </span>
        {status && <p className="page-text">{status}</p>}
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="ml-orders-table-wrap">
        <div className="ml-orders-head">
          <h3>Separacao de producao</h3>
          <span>{productionRows.length} grupo(s)</span>
        </div>
        <div className="table-wrap">
          <table className="table clean ml-shipping-table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Informacao</th>
                <th>SKU</th>
                <th>Und por anuncio</th>
                <th>Qtd carrinho</th>
                <th>Total produzir</th>
                <th>Pedidos</th>
              </tr>
            </thead>
            <tbody>
              {productionRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>Sem dados para separar producao.</td>
                </tr>
              ) : (
                productionRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      {row.imageUrl ? (
                        <img
                          className="ml-thumb"
                          src={String(row.imageUrl).replace(/^http:\/\//i, "https://")}
                          alt={row.info}
                          loading="lazy"
                          onError={(e) => {
                            const img = e.currentTarget;
                            img.style.display = "none";
                            const fallback = img.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = "inline-flex";
                          }}
                        />
                      ) : null}
                      <span className="ml-thumb-fallback" style={{ display: row.imageUrl ? "none" : "inline-flex" }}>
                        📦
                      </span>
                    </td>
                    <td className="ml-col-title">{row.info}</td>
                    <td>{row.sku}</td>
                    <td>{row.unitsPerAd}</td>
                    <td>{row.cartQty}</td>
                    <td>
                      <strong>{row.totalProduce}</strong>
                    </td>
                    <td>{row.ordersCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="page-text" style={{ marginTop: "0.55rem" }}>
          Regra de quantidade por pedido: quando o titulo comeca com numero (ex.: 35 Lembrancinhas...), esse numero vira
          as unidades por anuncio para calcular o total de producao.
        </p>
      </div>

      <div className="ml-orders-table-wrap">
        <div className="ml-orders-head">
          <h3>Buscar por N de Rastreio</h3>
          <span>{filteredByTracking.length} resultado(s)</span>
        </div>

        <div className="ml-upload-row" style={{ marginBottom: "0.9rem" }}>
          <button
            type="button"
            className={scannerMode ? "primary-btn" : "ghost-btn"}
            onClick={() => {
              setScannerMode((prev) => !prev);
              setScanStatus(null);
              setTimeout(() => trackingInputRef.current?.focus(), 30);
            }}
          >
            {scannerMode ? "Scanner Android: Ativo" : "Ativar scanner Android"}
          </button>
          {scannerMode && (
            <span className="scan-live-indicator">
              <i /> Leitura continua habilitada
            </span>
          )}
        </div>

        <div className="ml-upload-row" style={{ marginBottom: "0.9rem" }}>
          <label className="field" style={{ maxWidth: 360, marginBottom: 0 }}>
            <span>Rastreio</span>
            <input
              ref={trackingInputRef}
              placeholder="Digite ou escaneie o rastreio..."
              value={trackingSearch}
              inputMode="search"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              onChange={(e) => setTrackingSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  openByTrackingValue(trackingSearch);
                  setTrackingSearch("");
                }
              }}
            />
          </label>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => openByTrackingValue(trackingSearch)}
            disabled={!normalizeTracking(trackingSearch)}
          >
            Buscar agora
          </button>
          {scannerMode && (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setTrackingSearch("");
                setScanStatus(null);
                trackingInputRef.current?.focus();
              }}
            >
              Limpar
            </button>
          )}
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void deleteFilteredOrders()}
            disabled={deletingFiltered || loadingInit || filteredByTracking.length === 0}
          >
            {deletingFiltered ? "Excluindo filtrados..." : "Excluir filtrados"}
          </button>
        </div>
        {scanStatus && <p className="page-text">{scanStatus}</p>}

        <div className="table-wrap">
          <table className="table clean ml-shipping-table">
            <thead>
              <tr>
                <th>Rastreio</th>
                <th>Pedido</th>
                <th>Destinatario</th>
                <th>Anuncio</th>
                <th>Qtd</th>
                <th>Atualizado</th>
                <th>Detalhes</th>
                <th>Excluir</th>
              </tr>
            </thead>
            <tbody>
              {loadingInit ? (
                <tr>
                  <td colSpan={8}>Carregando pedidos...</td>
                </tr>
              ) : filteredByTracking.length === 0 ? (
                <tr>
                  <td colSpan={8}>Nenhum pedido encontrado.</td>
                </tr>
              ) : (
                filteredByTracking.slice(0, 200).map((row) => (
                  <tr key={row.id}>
                    <td className="ml-col-order-id">{row.tracking_number || "-"}</td>
                    <td className="ml-col-order-id">{row.platform_order_number || "-"}</td>
                    <td>{row.recipient_name || "-"}</td>
                    <td className="ml-col-title">{row.ad_name || "-"}</td>
                    <td>{row.product_qty || 1}</td>
                    <td>{formatDate(row.updated_at)}</td>
                    <td>
                      <button type="button" className="ghost-btn" onClick={() => setSelectedOrder(row)}>
                        Visualizar
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => void deleteSavedOrder(row)}
                        disabled={deletingOrderId === row.id}
                      >
                        {deletingOrderId === row.id ? "Excluindo..." : "Excluir"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ml-orders-table-wrap">
        <div className="ml-orders-head">
          <h3>Pre-visualizacao do arquivo importado</h3>
          <span>{previewRows.length} linha(s)</span>
        </div>
        <div className="table-wrap">
          <table className="table clean ml-shipping-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Anuncio</th>
                <th>SKU</th>
                <th>Variacao</th>
                <th>Qtd</th>
                <th>Destinatario</th>
                <th>Rastreio</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>Sem linhas carregadas.</td>
                </tr>
              ) : (
                previewRows.map((row) => (
                  <tr key={row.rowId}>
                    <td className="ml-col-order-id">{row.platformOrderNumber || "-"}</td>
                    <td className="ml-col-title">{row.adName || "-"}</td>
                    <td>{row.sku || "-"}</td>
                    <td>{row.variation || "-"}</td>
                    <td>{row.productQty}</td>
                    <td>{row.recipientName || "-"}</td>
                    <td className="ml-col-order-id">{row.trackingNumber || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <div className="assistant-modal-backdrop" onClick={() => setSelectedOrder(null)}>
          <article className="assistant-modal ml-shipping-modal" onClick={(e) => e.stopPropagation()}>
            <header className="assistant-modal-head">
              <h3>Detalhes do pedido</h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedOrder(null);
                  if (scannerMode) setTimeout(() => trackingInputRef.current?.focus(), 30);
                }}
              >
                Fechar
              </button>
            </header>

            <div className="ml-shipping-modal-grid">
              <div>
                {selectedOrder.image_url ? (
                  <img
                    src={selectedOrder.image_url}
                    alt={selectedOrder.ad_name || "Imagem do pedido"}
                    className="ml-shipping-image"
                  />
                ) : (
                  <div className="ml-shipping-image empty">Sem imagem</div>
                )}
              </div>

              <div className="ml-shipping-detail-list">
                <p><strong>Pedido:</strong> {selectedOrder.platform_order_number || "-"}</p>
                <p><strong>Rastreio:</strong> {selectedOrder.tracking_number || "-"}</p>
                <p><strong>Destinatario:</strong> {selectedOrder.recipient_name || "-"}</p>
                <p><strong>Anuncio:</strong> {selectedOrder.ad_name || "-"}</p>
                <p><strong>Variacao:</strong> {selectedOrder.variation || "-"}</p>
                <p><strong>Quantidade:</strong> {selectedOrder.product_qty || 1}</p>
                <p><strong>Notas do comprador:</strong> {selectedOrder.buyer_notes || "-"}</p>
                <p><strong>Observacoes:</strong> {selectedOrder.observations || "-"}</p>
              </div>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
