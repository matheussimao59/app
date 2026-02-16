import { useEffect, useState } from "react";

type BcsPreset = {
  id: string;
  density: number;
  contrast: number;
  saturation: number;
};

type ImageStats = {
  meanLuma: number;
  stdLuma: number;
  meanSat: number;
  clipRatio: number;
};

type RenderedPreset = BcsPreset & {
  dataUrl: string;
  stats: ImageStats;
  score: number;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function analyzeImageData(data: Uint8ClampedArray): ImageStats {
  const pixels = data.length / 4;
  if (pixels <= 0) {
    return { meanLuma: 0, stdLuma: 0, meanSat: 0, clipRatio: 0 };
  }

  let sumL = 0;
  let sumL2 = 0;
  let sumS = 0;
  let clipped = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sumL += luma;
    sumL2 += luma * luma;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max <= 0 ? 0 : (max - min) / max;
    sumS += sat;

    if (data[i] <= 3 || data[i] >= 252 || data[i + 1] <= 3 || data[i + 1] >= 252 || data[i + 2] <= 3 || data[i + 2] >= 252) {
      clipped += 1;
    }
  }

  const meanLuma = sumL / pixels;
  const variance = Math.max(0, sumL2 / pixels - meanLuma * meanLuma);

  return {
    meanLuma,
    stdLuma: Math.sqrt(variance),
    meanSat: sumS / pixels,
    clipRatio: clipped / pixels
  };
}

function calcTargetFromImage(base: ImageStats) {
  const density = clamp(Math.round((0.5 - base.meanLuma) * 60), -20, 20);

  let contrast = 0;
  if (base.stdLuma < 0.18) contrast = clamp(Math.round((0.18 - base.stdLuma) * 120), -20, 20);
  if (base.stdLuma > 0.3) contrast = clamp(-Math.round((base.stdLuma - 0.3) * 120), -20, 20);

  let saturation = 0;
  if (base.meanSat < 0.25) saturation = clamp(Math.round((0.25 - base.meanSat) * 90), -20, 20);
  if (base.meanSat > 0.55) saturation = clamp(-Math.round((base.meanSat - 0.55) * 80), -20, 20);

  return { density, contrast, saturation };
}

function buildPresets(target: { density: number; contrast: number; saturation: number }): BcsPreset[] {
  const offsets = [-10, -5, 0, 5, 10];
  const list: BcsPreset[] = [];

  let idx = 1;
  for (const bo of offsets) {
    for (const co of offsets) {
      const so = Math.round((bo + co) / 2);
      list.push({
        id: `p${idx}`,
        density: clamp(target.density + bo, -20, 20),
        contrast: clamp(target.contrast + co, -20, 20),
        saturation: clamp(target.saturation + so, -20, 20)
      });
      idx += 1;
    }
  }

  const hasNeutral = list.some((p) => p.density === 0 && p.contrast === 0 && p.saturation === 0);
  if (!hasNeutral) {
    list[12] = { id: list[12].id, density: 0, contrast: 0, saturation: 0 };
  }

  const dedup = new Map<string, BcsPreset>();
  for (const p of list) {
    const key = `${p.density}|${p.contrast}|${p.saturation}`;
    if (!dedup.has(key)) dedup.set(key, p);
  }

  const unique = Array.from(dedup.values());
  while (unique.length < 25) {
    unique.push({
      id: `px${unique.length + 1}`,
      density: 0,
      contrast: 0,
      saturation: 0
    });
  }

  return unique.slice(0, 25).map((p, i) => ({ ...p, id: `p${i + 1}` }));
}

function renderPreset(image: HTMLImageElement, preset: BcsPreset): { dataUrl: string; stats: ImageStats } {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      dataUrl: image.src,
      stats: { meanLuma: 0, stdLuma: 0, meanSat: 0, clipRatio: 0 }
    };
  }

  const b = 100 + preset.density;
  const c = 100 + preset.contrast;
  const s = 100 + preset.saturation;

  ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.filter = "none";

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.92),
    stats: analyzeImageData(data)
  };
}

function scorePreset(base: ImageStats, preset: BcsPreset, candidate: ImageStats) {
  const lumaDiff = Math.abs(candidate.meanLuma - base.meanLuma);
  const contrastDiff = Math.abs(candidate.stdLuma - base.stdLuma);
  const satDiff = Math.abs(candidate.meanSat - base.meanSat);
  const clipPenalty = candidate.clipRatio * 3;
  const deltaPenalty = (Math.abs(preset.density) + Math.abs(preset.contrast) + Math.abs(preset.saturation)) / 120;

  return lumaDiff * 2.2 + contrastDiff * 1.8 + satDiff * 1.4 + clipPenalty + deltaPenalty * 0.8;
}

