import { useEffect, useMemo, useState } from "react";

type CmyPreset = {
  id: string;
  c: number;
  m: number;
  y: number;
};

type RenderedPreset = CmyPreset & {
  dataUrl: string;
};

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem."));
    img.src = src;
  });
}

function clamp8(value: number) {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

function applyChannel(value: number, delta: number) {
  if (delta >= 0) {
    return clamp8(value * (1 - delta));
  }
  return clamp8(value + (255 - value) * Math.abs(delta));
}

function applyCMYToImage(image: HTMLImageElement, preset: CmyPreset): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return image.src;

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const buffer = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = buffer.data;

  const c = preset.c / 100;
  const m = preset.m / 100;
  const y = preset.y / 100;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = applyChannel(data[i], c);
    data[i + 1] = applyChannel(data[i + 1], m);
    data[i + 2] = applyChannel(data[i + 2], y);
  }

  ctx.putImageData(buffer, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function formatPresetLabel(preset: CmyPreset) {
  const c = preset.c >= 0 ? `+${preset.c}` : `${preset.c}`;
  const m = preset.m >= 0 ? `+${preset.m}` : `${preset.m}`;
  const y = preset.y >= 0 ? `+${preset.y}` : `${preset.y}`;
  return `C ${c} M ${m} Y ${y}`;
}

function openPrintSheet(rows: RenderedPreset[]) {
  if (!rows.length) return;
  const popup = window.open("", "_blank", "width=1200,height=920");
  if (!popup) return;

  const tiles = rows
    .map(
      (row) => `
      <article class="tile">
        <img src="${row.dataUrl}" alt="${formatPresetLabel(row)}" />
        <p>${formatPresetLabel(row)}</p>
      </article>
    `
    )
    .join("");

  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Teste de Impressao - Epson WF-C5390</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, sans-serif; color: #111; }
          .head { margin-bottom: 8mm; }
          .head h1 { margin: 0; font-size: 14pt; }
          .head p { margin: 2mm 0 0; font-size: 9pt; color: #374151; }
          .grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 3mm;
          }
          .tile {
            border: 0.3mm solid #cbd5e1;
            padding: 1.8mm;
            break-inside: avoid;
          }
          .tile img {
            width: 100%;
            aspect-ratio: 1 / 1;
            object-fit: cover;
            display: block;
          }
          .tile p {
            margin: 1.4mm 0 0;
            font-size: 7.5pt;
            text-align: center;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <header class="head">
          <h1>Teste de Impressao - Epson WF-C5390</h1>
          <p>Variacoes CMY para calibracao visual de cor.</p>
        </header>
        <section class="grid">${tiles}</section>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  popup.document.close();
}

const PRESETS: CmyPreset[] = [
  { id: "p1", c: -20, m: -10, y: 10 },
  { id: "p2", c: -15, m: -5, y: 15 },
  { id: "p3", c: -10, m: -5, y: 15 },
  { id: "p4", c: -5, m: 0, y: 5 },
  { id: "p5", c: 0, m: 0, y: 0 },
  { id: "p6", c: 5, m: 0, y: -5 },
  { id: "p7", c: 10, m: 5, y: -5 },
  { id: "p8", c: 15, m: 5, y: -10 },
  { id: "p9", c: 20, m: 10, y: -10 },
  { id: "p10", c: -20, m: 10, y: -10 },
  { id: "p11", c: -15, m: 15, y: 0 },
  { id: "p12", c: -10, m: 20, y: 10 },
  { id: "p13", c: -5, m: 5, y: 0 },
  { id: "p14", c: 0, m: 10, y: 10 },
  { id: "p15", c: 5, m: 15, y: 15 },
  { id: "p16", c: 10, m: 20, y: 20 },
  { id: "p17", c: 15, m: 10, y: 5 },
  { id: "p18", c: 20, m: 5, y: 0 },
  { id: "p19", c: -20, m: -20, y: -20 },
  { id: "p20", c: -10, m: -10, y: -10 },
  { id: "p21", c: 0, m: -5, y: -5 },
  { id: "p22", c: 10, m: -10, y: -10 },
  { id: "p23", c: 20, m: -20, y: -20 },
  { id: "p24", c: 10, m: 0, y: 10 },
  { id: "p25", c: -10, m: 0, y: 20 }
];

export function TesteImpressaoPage() {
  const [sourceDataUrl, setSourceDataUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [rendered, setRendered] = useState<RenderedPreset[]>([]);

  const presets = useMemo(() => PRESETS, []);

  async function onSelectImage(file: File | null) {
    if (!file) return;
    setStatus(null);
    const url = await toDataUrl(file);
    setSourceDataUrl(url);
  }

  useEffect(() => {
    let active = true;

    async function run() {
      if (!sourceDataUrl) {
        setRendered([]);
        return;
      }
      setProcessing(true);
      try {
        const image = await loadImage(sourceDataUrl);
        const next = presets.map((preset) => ({
          ...preset,
          dataUrl: applyCMYToImage(image, preset)
        }));
        if (!active) return;
        setRendered(next);
        setStatus(`${next.length} variacoes CMY geradas.`);
      } catch (error) {
        if (!active) return;
        setStatus((error as Error).message);
        setRendered([]);
      } finally {
        if (active) setProcessing(false);
      }
    }

    run();
    return () => {
      active = false;
    };
  }, [sourceDataUrl, presets]);

  return (
    <section className="page print-test-page">
      <div className="print-test-head">
        <div>
          <p className="eyebrow">Epson WF-C5390</p>
          <h2>Teste de Impressao</h2>
          <p className="page-text">
            Envie uma imagem e gere uma grade de variacoes CMY para ajuste rapido de cor.
          </p>
        </div>
        <div className="print-test-actions">
          <label className="primary-btn print-upload-btn">
            Subir imagem
            <input type="file" accept="image/*" onChange={(e) => onSelectImage(e.target.files?.[0] || null)} />
          </label>
          <button
            type="button"
            className="ghost-btn"
            disabled={!rendered.length}
            onClick={() => openPrintSheet(rendered)}
          >
            Imprimir testes
          </button>
        </div>
      </div>

      {status && <p className="page-text">{status}</p>}
      {processing && <p className="page-text">Gerando variacoes...</p>}

      {sourceDataUrl && (
        <div className="print-source-card">
          <p>Imagem base</p>
          <img src={sourceDataUrl} alt="Imagem base para teste" />
        </div>
      )}

      {rendered.length > 0 && (
        <div className="print-grid">
          {rendered.map((row) => (
            <article key={row.id} className="print-tile">
              <img src={row.dataUrl} alt={formatPresetLabel(row)} loading="lazy" />
              <p>{formatPresetLabel(row)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
