import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type SeparacaoView = "all" | "importacao" | "calendario" | "producao" | "pedidos";

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
  shippingDeadline: string;
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

function isOrderPacked(row: ShippingOrder | null | undefined) {
  const packed = row?.row_raw && typeof row.row_raw === "object" ? row.row_raw.packed : null;
  return packed === true;
}

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

function guessShippingDeadlineColumnIndex(headers: string[]) {
  const normalizedHeaders = headers.map((h) => normalizeText(h));

  // Prioriza cabeçalhos específicos e evita colisões com colunas genéricas de envio.
  const directAliases = [
    "prazo de envio",
    "prazo para envio",
    "prazo envio",
    "data de envio",
    "data para envio",
    "data limite de envio",
    "shipping deadline"
  ];

  for (const alias of directAliases) {
    const idx = normalizedHeaders.findIndex((h) => h.includes(alias));
    if (idx >= 0) return idx;
  }

  // Fallback: qualquer coluna que contenha "prazo"+"envio" ou "data"+"envio".
  const byPattern = normalizedHeaders.findIndex(
    (h) => (h.includes("prazo") && h.includes("envio")) || (h.includes("data") && h.includes("envio"))
  );
  if (byPattern >= 0) return byPattern;

  return -1;
}

function toCell(row: unknown[], idx: number) {
  if (idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

function toYmd(year: number, month: number, day: number) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function normalizeDateToYmd(value: unknown): string {
  if (value == null) return "";

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000 && value < 90000) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const utcMs = excelEpoch + Math.round(value) * 24 * 60 * 60 * 1000;
      const d = new Date(utcMs);
      return toYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return "";
  }

  const raw = String(value || "").trim();
  if (!raw) return "";

  const ymd = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) return toYmd(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const dmy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return toYmd(year, month, day);
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return toYmd(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
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
  const idxShippingDeadline = guessShippingDeadlineColumnIndex(headerRow);

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
    const shippingDeadline = normalizeDateToYmd(row[idxShippingDeadline]);

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
      shippingDeadline,
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
        tracking: trackingNumber,
        shipping_deadline: shippingDeadline || null
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

function formatDateOnly(value?: string) {
  const ymd = normalizeDateToYmd(value || "");
  if (!ymd) return "-";
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

function shippingDateFromRaw(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object") return "";
  const candidates = [
    raw.shipping_deadline,
    raw.prazo_de_envio,
    raw.prazo_envio,
    raw.data_de_envio,
    raw.data_envio
  ];
  for (const value of candidates) {
    const ymd = normalizeDateToYmd(value);
    if (ymd) return ymd;
  }
  return "";
}

export function MercadoLivreSeparacaoPage(props?: { view?: SeparacaoView }) {
  const view = props?.view || "all";
  const todayYmd = toYmd(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    new Date().getDate()
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingRows, setSavingRows] = useState(false);
  const [updatingShippingDates, setUpdatingShippingDates] = useState(false);
  const [removingRows, setRemovingRows] = useState(false);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<UploadRow[]>([]);
  const [savedOrders, setSavedOrders] = useState<ShippingOrder[]>([]);
  const [trackingSearch, setTrackingSearch] = useState("");
  const [shippingDateFilter, setShippingDateFilter] = useState(todayYmd);
  const [listShippingDate, setListShippingDate] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<ShippingOrder | null>(null);
  const [showPackedOrdersModal, setShowPackedOrdersModal] = useState(false);
  const [showUnpackedOrdersModal, setShowUnpackedOrdersModal] = useState(false);
  const [scannerMode, setScannerMode] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [deletingFiltered, setDeletingFiltered] = useState(false);
  const [packingOrderId, setPackingOrderId] = useState<string | null>(null);
  const [unpackingOrderId, setUnpackingOrderId] = useState<string | null>(null);
  const [webCameraEnabled, setWebCameraEnabled] = useState(false);
  const [fullScreenScanner, setFullScreenScanner] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const trackingInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraTimerRef = useRef<number | null>(null);

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
      const fileDate = parsed.find((row) => row.shippingDeadline)?.shippingDeadline || "";
      if (fileDate) setListShippingDate(fileDate);
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
      const fallbackListDate = normalizeDateToYmd(listShippingDate);
      const preparedRows = previewRows.map((row) => {
        const importKey = buildImportKey(row);
        const shippingDeadline = normalizeDateToYmd(row.shippingDeadline) || fallbackListDate;
        const nextRaw = { ...(row.raw || {}) };
        if (shippingDeadline) nextRaw.shipping_deadline = shippingDeadline;

        return {
          importKey,
          shippingDeadline,
          db: {
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
            import_key: importKey,
            row_raw: nextRaw,
            updated_at: new Date().toISOString()
          }
        };
      });
      const payload = preparedRows.map((row) => row.db);

      const keys = payload.map((row) => row.import_key);
      const existingKeys = new Set<string>();
      const chunkSize = 400;

      for (let i = 0; i < keys.length; i += chunkSize) {
        const chunk = keys.slice(i, i + chunkSize);
        const { data: existingRows, error: existingError } = await supabase
          .from("ml_shipping_orders")
          .select("import_key")
          .eq("user_id", userId)
          .in("import_key", chunk);

        if (existingError) throw new Error(existingError.message);
        for (const row of existingRows || []) {
          const key = typeof row.import_key === "string" ? row.import_key : "";
          if (key) existingKeys.add(key);
        }
      }

      const onlyNewRows = payload.filter((row) => !existingKeys.has(row.import_key));

      if (onlyNewRows.length > 0) {
        const { error: saveError } = await supabase.from("ml_shipping_orders").insert(onlyNewRows);
        if (saveError) throw new Error(saveError.message);
      }

      await loadSavedOrders(userId);
      const ignoredCount = payload.length - onlyNewRows.length;
      setStatus(
        `${onlyNewRows.length} etiqueta(s) nova(s) importada(s). ` +
          `${Math.max(0, ignoredCount)} etiqueta(s) ja existia(m) e foi(ram) ignorada(s).`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao salvar pedidos.";
      setError(`Nao foi possivel salvar: ${message}`);
    } finally {
      setSavingRows(false);
    }
  }

  async function applyShippingDatesToExistingWithoutDate() {
    if (!supabase || !userId) return;
    if (!previewRows.length) {
      setError("Importe um arquivo antes de atualizar prazo de envio.");
      return;
    }

    setUpdatingShippingDates(true);
    setError(null);
    setStatus(null);

    try {
      const fallbackListDate = normalizeDateToYmd(listShippingDate);
      const byImportKey = new Map<string, string>();

      for (const row of previewRows) {
        const importKey = buildImportKey(row);
        const deadline = normalizeDateToYmd(row.shippingDeadline) || fallbackListDate;
        if (deadline) byImportKey.set(importKey, deadline);
      }

      const keys = [...byImportKey.keys()];
      if (!keys.length) {
        setStatus("Nenhuma data de envio valida encontrada na planilha.");
        return;
      }

      const chunkSize = 400;
      const toUpdate: Array<{ id: string; row_raw: Record<string, unknown> | null; shipping_deadline: string }> = [];

      for (let i = 0; i < keys.length; i += chunkSize) {
        const chunk = keys.slice(i, i + chunkSize);
        const { data: rows, error: loadError } = await supabase
          .from("ml_shipping_orders")
          .select("id, import_key, row_raw")
          .eq("user_id", userId)
          .in("import_key", chunk);

        if (loadError) throw new Error(loadError.message);

        for (const row of rows || []) {
          const importKey = typeof row.import_key === "string" ? row.import_key : "";
          const shippingDeadline = byImportKey.get(importKey) || "";
          const current = shippingDateFromRaw((row.row_raw as Record<string, unknown> | null) || null);
          const id = typeof row.id === "string" ? row.id : "";
          if (!id || !shippingDeadline || current) continue;
          toUpdate.push({
            id,
            row_raw: (row.row_raw as Record<string, unknown> | null) || null,
            shipping_deadline: shippingDeadline
          });
        }
      }

      let updated = 0;
      for (const row of toUpdate) {
        const nextRaw = { ...(row.row_raw || {}), shipping_deadline: row.shipping_deadline };
        const { error: updateError } = await supabase
          .from("ml_shipping_orders")
          .update({ row_raw: nextRaw, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("id", row.id);
        if (updateError) throw new Error(updateError.message);
        updated += 1;
      }

      await loadSavedOrders(userId);
      setStatus(`${updated} pedido(s) existente(s) recebeu(ram) prazo de envio (somente onde estava sem data).`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao atualizar prazos de envio.";
      setError(`Nao foi possivel atualizar prazos: ${message}`);
    } finally {
      setUpdatingShippingDates(false);
    }
  }

  function clearImportedList() {
    setPreviewRows([]);
    setFileName("");
    setListShippingDate("");
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

  async function markOrderAsPacked(row: ShippingOrder) {
    if (!supabase || !userId) return;
    if (isOrderPacked(row)) {
      setStatus("Este pedido ja esta marcado como embalado.");
      return;
    }

    setPackingOrderId(row.id);
    setError(null);
    setStatus(null);

    try {
      const nextRaw = { ...(row.row_raw || {}), packed: true, packed_at: new Date().toISOString() };
      const { error: updateError, data } = await supabase
        .from("ml_shipping_orders")
        .update({ row_raw: nextRaw, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("id", row.id)
        .select("*")
        .single();

      if (updateError) throw new Error(updateError.message);

      const updated = (data || { ...row, row_raw: nextRaw }) as ShippingOrder;
      setSavedOrders((prev) => prev.map((item) => (item.id === row.id ? updated : item)));
      setSelectedOrder(updated);
      setStatus("Pedido marcado como embalado.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao marcar pedido como embalado.";
      setError(`Nao foi possivel marcar como embalado: ${message}`);
    } finally {
      setPackingOrderId(null);
    }
  }

  async function cancelOrderPacking(row: ShippingOrder) {
    if (!supabase || !userId) return;
    if (!isOrderPacked(row)) {
      setStatus("Este pedido ainda nao esta embalado.");
      return;
    }

    setUnpackingOrderId(row.id);
    setError(null);
    setStatus(null);

    try {
      const nextRaw = { ...(row.row_raw || {}) };
      delete nextRaw.packed;
      delete nextRaw.packed_at;

      const { error: updateError, data } = await supabase
        .from("ml_shipping_orders")
        .update({ row_raw: nextRaw, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("id", row.id)
        .select("*")
        .single();

      if (updateError) throw new Error(updateError.message);

      const updated = (data || { ...row, row_raw: nextRaw }) as ShippingOrder;
      setSavedOrders((prev) => prev.map((item) => (item.id === row.id ? updated : item)));
      if (selectedOrder?.id === row.id) setSelectedOrder(updated);
      setStatus("Embalagem cancelada com sucesso.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao cancelar embalagem.";
      setError(`Nao foi possivel cancelar embalagem: ${message}`);
    } finally {
      setUnpackingOrderId(null);
    }
  }

  const ordersBySelectedDate = useMemo(
    () => savedOrders.filter((row) => shippingDateFromRaw(row.row_raw) === shippingDateFilter),
    [savedOrders, shippingDateFilter]
  );

  const filteredByTracking = useMemo(() => {
    const key = normalizeTracking(trackingSearch);
    const byTracking = key
      ? ordersBySelectedDate.filter((row) => normalizeTracking(row.tracking_number || "").includes(key))
      : ordersBySelectedDate;

    const sorted = [...byTracking].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return key ? sorted.slice(0, 300) : sorted.slice(0, 200);
  }, [ordersBySelectedDate, trackingSearch]);

  function openByTrackingValue(rawValue: string, options?: { closeCameraOnFound?: boolean }) {
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
    if (options?.closeCameraOnFound) {
      setWebCameraEnabled(false);
      setFullScreenScanner(false);
    }
    if (navigator.vibrate) navigator.vibrate(70);
  }

  function openScannerFullscreen() {
    setCameraError(null);
    setCameraSupported(true);
    setWebCameraEnabled(true);
    setFullScreenScanner(true);
  }

  function closeScannerFullscreen() {
    setFullScreenScanner(false);
    setWebCameraEnabled(false);
  }

  function stopWebCamera() {
    if (cameraTimerRef.current) {
      window.clearInterval(cameraTimerRef.current);
      cameraTimerRef.current = null;
    }
    if (cameraStreamRef.current) {
      for (const track of cameraStreamRef.current.getTracks()) {
        track.stop();
      }
      cameraStreamRef.current = null;
    }
    const video = cameraVideoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  async function startWebCamera() {
    setCameraError(null);

    const hasCameraApi = Boolean(navigator.mediaDevices?.getUserMedia);
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!hasCameraApi || !BarcodeDetectorCtor) {
      setCameraSupported(false);
      setCameraError("Scanner por camera nao suportado neste navegador. Use Chrome/Edge atualizado.");
      setFullScreenScanner(false);
      setWebCameraEnabled(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });

      const video = cameraVideoRef.current;
      if (!video) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      cameraStreamRef.current = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      const detector = new BarcodeDetectorCtor({
        formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"]
      });

      cameraTimerRef.current = window.setInterval(async () => {
        try {
          if (!cameraVideoRef.current || cameraVideoRef.current.readyState < 2) return;
          const codes = await detector.detect(cameraVideoRef.current);
          const first = Array.isArray(codes) && codes[0] ? String(codes[0].rawValue || "").trim() : "";
          if (!first) return;
          openByTrackingValue(first, { closeCameraOnFound: true });
          setTrackingSearch(first);
        } catch {
          // Silencioso para evitar ruido durante loop continuo de leitura.
        }
      }, 350);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao abrir camera.";
      setCameraError(`Nao foi possivel abrir a camera: ${message}`);
      setWebCameraEnabled(false);
      setFullScreenScanner(false);
      stopWebCamera();
    }
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

  useEffect(() => {
    if (!webCameraEnabled) {
      stopWebCamera();
      return;
    }
    void startWebCamera();
    return () => stopWebCamera();
  }, [webCameraEnabled]);

  useEffect(() => {
    return () => stopWebCamera();
  }, []);

  useEffect(() => {
    if (view !== "pedidos") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("scanner") !== "1") return;
    openScannerFullscreen();
  }, [view]);


  const stats = useMemo(() => {
    const uniqueTrackings = new Set(
      ordersBySelectedDate
        .map((row) => normalizeTracking(row.tracking_number || ""))
        .filter(Boolean)
    );

    const totalQty = ordersBySelectedDate.reduce((acc, row) => acc + (Number(row.product_qty) || 0), 0);
    const packedOrders = ordersBySelectedDate.reduce((acc, row) => acc + (isOrderPacked(row) ? 1 : 0), 0);

    return {
      totalOrders: ordersBySelectedDate.length,
      totalTrackings: uniqueTrackings.size,
      totalQty,
      packedOrders,
      unpackedOrders: Math.max(0, ordersBySelectedDate.length - packedOrders)
    };
  }, [ordersBySelectedDate]);

  const packedOrders = useMemo(
    () =>
      ordersBySelectedDate
        .filter((row) => isOrderPacked(row))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [ordersBySelectedDate]
  );

  const unpackedOrders = useMemo(
    () =>
      ordersBySelectedDate
        .filter((row) => !isOrderPacked(row))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [ordersBySelectedDate]
  );

  const previewRowsBySelectedDate = useMemo(() => {
    if (!previewRows.length) return [];
    return previewRows.filter((row) => {
      const deadline = normalizeDateToYmd(row.shippingDeadline) || normalizeDateToYmd(listShippingDate);
      return deadline === shippingDateFilter;
    });
  }, [previewRows, listShippingDate, shippingDateFilter]);

  const shippingCalendarRows = useMemo(() => {
    const grouped = new Map<
      string,
      { shippingDate: string; orders: number; qty: number; packed: number; unpacked: number }
    >();

    for (const row of savedOrders) {
      const shippingDate = shippingDateFromRaw(row.row_raw) || "sem-data";
      const current = grouped.get(shippingDate) || {
        shippingDate,
        orders: 0,
        qty: 0,
        packed: 0,
        unpacked: 0
      };
      current.orders += 1;
      current.qty += Math.max(1, Number(row.product_qty) || 1);
      if (isOrderPacked(row)) current.packed += 1;
      else current.unpacked += 1;
      grouped.set(shippingDate, current);
    }

    return [...grouped.values()].sort((a, b) => {
      if (a.shippingDate === "sem-data" && b.shippingDate !== "sem-data") return 1;
      if (a.shippingDate !== "sem-data" && b.shippingDate === "sem-data") return -1;
      if (a.shippingDate < b.shippingDate) return -1;
      if (a.shippingDate > b.shippingDate) return 1;
      return 0;
    });
  }, [savedOrders]);

  const productionRows = useMemo(() => {
    const source =
      previewRows.length > 0
        ? previewRowsBySelectedDate.map((row) => ({
            adName: row.adName,
            sku: row.sku,
            imageUrl: row.imageUrl,
            productQty: Math.max(1, Number(row.productQty) || 1)
          }))
        : ordersBySelectedDate.map((row) => ({
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
  }, [previewRows, previewRowsBySelectedDate, ordersBySelectedDate]);

  const showKpis = view === "all" || view === "calendario" || view === "producao" || view === "pedidos";
  const showImportMenu = view === "all" || view === "importacao" || view === "pedidos";
  const showShippingCalendar = view === "all" || view === "calendario" || view === "pedidos";
  const showProduction = view === "all" || view === "producao";
  const showTrackingList = view === "all" || view === "pedidos";
  const showPreviewTable = view === "all" || view === "importacao";
  const pageTitle =
    view === "importacao"
      ? "Importacao de Pedidos"
      : view === "calendario"
        ? "Calendario de Envio"
        : view === "producao"
          ? "Separacao de Producao"
          : view === "pedidos"
            ? "Pedidos de Envio"
            : "Separacao de Pedido";
  const pageDesc =
    view === "importacao"
      ? "Suba planilhas, mantenha somente pedidos novos e aplique prazo em pedidos sem data."
      : view === "calendario"
        ? "Controle operacional por data de envio para visualizar volume e status do dia."
        : view === "producao"
          ? "Agrupamento de producao por anuncio, SKU e total a produzir."
          : view === "pedidos"
            ? "Conferencia por rastreio, scanner e status de embalagem."
            : "Importe pedidos em .xlsx, organize por rastreio e consulte dados rapidamente para envio e conferencia.";

  return (
    <section className="page ml-separacao-page">
      <div className="section-head row-between">
        <div>
          <h2>{pageTitle}</h2>
          <p className="page-text">{pageDesc}</p>
        </div>
      </div>

      {showKpis && <div className="ml-kpi-grid ml-production-kpis ml-separacao-kpis">
        <article className="kpi-card">
          <p>Pedidos salvos</p>
          <strong>{stats.totalOrders}</strong>
          <span>Base para expedicao</span>
        </article>
        <article className="kpi-card">
          <p>Rastreios unicos</p>
          <strong>{stats.totalTrackings}</strong>
          <span>Codigos para busca</span>
        </article>
        <article className="kpi-card">
          <p>Qtd total de produtos</p>
          <strong>{stats.totalQty}</strong>
          <span>Total de itens</span>
        </article>
        <article className="kpi-card">
          <p>Ultima importacao</p>
          <strong>{fileName ? "Pronta" : "-"}</strong>
          <span>{fileName || "Nenhum arquivo importado"}</span>
        </article>
        <button
          type="button"
          className="kpi-card ml-kpi-action-card"
          onClick={() => setShowPackedOrdersModal(true)}
          title="Ver pedidos embalados"
        >
          <p>Pedidos Embalados</p>
          <strong>{stats.packedOrders}</strong>
          <span>Pedidos marcados como embalados</span>
        </button>
        <button
          type="button"
          className="kpi-card ml-kpi-action-card"
          onClick={() => setShowUnpackedOrdersModal(true)}
          title="Ver pedidos sem embalar"
        >
          <p>Pedidos Sem embalar</p>
          <strong>{stats.unpackedOrders}</strong>
          <span>Total de pedidos pendentes de embalagem</span>
        </button>
      </div>}

      {showImportMenu && <div className="soft-panel ml-upload-panel ml-separacao-menu">
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
            disabled={!previewRows.length || savingRows || removingRows || loadingInit || updatingShippingDates}
          >
            {savingRows ? "Salvando..." : "Salvar pedidos no sistema"}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void applyShippingDatesToExistingWithoutDate()}
            disabled={!previewRows.length || savingRows || removingRows || loadingInit || updatingShippingDates}
          >
            {updatingShippingDates ? "Atualizando prazo..." : "Aplicar prazo em pedidos sem data"}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void removeImportedRows()}
            disabled={!previewRows.length || savingRows || removingRows || loadingInit || updatingShippingDates}
          >
            {removingRows ? "Removendo..." : "Remover lista do sistema"}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={clearImportedList}
            disabled={!previewRows.length || savingRows || removingRows || loadingInit || updatingShippingDates}
          >
            Descartar lista
          </button>
          {fileName && <span className="page-text">Arquivo: {fileName}</span>}
        </div>
        <div className="ml-upload-row">
          <label className="field ml-separacao-date-field" style={{ marginBottom: 0 }}>
            <span>Data de envio da lista</span>
            <input
              type="date"
              value={listShippingDate}
              onChange={(e) => setListShippingDate(normalizeDateToYmd(e.target.value))}
            />
          </label>
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
          <label className="field ml-separacao-track-field" style={{ marginBottom: 0 }}>
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
          <label className="field ml-separacao-date-field" style={{ marginBottom: 0 }}>
            <span>Calendario por dia</span>
            <input
              type="date"
              value={shippingDateFilter}
              onChange={(e) => setShippingDateFilter(normalizeDateToYmd(e.target.value) || todayYmd)}
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
          <button
            type="button"
            className={webCameraEnabled ? "primary-btn" : "ghost-btn"}
            onClick={() => {
              if (webCameraEnabled && fullScreenScanner) {
                closeScannerFullscreen();
              } else {
                openScannerFullscreen();
              }
            }}
          >
            {webCameraEnabled && fullScreenScanner ? "Fechar camera web" : "Abrir scanner em tela cheia"}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void deleteFilteredOrders()}
            disabled={deletingFiltered || loadingInit || filteredByTracking.length === 0}
          >
            {deletingFiltered ? "Excluindo filtrados..." : "Excluir filtrados"}
          </button>
          {scannerMode && (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setTrackingSearch("");
                setShippingDateFilter(todayYmd);
                setScanStatus(null);
                trackingInputRef.current?.focus();
              }}
            >
              Limpar
            </button>
          )}
          {scannerMode && (
            <span className="scan-live-indicator">
              <i /> Leitura continua habilitada
            </span>
          )}
        </div>
        {!cameraSupported && (
          <p className="page-text">
            Scanner web indisponivel neste navegador. Use Chrome/Edge recente ou scanner via teclado.
          </p>
        )}
        {cameraError && <p className="error-text">{cameraError}</p>}
        {scanStatus && <p className="page-text">{scanStatus}</p>}
        <span className="page-text">
          Campos importados: N de Pedido da Plataforma, Nome do Anuncio, SKU, Variacao, Link da Imagem, Notas do Comprador,
          Observacoes, Qtd. do Produto, Nome do Destinatario, N de Rastreio e Prazo de Envio (quando existir).
        </span>
        {status && <p className="page-text">{status}</p>}
        {error && <p className="error-text">{error}</p>}
      </div>}

      {showShippingCalendar && <div className="ml-orders-table-wrap">
        <div className="ml-orders-head">
          <h3>Calendario de envio</h3>
          <span>{shippingCalendarRows.length} dia(s)</span>
        </div>
        <div className="table-wrap">
          <table className="table clean ml-shipping-table">
            <thead>
              <tr>
                <th>Data de envio</th>
                <th>Pedidos</th>
                <th>Qtd itens</th>
                <th>Embalados</th>
                <th>Pendentes</th>
                <th>Filtrar</th>
              </tr>
            </thead>
            <tbody>
              {shippingCalendarRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>Sem dados de envio para exibir.</td>
                </tr>
              ) : (
                shippingCalendarRows.map((day) => (
                  <tr key={day.shippingDate}>
                    <td data-label="Data de envio">
                      {day.shippingDate === "sem-data" ? "Sem data" : formatDateOnly(day.shippingDate)}
                    </td>
                    <td data-label="Pedidos">{day.orders}</td>
                    <td data-label="Qtd itens">{day.qty}</td>
                    <td data-label="Embalados">{day.packed}</td>
                    <td data-label="Pendentes">{day.unpacked}</td>
                    <td data-label="Filtrar">
                      {day.shippingDate !== "sem-data" ? (
                        <button
                          type="button"
                          className={shippingDateFilter === day.shippingDate ? "primary-btn" : "ghost-btn"}
                          onClick={() =>
                            setShippingDateFilter((prev) => (prev === day.shippingDate ? todayYmd : day.shippingDate))
                          }
                        >
                          {shippingDateFilter === day.shippingDate ? "Hoje" : "Filtrar dia"}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>}

      {showProduction && <div className="ml-orders-table-wrap">
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
                    <td data-label="Foto">
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
                    <td className="ml-col-title" data-label="Informacao">{row.info}</td>
                    <td data-label="SKU">{row.sku}</td>
                    <td data-label="Und por anuncio">{row.unitsPerAd}</td>
                    <td data-label="Qtd carrinho">{row.cartQty}</td>
                    <td data-label="Total produzir">
                      <strong>{row.totalProduce}</strong>
                    </td>
                    <td data-label="Pedidos">{row.ordersCount}</td>
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
      </div>}

      {showTrackingList && <div className="ml-orders-table-wrap">
        <div className="ml-orders-head">
          <h3>Buscar por N de Rastreio</h3>
          <span>{filteredByTracking.length} resultado(s)</span>
        </div>

        <div className="table-wrap">
          <table className="table clean ml-shipping-table">
            <thead>
              <tr>
                <th>Rastreio</th>
                <th>Pedido</th>
                <th>Destinatario</th>
                <th>Anuncio</th>
                <th>Qtd</th>
                <th>Data envio</th>
                <th>Atualizado</th>
                <th>Detalhes</th>
                <th>Excluir</th>
              </tr>
            </thead>
            <tbody>
              {loadingInit ? (
                <tr>
                  <td colSpan={9}>Carregando pedidos...</td>
                </tr>
              ) : filteredByTracking.length === 0 ? (
                <tr>
                  <td colSpan={9}>Nenhum pedido encontrado.</td>
                </tr>
              ) : (
                filteredByTracking.slice(0, 200).map((row) => (
                  <tr key={row.id}>
                    <td className="ml-col-order-id" data-label="Rastreio">{row.tracking_number || "-"}</td>
                    <td className="ml-col-order-id" data-label="Pedido">{row.platform_order_number || "-"}</td>
                    <td data-label="Destinatario">{row.recipient_name || "-"}</td>
                    <td className="ml-col-title" data-label="Anuncio">{row.ad_name || "-"}</td>
                    <td data-label="Qtd">{row.product_qty || 1}</td>
                    <td data-label="Data envio">{formatDateOnly(shippingDateFromRaw(row.row_raw))}</td>
                    <td data-label="Atualizado">{formatDate(row.updated_at)}</td>
                    <td data-label="Detalhes">
                      <button type="button" className="ghost-btn" onClick={() => setSelectedOrder(row)}>
                        Visualizar
                      </button>
                    </td>
                    <td data-label="Excluir">
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
      </div>}

      {showPreviewTable && <div className="ml-orders-table-wrap">
        <div className="ml-orders-head">
          <h3>Pre-visualizacao do arquivo importado</h3>
          <span>{previewRowsBySelectedDate.length} linha(s)</span>
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
                <th>Prazo envio</th>
              </tr>
            </thead>
            <tbody>
              {previewRowsBySelectedDate.length === 0 ? (
                <tr>
                  <td colSpan={8}>Sem linhas para a data selecionada.</td>
                </tr>
              ) : (
                previewRowsBySelectedDate.map((row) => (
                  <tr key={row.rowId}>
                    <td className="ml-col-order-id" data-label="Pedido">{row.platformOrderNumber || "-"}</td>
                    <td className="ml-col-title" data-label="Anuncio">{row.adName || "-"}</td>
                    <td data-label="SKU">{row.sku || "-"}</td>
                    <td data-label="Variacao">{row.variation || "-"}</td>
                    <td data-label="Qtd">{row.productQty}</td>
                    <td data-label="Destinatario">{row.recipientName || "-"}</td>
                    <td className="ml-col-order-id" data-label="Rastreio">{row.trackingNumber || "-"}</td>
                    <td data-label="Prazo envio">{formatDateOnly(row.shippingDeadline || listShippingDate)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>}

      <button
        type="button"
        className={fullScreenScanner && webCameraEnabled ? "ml-scan-fab active" : "ml-scan-fab"}
        onClick={() => {
          if (fullScreenScanner && webCameraEnabled) {
            closeScannerFullscreen();
          } else {
            openScannerFullscreen();
          }
        }}
        aria-label={fullScreenScanner && webCameraEnabled ? "Fechar scanner" : "Abrir scanner"}
        title={fullScreenScanner && webCameraEnabled ? "Fechar scanner" : "Abrir scanner"}
      >
        <span className="ml-scan-icon" aria-hidden>
          <svg viewBox="0 0 24 24" className="ml-scan-svg" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" />
            <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" />
            <path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" />
            <path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
            <path d="M8 9v6M11 8v8M14 9v6M17 8v8" />
          </svg>
        </span>
      </button>

      {fullScreenScanner && (
        <div className="ml-scan-overlay" onClick={closeScannerFullscreen}>
          <div className="ml-scan-overlay-inner" onClick={(e) => e.stopPropagation()}>
            <div className="ml-scan-overlay-head">
              <strong>Scanner de rastreio</strong>
              <button type="button" className="ghost-btn" onClick={closeScannerFullscreen}>
                Fechar
              </button>
            </div>
            <video ref={cameraVideoRef} className="ml-scan-overlay-video" muted />
            <div className="ml-scan-overlay-help">Centralize o codigo no quadro. A leitura fecha a camera automaticamente.</div>
          </div>
        </div>
      )}

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
                <p><strong>Data de envio:</strong> {formatDateOnly(shippingDateFromRaw(selectedOrder.row_raw))}</p>
                <p><strong>Status:</strong> {isOrderPacked(selectedOrder) ? "Embalado" : "Pendente"}</p>
                <p><strong>Notas do comprador:</strong> {selectedOrder.buyer_notes || "-"}</p>
                <p><strong>Observacoes:</strong> {selectedOrder.observations || "-"}</p>
                <button
                  type="button"
                  className={isOrderPacked(selectedOrder) ? "ghost-btn" : "primary-btn"}
                  disabled={isOrderPacked(selectedOrder) || packingOrderId === selectedOrder.id}
                  onClick={() => void markOrderAsPacked(selectedOrder)}
                >
                  {packingOrderId === selectedOrder.id ? "Salvando..." : "Pedido Embalado"}
                </button>
                {isOrderPacked(selectedOrder) && (
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={unpackingOrderId === selectedOrder.id}
                    onClick={() => void cancelOrderPacking(selectedOrder)}
                  >
                    {unpackingOrderId === selectedOrder.id ? "Cancelando..." : "Cancelar embalagem"}
                  </button>
                )}
              </div>
            </div>
          </article>
        </div>
      )}

      {showPackedOrdersModal && (
        <div className="assistant-modal-backdrop" onClick={() => setShowPackedOrdersModal(false)}>
          <article className="assistant-modal ml-packed-orders-modal" onClick={(e) => e.stopPropagation()}>
            <header className="assistant-modal-head">
              <h3>Pedidos embalados</h3>
              <button type="button" onClick={() => setShowPackedOrdersModal(false)}>
                Fechar
              </button>
            </header>

            <p className="page-text">
              {packedOrders.length} pedido(s) marcado(s) como embalado(s).
            </p>

            <div className="ml-packed-orders-list">
              {packedOrders.length === 0 ? (
                <div className="ml-packed-order-card">
                  <p className="page-text">Nenhum pedido embalado ainda.</p>
                </div>
              ) : (
                packedOrders.map((row) => {
                  const packedAtRaw =
                    row.row_raw && typeof row.row_raw === "object"
                      ? (row.row_raw.packed_at as string | undefined)
                      : undefined;
                  const packedAt = packedAtRaw || row.updated_at;
                  const sku = safeRawValue(row.row_raw, "sku");

                  return (
                    <article key={row.id} className="ml-packed-order-card">
                      <div className="ml-packed-order-top">
                        {row.image_url ? (
                          <img
                            src={String(row.image_url).replace(/^http:\/\//i, "https://")}
                            alt={row.ad_name || "Imagem do pedido"}
                            className="ml-packed-order-image"
                            loading="lazy"
                          />
                        ) : (
                          <div className="ml-packed-order-image empty">Sem imagem</div>
                        )}
                        <div className="ml-packed-order-main">
                          <p><strong>Pedido:</strong> {row.platform_order_number || "-"}</p>
                          <p><strong>Rastreio:</strong> {row.tracking_number || "-"}</p>
                          <p><strong>Destinatario:</strong> {row.recipient_name || "-"}</p>
                          <p><strong>Anuncio:</strong> {row.ad_name || "-"}</p>
                          <p><strong>Variacao:</strong> {row.variation || "-"}</p>
                          <p><strong>Data envio:</strong> {formatDateOnly(shippingDateFromRaw(row.row_raw))}</p>
                        </div>
                      </div>
                      <div className="ml-packed-order-grid">
                        <p><strong>SKU:</strong> {sku || "-"}</p>
                        <p><strong>Quantidade:</strong> {row.product_qty || 1}</p>
                        <p><strong>Arquivo:</strong> {row.source_file_name || "-"}</p>
                        <p><strong>Embalado em:</strong> {formatDate(packedAt)}</p>
                        <p><strong>Notas:</strong> {row.buyer_notes || "-"}</p>
                        <p><strong>Observacoes:</strong> {row.observations || "-"}</p>
                      </div>
                      <div className="ml-packed-order-actions">
                        <button type="button" className="ghost-btn" onClick={() => setSelectedOrder(row)}>
                          Ver detalhes
                        </button>
                        <button
                          type="button"
                          className="ghost-btn"
                          disabled={unpackingOrderId === row.id}
                          onClick={() => void cancelOrderPacking(row)}
                        >
                          {unpackingOrderId === row.id ? "Cancelando..." : "Cancelar embalagem"}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </article>
        </div>
      )}

      {showUnpackedOrdersModal && (
        <div className="assistant-modal-backdrop" onClick={() => setShowUnpackedOrdersModal(false)}>
          <article className="assistant-modal ml-packed-orders-modal" onClick={(e) => e.stopPropagation()}>
            <header className="assistant-modal-head">
              <h3>Pedidos sem embalar</h3>
              <button type="button" onClick={() => setShowUnpackedOrdersModal(false)}>
                Fechar
              </button>
            </header>

            <p className="page-text">
              {unpackedOrders.length} pedido(s) pendente(s) de embalagem.
            </p>

            <div className="ml-packed-orders-list">
              {unpackedOrders.length === 0 ? (
                <div className="ml-packed-order-card">
                  <p className="page-text">Nenhum pedido pendente de embalagem.</p>
                </div>
              ) : (
                unpackedOrders.map((row) => {
                  const sku = safeRawValue(row.row_raw, "sku");

                  return (
                    <article key={row.id} className="ml-packed-order-card">
                      <div className="ml-packed-order-top">
                        {row.image_url ? (
                          <img
                            src={String(row.image_url).replace(/^http:\/\//i, "https://")}
                            alt={row.ad_name || "Imagem do pedido"}
                            className="ml-packed-order-image"
                            loading="lazy"
                          />
                        ) : (
                          <div className="ml-packed-order-image empty">Sem imagem</div>
                        )}
                        <div className="ml-packed-order-main">
                          <p><strong>Pedido:</strong> {row.platform_order_number || "-"}</p>
                          <p><strong>Rastreio:</strong> {row.tracking_number || "-"}</p>
                          <p><strong>Destinatario:</strong> {row.recipient_name || "-"}</p>
                          <p><strong>Anuncio:</strong> {row.ad_name || "-"}</p>
                          <p><strong>Variacao:</strong> {row.variation || "-"}</p>
                          <p><strong>Data envio:</strong> {formatDateOnly(shippingDateFromRaw(row.row_raw))}</p>
                        </div>
                      </div>
                      <div className="ml-packed-order-grid">
                        <p><strong>SKU:</strong> {sku || "-"}</p>
                        <p><strong>Quantidade:</strong> {row.product_qty || 1}</p>
                        <p><strong>Arquivo:</strong> {row.source_file_name || "-"}</p>
                        <p><strong>Atualizado em:</strong> {formatDate(row.updated_at)}</p>
                        <p><strong>Notas:</strong> {row.buyer_notes || "-"}</p>
                        <p><strong>Observacoes:</strong> {row.observations || "-"}</p>
                      </div>
                      <div className="ml-packed-order-actions">
                        <button type="button" className="ghost-btn" onClick={() => setSelectedOrder(row)}>
                          Ver detalhes
                        </button>
                        <button
                          type="button"
                          className="primary-btn"
                          disabled={packingOrderId === row.id}
                          onClick={() => void markOrderAsPacked(row)}
                        >
                          {packingOrderId === row.id ? "Salvando..." : "Marcar embalado"}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
