import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type CalendarOrder = {
  id: string;
  user_id?: string;
  order_id: string;
  image_data: string;
  printed: boolean;
  created_at?: string;
};

type MockupConfig = {
  template_data: string;
  left_rect: MarkerRect | null;
  right_rect: MarkerRect | null;
  left_quad?: MarkerQuad | null;
  right_quad?: MarkerQuad | null;
};

type MarkerRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

type MarkerPoint = {
  x: number;
  y: number;
};

type MarkerQuad = {
  tl: MarkerPoint;
  tr: MarkerPoint;
  br: MarkerPoint;
  bl: MarkerPoint;
};

type BatchPrintRow = {
  orderId: string;
  imageData: string;
  sheets: number;
  fitMode: "cover" | "contain" | "fill";
  stretchX: number;
};

const CALENDAR_MOCKUP_SETTINGS_ID = "calendar_mockup_config";
const DEFAULT_LEFT_RECT: MarkerRect = { x: 0.08, y: 0.1, width: 0.38, height: 0.38, rotation: 0 };
const DEFAULT_RIGHT_RECT: MarkerRect = { x: 0.54, y: 0.1, width: 0.38, height: 0.38, rotation: 0 };

type ResizeDragState = {
  side: "left" | "right";
  axis: "width" | "height";
  edge: "start" | "end";
  start: { x: number; y: number };
  base: MarkerRect;
};

type MoveDragState = {
  side: "left" | "right";
  start: { x: number; y: number };
  base: MarkerRect;
};

type RotateDragState = {
  side: "left" | "right";
  start: { x: number; y: number };
  base: MarkerRect;
};

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem."));
    img.src = dataUrl;
  });
}

async function analyzePrintStrategy(
  imageData: string
): Promise<{ fitMode: "cover" | "contain" | "fill"; stretchX: number }> {
  const cellRatio = 5 / 4.243;
  const MAX_SAFE_STRETCH_X = 2.35;
  try {
    const img = await loadImageFromDataUrl(imageData);
    if (!img.naturalWidth || !img.naturalHeight) return { fitMode: "contain", stretchX: 1 };
    const imgRatio = img.naturalWidth / img.naturalHeight;
    // Regra: nao perder informacao da arte.
    // 1) Base sempre em contain (sem corte).
    // 2) Quando a arte for muito vertical, estica apenas lateral (X) para ocupar melhor o quadro.
    if (imgRatio >= cellRatio) return { fitMode: "contain", stretchX: 1 };

    const requiredStretch = cellRatio / Math.max(0.0001, imgRatio);
    const stretchX = Math.min(MAX_SAFE_STRETCH_X, Math.max(1, requiredStretch));
    return { fitMode: "contain", stretchX: Number(stretchX.toFixed(3)) };
  } catch {
    return { fitMode: "contain", stretchX: 1 };
  }
}

function formatDate(value?: string) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleDateString("pt-BR");
}

function clampUnit(value: number) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeRect(rect?: Partial<MarkerRect> | null, fallback?: MarkerRect): MarkerRect {
  const fx = Number(rect?.x ?? fallback?.x ?? 0);
  const fy = Number(rect?.y ?? fallback?.y ?? 0);
  const fw = Number(rect?.width ?? fallback?.width ?? 0.3);
  const fh = Number(rect?.height ?? fallback?.height ?? 0.3);
  const minSize = 0.02;
  const x = clampUnit(fx);
  const y = clampUnit(fy);
  const width = Math.max(minSize, Math.min(clampUnit(fw), 1 - x));
  const height = Math.max(minSize, Math.min(clampUnit(fh), 1 - y));

  return {
    x,
    y,
    width,
    height,
    rotation: Number(rect?.rotation ?? fallback?.rotation ?? 0) || 0
  };
}

function normalizePoint(p?: Partial<MarkerPoint> | null): MarkerPoint {
  return {
    x: clampUnit(Number(p?.x ?? 0)),
    y: clampUnit(Number(p?.y ?? 0))
  };
}

function normalizeQuad(quad?: Partial<MarkerQuad> | null): MarkerQuad | null {
  if (!quad?.tl || !quad?.tr || !quad?.br || !quad?.bl) return null;
  return {
    tl: normalizePoint(quad.tl),
    tr: normalizePoint(quad.tr),
    br: normalizePoint(quad.br),
    bl: normalizePoint(quad.bl)
  };
}

function rectToQuad(rect: MarkerRect): MarkerQuad {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const rad = (rect.rotation * Math.PI) / 180;

  const rotate = (dx: number, dy: number): MarkerPoint => ({
    x: clampUnit(cx + dx * Math.cos(rad) - dy * Math.sin(rad)),
    y: clampUnit(cy + dx * Math.sin(rad) + dy * Math.cos(rad))
  });

  return {
    tl: rotate(-hw, -hh),
    tr: rotate(hw, -hh),
    br: rotate(hw, hh),
    bl: rotate(-hw, hh)
  };
}