function formatSigned(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatPresetLabel(preset: BcsPreset) {
  return `D ${formatSigned(preset.density)} | C ${formatSigned(preset.contrast)} | S ${formatSigned(preset.saturation)}`;
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
          <p>Ajustes no intervalo Epson: -20 ate +20 em densidade, contraste e saturacao.</p>
        </header>
        <section class="grid">${tiles}</section>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  popup.document.close();
}

export function TesteImpressaoPage() {
  const [sourceDataUrl, setSourceDataUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [rendered, setRendered] = useState<RenderedPreset[]>([]);
  const [recommended, setRecommended] = useState<RenderedPreset[]>([]);

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
        setRecommended([]);
        return;
      }

      setProcessing(true);

      try {
        const image = await loadImage(sourceDataUrl);

        const baseCanvas = document.createElement("canvas");
        baseCanvas.width = image.naturalWidth;
        baseCanvas.height = image.naturalHeight;
        const bctx = baseCanvas.getContext("2d");
        if (!bctx) throw new Error("Falha ao analisar imagem base.");
        bctx.drawImage(image, 0, 0);
        const baseStats = analyzeImageData(
          bctx.getImageData(0, 0, baseCanvas.width, baseCanvas.height).data
        );

        const target = calcTargetFromImage(baseStats);
        const presets = buildPresets(target);

        const rows: RenderedPreset[] = presets.map((preset) => {
          const renderedResult = renderPreset(image, preset);
          const score = scorePreset(baseStats, preset, renderedResult.stats);
          return {
            ...preset,
            dataUrl: renderedResult.dataUrl,
            stats: renderedResult.stats,
            score
          };
        });

        rows.sort((a, b) => a.score - b.score);

        if (!active) return;

        setRendered(rows);
        setRecommended(rows.slice(0, 3));
        setStatus(
          `Analise concluida. Ajuste sugerido alvo: D ${formatSigned(target.density)} | C ${formatSigned(target.contrast)} | S ${formatSigned(target.saturation)}.`
        );
      } catch (error) {
        if (!active) return;
        setStatus((error as Error).message);
        setRendered([]);
        setRecommended([]);
      } finally {
        if (active) setProcessing(false);
      }
    }

    run();
    return () => {
      active = false;
    };
  }, [sourceDataUrl]);

  return (
    <section className="page print-test-page">
      <div className="print-test-head">
        <div>
          <p className="eyebrow">Epson WF-C5390</p>
          <h2>Padrao de Ajuste de Cor</h2>
          <p className="page-text">
            Ajustes limitados ao padrao da impressora: densidade, contraste e saturacao de -20 ate +20.
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
            Imprimir padrao de ajuste (PDF)
          </button>
        </div>
      </div>

      <div className="print-driver-guide">
        <p className="print-driver-guide-title">Como aplicar no driver Epson WF-C5390</p>
        <ol>
          <li>Abrir Preferencias de Impressao da WF-C5390.</li>
          <li>Qualidade: Alta e tipo de papel correto.</li>
          <li>Cor: Ajuste manual (Densidade, Contraste e Saturacao).</li>
          <li>Imprimir este padrao, escolher o melhor bloco e salvar preset.</li>
        </ol>
      </div>

      {status && <p className="page-text">{status}</p>}
      {processing && <p className="page-text">Gerando variacoes e analise automatica...</p>}

      {recommended.length > 0 && (
        <div className="print-reco-box">
          <p className="print-reco-title">Melhores opcoes para fidelidade de cor</p>
          <div className="print-reco-list">
            {recommended.map((item, idx) => (
              <div key={`${item.id}-${idx}`} className="print-reco-item">
                <strong>#{idx + 1}</strong>
                <span>{formatPresetLabel(item)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sourceDataUrl && (
        <div className="print-source-card">
          <p>Imagem base</p>
          <img src={sourceDataUrl} alt="Imagem base para teste" />
        </div>
      )}

      {rendered.length > 0 && (
        <div className="print-grid">
          {rendered.map((row, index) => (
            <article key={row.id} className={index === 0 ? "print-tile best" : "print-tile"}>
              <img src={row.dataUrl} alt={formatPresetLabel(row)} loading="lazy" />
              <p>{formatPresetLabel(row)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
