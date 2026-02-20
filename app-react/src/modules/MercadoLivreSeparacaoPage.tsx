import { useMemo, useState } from "react";

type ImportedRow = {
  rowId: string;
  orderId: string;
  adName: string;
  productQty: number;
  sku: string;
  buyer: string;
  saleDate: string;
};

type GroupedRow = {
  key: string;
  productName: string;
  perAdUnits: number;
  cartQty: number;
  productionQty: number;
  ordersCount: number;
  sku: string;
};

type SheetJsModule = {
  read: (data: ArrayBuffer, options: { type: "array" }) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (sheet: unknown, options: { header: 1; defval: string | number }) => unknown[][];
  };
};

function normalizeKey(text?: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fmtDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function extractUnitsFromTitle(title?: string) {
  const text = String(title || "");
  if (!text) return 1;

  const patterns = [
    /\bc\s*\/\s*(\d{1,4})\s*und\b/i,
    /\bc\s*\/\s*(\d{1,4})\b/i,
    /\b(\d{1,4})\s*und\b/i,
    /\bkit\s*(\d{1,4})\s*un\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  return 1;
}

function cleanProductName(title?: string) {
  let text = String(title || "").trim();
  if (!text) return "Produto sem titulo";

  text = text
    .replace(/\s*[-–]\s*c\s*\/\s*\d+\s*und\s*$/i, "")
    .replace(/\s*\(\s*c\s*\/\s*\d+\s*und\s*\)\s*$/i, "")
    .replace(/\s*[-–]\s*\d+\s*und\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text || String(title || "Produto sem titulo");
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
  const normalizedHeaders = headers.map((h) => normalizeKey(h));
  for (const alias of aliases) {
    const idx = normalizedHeaders.findIndex((h) => h.includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

async function loadSheetJs(): Promise<SheetJsModule> {
  const remoteUrl = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";
  const mod = await import(/* @vite-ignore */ remoteUrl);
  return mod as unknown as SheetJsModule;
}

function parseRowsFromGrid(grid: unknown[][]): ImportedRow[] {
  if (!grid.length) return [];

  const headerRow = (grid[0] || []).map((h) => String(h || "").trim());

  const idxOrderId = guessColumnIndex(headerRow, ["pedido", "order", "numero do pedido", "n do pedido"]);
  const idxAdName = guessColumnIndex(headerRow, ["nome do anuncio", "titulo", "anuncio", "item title"]);
  const idxQty = guessColumnIndex(headerRow, ["qtd do produto", "quantidade", "qty", "qtd"]);
  const idxSku = guessColumnIndex(headerRow, ["sku", "seller sku", "seller_sku"]);
  const idxBuyer = guessColumnIndex(headerRow, ["comprador", "cliente", "buyer"]);
  const idxDate = guessColumnIndex(headerRow, ["data", "date", "data da venda", "sale date"]);

  if (idxAdName < 0 || idxQty < 0) {
    throw new Error("Colunas obrigatorias nao encontradas. Precisa ter: Nome do Anuncio e Qtd. do Produto.");
  }

  const rows: ImportedRow[] = [];
  for (let i = 1; i < grid.length; i += 1) {
    const row = grid[i] || [];
    const adName = String(row[idxAdName] || "").trim();
    if (!adName) continue;

    const qty = Math.max(1, Math.floor(valueAsNumber(row[idxQty]) || 1));

    rows.push({
      rowId: `${i}-${Math.random().toString(36).slice(2, 8)}`,
      orderId: idxOrderId >= 0 ? String(row[idxOrderId] || "-").trim() || "-" : "-",
      adName,
      productQty: qty,
      sku: idxSku >= 0 ? String(row[idxSku] || "-").trim() || "-" : "-",
      buyer: idxBuyer >= 0 ? String(row[idxBuyer] || "-").trim() || "-" : "-",
      saleDate: idxDate >= 0 ? String(row[idxDate] || "").trim() : ""
    });
  }

  return rows;
}

export function MercadoLivreSeparacaoPage() {
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  async function importFile(file: File | null) {
    if (!file) return;

    setLoadingFile(true);
    setError(null);

    try {
      const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.type.includes("sheet");
      if (!isXlsx) {
        throw new Error("Arquivo invalido. Envie um arquivo .xlsx exportado da lista de pedidos.");
      }

      const buffer = await file.arrayBuffer();
      const XLSX = await loadSheetJs();
      const wb = XLSX.read(buffer, { type: "array" });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) throw new Error("Arquivo sem planilha.");

      const firstSheet = wb.Sheets[firstSheetName];
      const grid = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
      const parsed = parseRowsFromGrid(grid);
      if (parsed.length === 0) {
        throw new Error("Nenhum pedido valido encontrado na planilha.");
      }

      setRows(parsed);
      setFileName(file.name);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao importar arquivo.";
      setError(message);
      setRows([]);
      setFileName("");
    } finally {
      setLoadingFile(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, GroupedRow>();

    for (const row of rows) {
      const perAdUnits = extractUnitsFromTitle(row.adName);
      const productName = cleanProductName(row.adName);
      const key = normalizeKey(productName);
      const current = map.get(key) || {
        key,
        productName,
        perAdUnits,
        cartQty: 0,
        productionQty: 0,
        ordersCount: 0,
        sku: row.sku
      };

      current.cartQty += row.productQty;
      current.productionQty += row.productQty * perAdUnits;
      current.ordersCount += 1;
      if (current.sku === "-" && row.sku !== "-") current.sku = row.sku;
      map.set(key, current);
    }

    return [...map.values()].sort((a, b) => b.productionQty - a.productionQty);
  }, [rows]);

  const totals = useMemo(() => {
    const cartQty = grouped.reduce((acc, item) => acc + item.cartQty, 0);
    const productionQty = grouped.reduce((acc, item) => acc + item.productionQty, 0);
    return {
      importedOrders: rows.length,
      groupedProducts: grouped.length,
      cartQty,
      productionQty
    };
  }, [grouped, rows.length]);

  return (
    <section className="page">
      <div className="section-head row-between">
        <div>
          <h2>Separacao de Producao</h2>
          <p className="page-text">
            Importe a planilha .xlsx de pedidos e o sistema calcula automaticamente o total a produzir por produto.
          </p>
        </div>
      </div>

      <div className="soft-panel ml-upload-panel">
        <p>Importar lista de pedidos (.xlsx)</p>
        <div className="ml-upload-row">
          <label className="primary-btn" style={{ cursor: "pointer" }}>
            {loadingFile ? "Importando..." : "Selecionar arquivo .xlsx"}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void importFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
              disabled={loadingFile}
            />
          </label>
          {fileName && <span className="page-text">Arquivo: {fileName}</span>}
        </div>
        <span className="page-text">
          Colunas obrigatorias: <strong>Nome do Anuncio</strong> e <strong>Qtd. do Produto</strong>.
        </span>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="ml-kpi-grid ml-production-kpis">
        <article className="kpi-card">
          <p>Linhas importadas</p>
          <strong>{totals.importedOrders}</strong>
          <span>Itens lidos da planilha</span>
        </article>
        <article className="kpi-card">
          <p>Produtos agrupados</p>
          <strong>{totals.groupedProducts}</strong>
          <span>Agrupado por nome do anuncio</span>
        </article>
        <article className="kpi-card">
          <p>Qtd no carrinho</p>
          <strong>{totals.cartQty}</strong>
          <span>Soma da coluna Qtd. do Produto</span>
        </article>
        <article className="kpi-card">
          <p>Total para produzir</p>
          <strong>{totals.productionQty}</strong>
          <span>C/und do anuncio x qtd comprada</span>
        </article>
      </div>

      <div className="ml-orders-table-wrap">
        <div className="ml-orders-head">
          <h3>Resumo de producao por grupo</h3>
          <span>{grouped.length} grupo(s)</span>
        </div>
        <div className="table-wrap">
          <table className="table clean">
            <thead>
              <tr>
                <th>Produto (grupo)</th>
                <th>SKU</th>
                <th>Und por anuncio</th>
                <th>Qtd carrinho</th>
                <th>Total produzir</th>
                <th>Pedidos</th>
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 ? (
                <tr>
                  <td colSpan={6}>Importe um arquivo .xlsx para visualizar o agrupamento.</td>
                </tr>
              ) : (
                grouped.map((group) => (
                  <tr key={group.key}>
                    <td className="ml-col-title">{group.productName}</td>
                    <td>{group.sku || "-"}</td>
                    <td>{group.perAdUnits}</td>
                    <td>{group.cartQty}</td>
                    <td>
                      <strong>{group.productionQty}</strong>
                    </td>
                    <td>{group.ordersCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ml-orders-table-wrap">
        <div className="ml-orders-head">
          <h3>Detalhes importados</h3>
          <span>{rows.length} linha(s)</span>
        </div>
        <div className="table-wrap">
          <table className="table clean">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Data</th>
                <th>Cliente</th>
                <th>Nome do anuncio</th>
                <th>Qtd produto</th>
                <th>Und anuncio</th>
                <th>Produzir</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>Nenhum dado importado.</td>
                </tr>
              ) : (
                rows.map((row) => {
                  const perAdUnits = extractUnitsFromTitle(row.adName);
                  return (
                    <tr key={row.rowId}>
                      <td className="ml-col-order-id">{row.orderId}</td>
                      <td>{fmtDate(row.saleDate)}</td>
                      <td>{row.buyer || "-"}</td>
                      <td className="ml-col-title">{row.adName}</td>
                      <td>{row.productQty}</td>
                      <td>{perAdUnits}</td>
                      <td>
                        <strong>{row.productQty * perAdUnits}</strong>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