async function openPrintGrid(orderId: string, imageData: string) {
  const popup = window.open("", "_blank", "width=1200,height=900");
  if (!popup) return;
  const strategy = await analyzePrintStrategy(imageData);

  const cells = new Array(28)
    .fill(0)
    .map(
      () => `
        <div class="cell">
          <div class="cell-inner">
            <img src="${imageData}" alt="Arte ${orderId}" style="transform: scaleX(${strategy.stretchX});" />
          </div>
        </div>
      `
    )
    .join("");

  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>PDF 28x - ${orderId}</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          html, body {
            margin: 0;
            padding: 0;
            width: 210mm;
            height: 297mm;
            background: #fff;
          }
          .sheet {
            width: 210mm;
            height: 297mm;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .grid {
            width: 20cm;
            height: 29.7cm;
            display: grid;
            grid-template-columns: repeat(4, 5cm);
            grid-template-rows: repeat(7, 4.243cm);
            gap: 0;
            position: relative;
          }
          .cell {
            width: 5cm;
            height: 4.243cm;
            overflow: hidden;
          }
          .cell-inner {
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            padding: 0.08mm;
            background: #fff;
          }
          img {
            width: 100%;
            height: 100%;
            object-fit: ${strategy.fitMode};
            display: block;
            transform-origin: center center;
          }
          .cut-lines {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 5;
          }
          .cut-lines i {
            position: absolute;
            left: 0;
            width: 100%;
            height: 0;
            border-top: 0.2mm dashed rgba(0, 0, 0, 0.7);
          }
          @media print {
            html, body, .sheet { margin: 0; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="grid">
            ${cells}
            <div class="cut-lines">
              <i style="top:4.243cm"></i>
              <i style="top:8.486cm"></i>
              <i style="top:12.729cm"></i>
              <i style="top:16.972cm"></i>
              <i style="top:21.215cm"></i>
              <i style="top:25.458cm"></i>
            </div>
          </div>
        </div>
        <script>
          window.onload = () => window.print();
        </script>
      </body>
    </html>
  `);
  popup.document.close();
}

function openBatchPrintGrid(rows: BatchPrintRow[]) {
  if (!rows.length) return;
  const popup = window.open("", "_blank", "width=1200,height=900");
  if (!popup) return;

  const sheetHtml = rows
    .flatMap((row) => {
      const pages = new Array(Math.max(1, row.sheets)).fill(0);
      return pages.map(
        (_, idx) => `
          <section class="batch-sheet">
            <div class="grid">
              ${new Array(28)
                .fill(0)
                .map(
                  () => `
                    <div class="cell">
                      <div class="cell-inner">
                        <img
                          class="fit-${row.fitMode}"
                          style="transform: scaleX(${row.stretchX});"
                          src="${row.imageData}"
                          alt="Arte ${row.orderId}"
                        />
                      </div>
                    </div>
                  `
                )
                .join("")}
              <div class="cut-lines">
                <i style="top:4.243cm"></i>
                <i style="top:8.486cm"></i>
                <i style="top:12.729cm"></i>
                <i style="top:16.972cm"></i>
                <i style="top:21.215cm"></i>
                <i style="top:25.458cm"></i>
              </div>
            </div>
          </section>
        `
      );
    })
    .join("");

  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Impressao em Lote</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          html, body {
            margin: 0;
            padding: 0;
            width: 210mm;
            height: 297mm;
            background: #fff;
            font-family: Arial, sans-serif;
          }
          .batch-sheet {
            width: 210mm;
            height: 297mm;
            page-break-after: always;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            display: flex;
          }
          .batch-sheet:last-child { page-break-after: auto; }
          .grid {
            width: 20cm;
            height: 29.7cm;
            display: grid;
            grid-template-columns: repeat(4, 5cm);
            grid-template-rows: repeat(7, 4.243cm);
            gap: 0;
            position: relative;
          }
          .cell {
            width: 5cm;
            height: 4.243cm;
            overflow: hidden;
          }
          .cell-inner {
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            padding: 0.08mm;
            background: #fff;
          }
          .cell img {
            width: 100%;
            height: 100%;
            display: block;
            transform-origin: center center;
          }
          .cell img.fit-cover { object-fit: cover; }
          .cell img.fit-contain { object-fit: contain; }
          .cell img.fit-fill { object-fit: fill; }
          .cut-lines {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 5;
          }
          .cut-lines i {
            position: absolute;
            left: 0;
            width: 100%;
            height: 0;
            border-top: 0.2mm dashed rgba(0, 0, 0, 0.7);
          }
        </style>
      </head>
      <body>
        ${sheetHtml}
        <script>
          window.onload = () => window.print();
        </script>
      </body>
    </html>
  `);
  popup.document.close();
}

export function CalendarPage() {
  const [items, setItems] = useState<CalendarOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingNew, setSavingNew] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [tab, setTab] = useState<"todo" | "printed">("todo");

  const [showNewModal, setShowNewModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [imageData, setImageData] = useState("");
  const [batchPlan, setBatchPlan] = useState<Record<string, { selected: boolean; sheets: number }>>({});

  const [showMockupModal, setShowMockupModal] = useState(false);
  const [mockupConfig, setMockupConfig] = useState<MockupConfig>({
    template_data: "",
    left_rect: null,
    right_rect: null,
    left_quad: null,
    right_quad: null
  });
  const [savingMockup, setSavingMockup] = useState(false);
  const [markerSide, setMarkerSide] = useState<"left" | "right">("left");
  const [pointDraft, setPointDraft] = useState<{ x: number; y: number }[]>([]);
  const [resizeDrag, setResizeDrag] = useState<ResizeDragState | null>(null);
  const [moveDrag, setMoveDrag] = useState<MoveDragState | null>(null);
  const [rotateDrag, setRotateDrag] = useState<RotateDragState | null>(null);
  const markerSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [templateRatio, setTemplateRatio] = useState(16 / 9);

  async function loadOrders() {
    if (!supabase) {
      setStatus("Supabase nao configurado.");
      setLoading(false);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      setStatus("Usuario nao autenticado.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("calendar_orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setStatus(error.message);
      setItems([]);
    } else {
      setItems(((data || []) as CalendarOrder[]).map((item) => ({ ...item, printed: Boolean(item.printed) })));
      setStatus(null);
    }
    setLoading(false);
  }

  async function loadMockupConfig() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("app_settings")
      .select("config_data")
      .eq("id", CALENDAR_MOCKUP_SETTINGS_ID)
      .maybeSingle();

    if (error) return;

    const cfg = data?.config_data as Partial<MockupConfig> | null;
    setMockupConfig({
      template_data: String(cfg?.template_data || ""),
      left_rect: cfg?.left_rect ? normalizeRect(cfg.left_rect, DEFAULT_LEFT_RECT) : null,
      right_rect: cfg?.right_rect ? normalizeRect(cfg.right_rect, DEFAULT_RIGHT_RECT) : null,
      left_quad: normalizeQuad(cfg?.left_quad),
      right_quad: normalizeQuad(cfg?.right_quad)
    });
  }

  useEffect(() => {
    loadOrders();
    loadMockupConfig();
  }, []);

  useEffect(() => {
    if (!mockupConfig.template_data) return;
    loadImageFromDataUrl(mockupConfig.template_data)
      .then((img) => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          setTemplateRatio(img.naturalWidth / img.naturalHeight);
        }
      })
      .catch(() => {
        setTemplateRatio(16 / 9);
      });
  }, [mockupConfig.template_data]);

  useEffect(() => {
    if (!resizeDrag) return;
    const drag = resizeDrag;

    function onMove(e: MouseEvent) {
      const pos = toUnitPosition(e.clientX, e.clientY);
      if (!pos) return;

      if (drag.axis === "width") {
        const delta = pos.x - drag.start.x;
        const next = drag.edge === "end"
          ? normalizeRect(
              {
                ...drag.base,
                width: drag.base.width + delta
              },
              drag.base
            )
          : normalizeRect(
              {
                ...drag.base,
                x: drag.base.x + delta,
                width: drag.base.width - delta
              },
              drag.base
            );
        finalizeRect(drag.side, next);
        return;
      }

      const delta = pos.y - drag.start.y;
      const next = drag.edge === "end"
        ? normalizeRect(
            {
              ...drag.base,
              height: drag.base.height + delta
            },
            drag.base
          )
        : normalizeRect(
            {
              ...drag.base,
              y: drag.base.y + delta,
              height: drag.base.height - delta
            },
            drag.base
          );
      finalizeRect(drag.side, next);
    }

    function onUp() {
      setResizeDrag(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizeDrag]);

  useEffect(() => {
    if (!moveDrag) return;
    const drag = moveDrag;

    function onMove(e: MouseEvent) {
      const pos = toUnitPosition(e.clientX, e.clientY);
      if (!pos) return;

      const dx = pos.x - drag.start.x;
      const dy = pos.y - drag.start.y;
      const next = normalizeRect(
        {
          ...drag.base,
          x: drag.base.x + dx,
          y: drag.base.y + dy
        },
        drag.base
      );
      finalizeRect(drag.side, next);
    }

    function onUp() {
      setMoveDrag(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [moveDrag]);

  useEffect(() => {
    if (!rotateDrag) return;
    const drag = rotateDrag;

    function onMove(e: MouseEvent) {
      const pos = toUnitPosition(e.clientX, e.clientY);
      if (!pos) return;

      const center = {
        x: drag.base.x + drag.base.width / 2,
        y: drag.base.y + drag.base.height / 2
      };
      const startAngle = angleDeg(center, drag.start);
      const currentAngle = angleDeg(center, pos);
      const delta = currentAngle - startAngle;

      finalizeRect(drag.side, {
        ...drag.base,
        rotation: (drag.base.rotation || 0) + delta
      });
    }

    function onUp() {
      setRotateDrag(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [rotateDrag]);

  const filtered = useMemo(
    () => items.filter((item) => (tab === "printed" ? Boolean(item.printed) : !Boolean(item.printed))),
    [items, tab]
  );

  useEffect(() => {
    const next: Record<string, { selected: boolean; sheets: number }> = {};
    for (const item of filtered) {
      const old = batchPlan[item.id];
      next[item.id] = {
        selected: old?.selected ?? false,
        sheets: old?.sheets ?? 1
      };
    }
    setBatchPlan(next);
  }, [filtered]);

  async function onSelectFile(file: File | null) {
    if (!file) return;
    const dataUrl = await toDataUrl(file);
    setImageData(dataUrl);
  }

  async function onSelectMockupTemplate(file: File | null) {
    if (!file) return;
    const dataUrl = await toDataUrl(file);
    try {
      const img = await loadImageFromDataUrl(dataUrl);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setTemplateRatio(img.naturalWidth / img.naturalHeight);
      }
    } catch {}
    setMockupConfig((prev) => ({ ...prev, template_data: dataUrl }));
  }

  function toggleBatchSelect(id: string, selected: boolean) {
    setBatchPlan((prev) => ({
      ...prev,
      [id]: {
        selected,
        sheets: Math.max(1, Number(prev[id]?.sheets || 1))
      }
    }));
  }

  function setBatchSheets(id: string, value: number) {
    const sheets = Number.isNaN(value) ? 1 : Math.max(1, Math.min(999, Math.floor(value)));
    setBatchPlan((prev) => ({
      ...prev,
      [id]: {
        selected: Boolean(prev[id]?.selected),
        sheets
      }
    }));
  }

  async function runBatchPrint() {
    const selectedBase = filtered
      .filter((item) => batchPlan[item.id]?.selected)
      .map((item) => ({
        orderId: item.order_id,
        imageData: item.image_data,
        sheets: Math.max(1, Number(batchPlan[item.id]?.sheets || 1))
      }));

    if (!selectedBase.length) {
      setStatus("Selecione pelo menos uma arte para impressao em lote.");
      return;
    }

    const selectedRows: BatchPrintRow[] = await Promise.all(
      selectedBase.map(async (row) => ({
        ...row,
        ...(await analyzePrintStrategy(row.imageData))
      }))
    );

    const totalSheets = selectedRows.reduce((acc, row) => acc + row.sheets, 0);
    openBatchPrintGrid(selectedRows);
    setShowBatchModal(false);
    setStatus(`Lote enviado para impressao: ${selectedRows.length} arte(s), ${totalSheets} folha(s).`);
  }

  function toUnitPosition(clientX: number, clientY: number) {
    const el = markerSurfaceRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    return {
      x: clampUnit((clientX - rect.left) / rect.width),
      y: clampUnit((clientY - rect.top) / rect.height)
    };
  }

  function fitRect(x: number, y: number, width: number, height: number, rotation = 0): MarkerRect {
    const min = 0.02;
    let nx = clampUnit(x);
    let ny = clampUnit(y);
    let w = Math.max(min, width);
    let h = Math.max(min, height);

    if (nx + w > 1) w = 1 - nx;
    if (ny + h > 1) h = 1 - ny;

    if (nx + w > 1) nx = 1 - w;
    if (ny + h > 1) ny = 1 - h;

    return {
      x: clampUnit(nx),
      y: clampUnit(ny),
      width: clampUnit(w),
      height: clampUnit(h),
      rotation
    };
  }

  function angleDeg(from: { x: number; y: number }, to: { x: number; y: number }) {
    return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  }

  function finalizeRect(side: "left" | "right", rect: MarkerRect) {
    const normalized = normalizeRect(rect, side === "left" ? DEFAULT_LEFT_RECT : DEFAULT_RIGHT_RECT);
    const quad = rectToQuad(normalized);
    setMockupConfig((prev) =>
      side === "left"
        ? { ...prev, left_rect: normalized, left_quad: quad }
        : { ...prev, right_rect: normalized, right_quad: quad }
    );
  }

  function startResizeByHandle(
    side: "left" | "right",
    axis: "width" | "height",
    edge: "start" | "end",
    clientX: number,
    clientY: number
  ) {
    const pos = toUnitPosition(clientX, clientY);
    if (!pos) return;
    const base = side === "left" ? mockupConfig.left_rect : mockupConfig.right_rect;
    if (!base) return;
    setResizeDrag({ side, axis, edge, start: pos, base });
  }

  function startMoveByDrag(side: "left" | "right", clientX: number, clientY: number) {
    const pos = toUnitPosition(clientX, clientY);
    if (!pos) return;
    const base = side === "left" ? mockupConfig.left_rect : mockupConfig.right_rect;
    if (!base) return;
    setMoveDrag({ side, start: pos, base });
  }

  function startRotateByHandle(side: "left" | "right", clientX: number, clientY: number) {
    const pos = toUnitPosition(clientX, clientY);
    if (!pos) return;
    const base = side === "left" ? mockupConfig.left_rect : mockupConfig.right_rect;
    if (!base) return;
    setRotateDrag({ side, start: pos, base });
  }

  function handlePointModeClick(clientX: number, clientY: number) {
    if (!mockupConfig.template_data) return;
    if (moveDrag || resizeDrag || rotateDrag) return;
    const currentRect = markerSide === "left" ? mockupConfig.left_rect : mockupConfig.right_rect;
    if (currentRect && pointDraft.length === 0) return;
    const pos = toUnitPosition(clientX, clientY);
    if (!pos) return;

    setPointDraft((prev) => {
      const next = [...prev, pos].slice(0, 4);
      if (next.length < 4) return next;

      const [p1, p2, p3, p4] = next;
      const cx = (p1.x + p2.x + p3.x + p4.x) / 4;
      const cy = (p1.y + p2.y + p3.y + p4.y) / 4;
      const w = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const h = Math.hypot(p3.x - p2.x, p3.y - p2.y);
      const angle = angleDeg(p1, p2);
      const rect = fitRect(cx - w / 2, cy - h / 2, w, h, angle);
      const quad: MarkerQuad = {
        tl: normalizePoint(p1),
        tr: normalizePoint(p2),
        br: normalizePoint(p3),
        bl: normalizePoint(p4)
      };
      setMockupConfig((prev) =>
        markerSide === "left"
          ? { ...prev, left_rect: rect, left_quad: quad }
          : { ...prev, right_rect: rect, right_quad: quad }
      );
      return [];
    });
  }

  async function createOrder() {
    if (!supabase) {
      setStatus("Supabase nao configurado.");
      return;
    }
    if (!orderId.trim()) {
      setStatus("Informe o ID do calendario.");
      return;
    }
    if (!imageData) {
      setStatus("Selecione a imagem da arte.");
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      setStatus("Usuario nao autenticado.");
      return;
    }

    setSavingNew(true);
    const { error } = await supabase.from("calendar_orders").insert({
      user_id: userId,
      order_id: orderId.trim(),
      image_data: imageData,
      printed: false
    });

    if (error) {
      setStatus(error.message);
      setSavingNew(false);
      return;
    }

    setOrderId("");
    setImageData("");
    setShowNewModal(false);
    setStatus("Calendario criado com sucesso.");
    setSavingNew(false);
    await loadOrders();
  }

  async function saveMockup() {
    if (!supabase) {
      setStatus("Supabase nao configurado.");
      return;
    }
    setSavingMockup(true);
    const { error } = await supabase.from("app_settings").upsert({
      id: CALENDAR_MOCKUP_SETTINGS_ID,
      config_data: mockupConfig
    });

    setSavingMockup(false);

    if (error) {
      setStatus(`Erro ao salvar mockup: ${error.message}`);
      return;
    }

    setShowMockupModal(false);
    setStatus("Configuracao de mockup salva.");
  }

  async function togglePrinted(item: CalendarOrder) {
    if (!supabase) return;
    const { error } = await supabase
      .from("calendar_orders")
      .update({ printed: !item.printed })
      .eq("id", item.id);

    if (error) {
      setStatus(error.message);
      return;
    }
    await loadOrders();
  }

  async function removeOrder(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("calendar_orders").delete().eq("id", id);
    if (error) {
      setStatus(error.message);
      return;
    }
    await loadOrders();
  }

  async function openMockup(item: CalendarOrder) {
    if (!mockupConfig.template_data) {
      window.open(item.image_data, "_blank", "noopener,noreferrer");
      return;
    }

    const leftRect = mockupConfig.left_rect ? normalizeRect(mockupConfig.left_rect, DEFAULT_LEFT_RECT) : null;
    const rightRect = mockupConfig.right_rect ? normalizeRect(mockupConfig.right_rect, DEFAULT_RIGHT_RECT) : null;
    const leftQuad = normalizeQuad(mockupConfig.left_quad) || (leftRect ? rectToQuad(leftRect) : null);
    const rightQuad = normalizeQuad(mockupConfig.right_quad) || (rightRect ? rectToQuad(rightRect) : null);
    try {
      const templateImg = await loadImageFromDataUrl(mockupConfig.template_data);
      const artImg = await loadImageFromDataUrl(item.image_data);

      const canvas = document.createElement("canvas");
      canvas.width = templateImg.naturalWidth || templateImg.width;
      canvas.height = templateImg.naturalHeight || templateImg.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(templateImg, 0, 0, canvas.width, canvas.height);

      const drawTextureTriangle = (
        x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
        u0: number, v0: number, u1: number, v1: number, u2: number, v2: number
      ) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(u0, v0);
        ctx.lineTo(u1, v1);
        ctx.lineTo(u2, v2);
        ctx.closePath();
        ctx.clip();

        const det = (x0 * (y1 - y2) - x1 * (y0 - y2) + x2 * (y0 - y1));
        if (det === 0) {
          ctx.restore();
          return;
        }

        const a = (u0 * (y1 - y2) - u1 * (y0 - y2) + u2 * (y0 - y1)) / det;
        const b = (v0 * (y1 - y2) - v1 * (y0 - y2) + v2 * (y0 - y1)) / det;
        const c = (u0 * (x2 - x1) - u1 * (x2 - x0) + u2 * (x1 - x0)) / det;
        const d = (v0 * (x2 - x1) - v1 * (x2 - x0) + v2 * (x1 - x0)) / det;
        const e = (u0 * (x1 * y2 - x2 * y1) - u1 * (x0 * y2 - x2 * y0) + u2 * (x0 * y1 - x1 * y0)) / det;
        const f = (v0 * (x1 * y2 - x2 * y1) - v1 * (x0 * y2 - x2 * y0) + v2 * (x0 * y1 - x1 * y0)) / det;

        ctx.transform(a, b, c, d, e, f);
        ctx.drawImage(artImg, 0, 0);
        ctx.restore();
      };

      const drawWarpedQuad = (q: MarkerQuad) => {
        const p1 = { x: q.tl.x * canvas.width, y: q.tl.y * canvas.height };
        const p2 = { x: q.tr.x * canvas.width, y: q.tr.y * canvas.height };
        const p3 = { x: q.br.x * canvas.width, y: q.br.y * canvas.height };
        const p4 = { x: q.bl.x * canvas.width, y: q.bl.y * canvas.height };

        drawTextureTriangle(
          0, 0, artImg.width, 0, artImg.width, artImg.height,
          p1.x, p1.y, p2.x, p2.y, p3.x, p3.y
        );
        drawTextureTriangle(
          0, 0, 0, artImg.height, artImg.width, artImg.height,
          p1.x, p1.y, p4.x, p4.y, p3.x, p3.y
        );
      };

      if (leftQuad) drawWarpedQuad(leftQuad);
      if (rightQuad) drawWarpedQuad(rightQuad);

      const output = canvas.toDataURL("image/jpeg", 0.92);
      const popup = window.open("", "_blank", "width=1300,height=900");
      if (!popup) return;
      popup.document.write(`
        <!doctype html>
        <html lang="pt-BR">
          <head>
            <meta charset="utf-8" />
            <title>Mockup - ${item.order_id}</title>
            <style>
              html, body { margin: 0; background: #0b1020; min-height: 100%; display: grid; place-items: center; }
              img { max-width: 95vw; max-height: 95vh; object-fit: contain; background: #fff; border-radius: 8px; }
            </style>
          </head>
          <body>
            <img src="${output}" alt="Mockup ${item.order_id}" />
          </body>
        </html>
      `);
      popup.document.close();
    } catch (e) {
      setStatus(`Erro ao gerar mockup: ${(e as Error).message}`);
    }
  }

  const activeRect = markerSide === "left" ? mockupConfig.left_rect : mockupConfig.right_rect;

  return (
    <section className="calendar-flow-page">
      <div className="calendar-flow-header">
        <div>
          <h2>
            <span className="calendar-title-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M7 8V4h10v4" />
                <rect x="4" y="8" width="16" height="8" rx="2" />
                <rect x="7" y="14" width="10" height="6" rx="1.5" />
                <circle cx="17" cy="11" r="0.9" fill="currentColor" stroke="none" />
              </svg>
            </span>
            Fluxo de Impressao
          </h2>
          <p>Gerencie as artes, gere PDFs e controle o status de impressao.</p>
        </div>
        <div className="calendar-flow-header-actions">
          <button className="calendar-btn-dark" type="button" onClick={() => setShowBatchModal(true)}>
            <span className="calendar-btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="4" width="14" height="4" rx="1" />
                <rect x="4" y="9" width="16" height="6" rx="1.5" />
                <rect x="6" y="15" width="12" height="5" rx="1" />
              </svg>
            </span>
            Impressao em lote
          </button>
          <button className="calendar-btn-dark" type="button" onClick={() => setShowMockupModal(true)}>
            <span className="calendar-btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M9 6l1.2-1.8h3.6L15 6h3a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h3z" />
                <circle cx="12" cy="12" r="3.1" />
              </svg>
            </span>
            Configurar Mockup
          </button>
          <button className="calendar-btn-pink" type="button" onClick={() => setShowNewModal(true)}>
            <span className="calendar-btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </span>
            Novo Calendario
          </button>
        </div>
      </div>

      <div className="calendar-flow-tabs">
        <button
          type="button"
          className={tab === "todo" ? "tab-item active" : "tab-item"}
          onClick={() => setTab("todo")}
        >
          A Fazer
        </button>
        <button
          type="button"
          className={tab === "printed" ? "tab-item active" : "tab-item"}
          onClick={() => setTab("printed")}
        >
          Impresso
        </button>
      </div>

      {loading && <p className="page-text">Carregando calendario...</p>}
      {status && <p className="page-text">{status}</p>}

      {!loading && (
        <div className="calendar-flow-grid">
          {filtered.length === 0 && (
            <div className="calendar-empty">
              Nenhum item nesta etapa.
            </div>
          )}

          {filtered.map((item) => (
            <article key={item.id} className="calendar-card">
              <div className="calendar-card-head">
                <strong>ID: #{item.order_id}</strong>
                <span>{formatDate(item.created_at)}</span>
              </div>

              <div className="calendar-thumb-wrap">
                <img src={item.image_data} alt={`Arte ${item.order_id}`} className="calendar-thumb" />
              </div>

              <button className="calendar-mark-btn" type="button" onClick={() => togglePrinted(item)}>
                <span className="calendar-mark-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M6 12l4 4 8-8" />
                  </svg>
                </span>
                {item.printed ? "Voltar para A Fazer" : "Marcar Impresso"}
              </button>

              <div className="calendar-card-actions">
                <button className="calendar-pdf-btn" type="button" onClick={() => void openPrintGrid(item.order_id, item.image_data)}>
                  PDF 28x
                </button>
                <button className="calendar-mockup-btn" type="button" onClick={() => openMockup(item)}>
                  Mockup
                </button>
              </div>

              <button className="calendar-delete-link" type="button" onClick={() => removeOrder(item.id)}>
                Excluir Arte
              </button>
            </article>
          ))}
        </div>
      )}

      {showNewModal && (
        <div className="modal-backdrop" onClick={() => setShowNewModal(false)}>
          <div className="product-modal calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-head">
              <h3>Novo Calendario</h3>
              <button type="button" onClick={() => setShowNewModal(false)}>Fechar</button>
            </div>

            <div className="form-grid two-col">
              <label className="field">
                <span>ID</span>
                <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Ex: ff" />
              </label>
              <label className="field">
                <span>Imagem</span>
                <input type="file" accept="image/*" onChange={(e) => onSelectFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            {imageData && (
              <div className="calendar-modal-preview">
                <img src={imageData} alt="Preview nova arte" />
              </div>
            )}

            <div className="actions-row">
              <button className="primary-btn" type="button" disabled={savingNew} onClick={createOrder}>
                {savingNew ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBatchModal && (
        <div className="modal-backdrop" onClick={() => setShowBatchModal(false)}>
          <div className="product-modal calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-head">
              <h3>Impressao em Lote</h3>
              <button type="button" onClick={() => setShowBatchModal(false)}>Fechar</button>
            </div>

            <p className="page-text">
              Selecione as artes e informe a quantidade de folhas para cada uma.
            </p>

            <div className="table-wrap">
              <table className="table clean">
                <thead>
                  <tr>
                    <th>Sel.</th>
                    <th>Pedido</th>
                    <th>Titulo</th>
                    <th>Folhas</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Nenhuma arte disponivel nesta aba.</td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(batchPlan[item.id]?.selected)}
                            onChange={(e) => toggleBatchSelect(item.id, e.target.checked)}
                          />
                        </td>
                        <td>#{item.order_id}</td>
                        <td>{item.order_id}</td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            className="table-input"
                            value={batchPlan[item.id]?.sheets ?? 1}
                            onChange={(e) => setBatchSheets(item.id, Number(e.target.value))}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="actions-row">
              <button className="ghost-btn" type="button" onClick={() => setShowBatchModal(false)}>
                Cancelar
              </button>
              <button className="primary-btn" type="button" onClick={() => void runBatchPrint()}>
                Gerar e Imprimir Lote
              </button>
            </div>
          </div>
        </div>
      )}

      {showMockupModal && (
        <div className="modal-backdrop" onClick={() => setShowMockupModal(false)}>
          <div className="product-modal calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-head">
              <h3>Configurar Mockup</h3>
              <button type="button" onClick={() => setShowMockupModal(false)}>Fechar</button>
            </div>

            <div className="mockup-config-layout">
              <div className="mockup-config-left">
                <label className="field">
                  <span>Template</span>
                  <input type="file" accept="image/*" onChange={(e) => onSelectMockupTemplate(e.target.files?.[0] || null)} />
                </label>

                <div className="mockup-marker-toolbar">
                  <button
                    type="button"
                    className={markerSide === "left" ? "chip active" : "chip"}
                    onClick={() => setMarkerSide("left")}
                  >
                    Marcar Esquerda
                  </button>
                  <button
                    type="button"
                    className={markerSide === "right" ? "chip active" : "chip"}
                    onClick={() => setMarkerSide("right")}
                  >
                    Marcar Direita
                  </button>
                  {pointDraft.length > 0 && (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => setPointDraft([])}
                    >
                      Limpar Pontos
                    </button>
                  )}
                </div>

                <p className="page-text">
                  Modo 4 pontos: clique nos 4 cantos da capa {markerSide === "left" ? "esquerda" : "direita"} em sequencia.
                  Depois ajuste largura e altura arrastando as alcas laterais do quadro.
                </p>
                <p className="page-text">
                  Orientacao: arraste o quadro para mover. Alcas: esquerda/direita ajustam largura, cima/baixo ajustam altura e a bolinha superior gira.
                </p>

                <div
                  ref={markerSurfaceRef}
                  className="mockup-marker-surface"
                  style={{ aspectRatio: String(templateRatio || 16 / 9) }}
                  onClick={(e) => handlePointModeClick(e.clientX, e.clientY)}
                >
                  {mockupConfig.template_data ? (
                    <img src={mockupConfig.template_data} alt="Template mockup" className="mockup-template-preview" />
                  ) : (
                    <div className="mockup-template-empty">Carregue uma imagem template para comecar.</div>
                  )}

                  {mockupConfig.template_data && (
                    <>
                      {mockupConfig.left_rect && (
                        <div
                          className="mockup-marker left"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            startMoveByDrag("left", e.clientX, e.clientY);
                          }}
                          style={{
                            left: `${mockupConfig.left_rect.x * 100}%`,
                            top: `${mockupConfig.left_rect.y * 100}%`,
                            width: `${mockupConfig.left_rect.width * 100}%`,
                            height: `${mockupConfig.left_rect.height * 100}%`,
                            transform: `rotate(${mockupConfig.left_rect.rotation || 0}deg)`
                          }}
                        >
                          Esq
                          <button
                            type="button"
                            className="mockup-rotate-handle"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startRotateByHandle("left", e.clientX, e.clientY);
                            }}
                            aria-label="Girar marcador esquerdo"
                          />
                          <button
                            type="button"
                            className="mockup-resize-handle right"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startResizeByHandle("left", "width", "end", e.clientX, e.clientY);
                            }}
                            aria-label="Ajustar direita marcador esquerdo"
                          />
                          <button
                            type="button"
                            className="mockup-resize-handle left"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startResizeByHandle("left", "width", "start", e.clientX, e.clientY);
                            }}
                            aria-label="Ajustar esquerda marcador esquerdo"
                          />
                          <button
                            type="button"
                            className="mockup-resize-handle bottom"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startResizeByHandle("left", "height", "end", e.clientX, e.clientY);
                            }}
                            aria-label="Ajustar baixo marcador esquerdo"
                          />
                          <button
                            type="button"
                            className="mockup-resize-handle top"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startResizeByHandle("left", "height", "start", e.clientX, e.clientY);
                            }}
                            aria-label="Ajustar cima marcador esquerdo"
                          />
                        </div>
                      )}
                      {mockupConfig.right_rect && (
                        <div
                          className="mockup-marker right"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            startMoveByDrag("right", e.clientX, e.clientY);
                          }}
                          style={{
                            left: `${mockupConfig.right_rect.x * 100}%`,
                            top: `${mockupConfig.right_rect.y * 100}%`,
                            width: `${mockupConfig.right_rect.width * 100}%`,
                            height: `${mockupConfig.right_rect.height * 100}%`,
                            transform: `rotate(${mockupConfig.right_rect.rotation || 0}deg)`
                          }}
                        >
                          Dir
                          <button
                            type="button"
                            className="mockup-rotate-handle"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startRotateByHandle("right", e.clientX, e.clientY);
                            }}
                            aria-label="Girar marcador direito"
                          />
                          <button
                            type="button"
                            className="mockup-resize-handle right"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startResizeByHandle("right", "width", "end", e.clientX, e.clientY);
                            }}
                            aria-label="Ajustar direita marcador direito"
                          />
                          <button
                            type="button"
                            className="mockup-resize-handle left"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startResizeByHandle("right", "width", "start", e.clientX, e.clientY);
                            }}
                            aria-label="Ajustar esquerda marcador direito"
                          />
                          <button
                            type="button"
                            className="mockup-resize-handle bottom"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startResizeByHandle("right", "height", "end", e.clientX, e.clientY);
                            }}
                            aria-label="Ajustar baixo marcador direito"
                          />
                          <button
                            type="button"
                            className="mockup-resize-handle top"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startResizeByHandle("right", "height", "start", e.clientX, e.clientY);
                            }}
                            aria-label="Ajustar cima marcador direito"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {pointDraft.length > 0 && (
                    <svg className="mockup-points-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                      {pointDraft.length >= 2 && (
                        <polyline
                          points={pointDraft.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
                          fill="none"
                          stroke="#f43f5e"
                          strokeWidth="3"
                        />
                      )}
                      {pointDraft.map((p, idx) => (
                        <circle key={`${p.x}-${p.y}-${idx}`} cx={p.x * 1000} cy={p.y * 1000} r="7" fill="#f43f5e" />
                      ))}
                    </svg>
                  )}

                  {activeRect && (
                    <>
                      <div
                        className="mockup-guide-line vertical"
                        style={{ left: `${(activeRect.x + activeRect.width / 2) * 100}%` }}
                      />
                      <div
                        className="mockup-guide-line horizontal"
                        style={{ top: `${(activeRect.y + activeRect.height / 2) * 100}%` }}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="mockup-config-right">
                <p className="mockup-json-label">Config JSON</p>
                <textarea
                  className="mockup-json"
                  readOnly
                  value={JSON.stringify(mockupConfig, null, 2)}
                />
              </div>
            </div>

            <div className="actions-row">
              <button
                className="ghost-btn"
                type="button"
                onClick={() =>
                  setMockupConfig((prev) => ({
                    ...prev,
                    left_rect: null,
                    right_rect: null,
                    left_quad: null,
                    right_quad: null
                  }))
                }
              >
                Limpar Marcacoes
              </button>
              <button className="primary-btn" type="button" disabled={savingMockup} onClick={saveMockup}>
                {savingMockup ? "Salvando..." : "Salvar configuracao"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
