import { useEffect, useMemo, useState } from "react";

type BcsPreset = {
  id: string;
  brightness: number;
  contrast: number;
  saturation: number;
};

type RenderedPreset = BcsPreset & {
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

function applyBCSToImage(image: HTMLImageElement, preset: BcsPreset): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return image.src;

  ctx.filter = `brightness(${preset.brightness}%) contrast(${preset.contrast}%) saturate(${preset.saturation}%)`;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.filter = "none";
  return canvas.toDataURL("image/jpeg", 0.92);
}

function formatPresetLabel(preset: BcsPreset) {
  return `B ${preset.brightness}% | C ${preset.contrast}% | S ${preset.saturation}%`;
}

function openPrintPdf(rows: RenderedPreset[]) {
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
          <p>Variacoes de Brilho, Contraste e Saturacao para calibracao visual.</p>
        </header>
        <section class="grid">${tiles}</section>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  popup.document.close();
}

const PRESETS: BcsPreset[] = [
  { id: "p1", brightness: 80, contrast: 80, saturation: 80 },
  { id: "p2", brightness: 85, contrast: 90, saturation: 90 },
  { id: "p3", brightness: 90, contrast: 95, saturation: 95 },
  { id: "p4", brightness: 95, contrast: 100, saturation: 100 },
  { id: "p5", brightness: 100, contrast: 100, saturation: 100 },
  { id: "p6", brightness: 105, contrast: 100, saturation: 95 },
  { id: "p7", brightness: 110, contrast: 105, saturation: 100 },
  { id: "p8", brightness: 115, contrast: 110, saturation: 105 },
  { id: "p9", brightness: 120, contrast: 120, saturation: 110 },
  { id: "p10", brightness: 80, contrast: 110, saturation: 110 },
  { id: "p11", brightness: 85, contrast: 115, saturation: 120 },
  { id: "p12", brightness: 90, contrast: 120, saturation: 130 },
  { id: "p13", brightness: 95, contrast: 105, saturation: 110 },
  { id: "p14", brightness: 100, contrast: 110, saturation: 120 },
  { id: "p15", brightness: 105, contrast: 115, saturation: 130 },
  { id: "p16", brightness: 110, contrast: 120, saturation: 140 },
  { id: "p17", brightness: 115, contrast: 110, saturation: 120 },
  { id: "p18", brightness: 120, contrast: 105, saturation: 110 },
  { id: "p19", brightness: 80, contrast: 80, saturation: 120 },
  { id: "p20", brightness: 90, contrast: 90, saturation: 110 },
  { id: "p21", brightness: 100, contrast: 95, saturation: 105 },
  { id: "p22", brightness: 110, contrast: 90, saturation: 95 },
  { id: "p23", brightness: 120, contrast: 85, saturation: 90 },
  { id: "p24", brightness: 110, contrast: 100, saturation: 120 },
  { id: "p25", brightness: 90, contrast: 100, saturation: 130 }
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
          dataUrl: applyBCSToImage(image, preset)
        }));
        if (!active) return;
        setRendered(next);
        setStatus(`${next.length} variacoes de brilho/contraste/saturacao geradas.`);
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
            Envie uma imagem e gere uma grade de variacoes por brilho, contraste e saturacao.
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
            onClick={() => openPrintPdf(rendered)}
          >
            Gerar PDF de impressao
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
