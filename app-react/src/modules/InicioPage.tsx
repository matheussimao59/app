import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { UiIcon } from "../components/UiIcon";

type ShippingOrder = {
  id: string;
  ad_name: string;
  image_url: string | null;
  observations: string | null;
  source_file_name: string | null;
  updated_at: string;
  row_raw: Record<string, unknown> | null;
};

function toYmd(year: number, month: number, day: number) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function normalizeDateToYmd(value: unknown): string {
  if (value == null) return "";
  const raw = String(value || "").trim();
  if (!raw) return "";

  const ymd = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) return toYmd(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const dmy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) return toYmd(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return toYmd(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function shippingDateFromRaw(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object") return "";
  const candidates = [raw.shipping_deadline, raw.prazo_de_envio, raw.prazo_envio, raw.data_de_envio, raw.data_envio];
  for (const value of candidates) {
    const ymd = normalizeDateToYmd(value);
    if (ymd) return ymd;
  }
  return "";
}

function isPacked(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object") return false;
  return raw.packed === true;
}

function isProductionSeparated(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object") return false;
  return raw.production_separated === true;
}

export function InicioPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ShippingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!supabase) {
        setError("Supabase nao configurado.");
        setLoading(false);
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) {
        setError("Usuario nao autenticado.");
        setLoading(false);
        return;
      }

      const { data, error: queryError } = await supabase
        .from("ml_shipping_orders")
        .select("id, ad_name, image_url, observations, source_file_name, updated_at, row_raw")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(2000);

      if (!mounted) return;

      if (queryError) {
        setError(queryError.message);
        setOrders([]);
      } else {
        setOrders((data || []) as ShippingOrder[]);
        setError(null);
      }
      setLoading(false);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const todayYmd = toYmd(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

  const stats = useMemo(() => {
    const ordersToday = orders.filter((row) => shippingDateFromRaw(row.row_raw) === todayYmd);
    const packedToday = ordersToday.filter((row) => isPacked(row.row_raw));
    const pendingPackingToday = ordersToday.filter((row) => !isPacked(row.row_raw));
    const productionPendingToday = ordersToday.filter((row) => !isProductionSeparated(row.row_raw));
    const noDate = orders.filter((row) => !shippingDateFromRaw(row.row_raw));
    const withObservationsToday = ordersToday.filter((row) => String(row.observations || "").trim().length > 0);

    const recentUpdates = [...orders]
      .slice(0, 6)
      .map((row) => ({
        id: row.id,
        adName: row.ad_name || "Produto sem nome",
        fileName: row.source_file_name || "Sem arquivo",
        updatedAt: row.updated_at
      }));

    return {
      ordersToday: ordersToday.length,
      packedToday: packedToday.length,
      pendingPackingToday: pendingPackingToday.length,
      productionPendingToday: productionPendingToday.length,
      noDate: noDate.length,
      withObservationsToday: withObservationsToday.length,
      recentUpdates
    };
  }, [orders, todayYmd]);

  const heroImage = useMemo(() => {
    const firstWithImage = orders.find((row) => (row.image_url || "").trim().length > 0);
    if (firstWithImage?.image_url) return firstWithImage.image_url;
    const fromRaw = orders
      .map((row) => (row.row_raw && typeof row.row_raw === "object" ? String(row.row_raw.image_url || "") : ""))
      .find((url) => url.trim().length > 0);
    return fromRaw || "";
  }, [orders]);

  return (
    <section className="page inicio-page">
      <div className="section-head row-between">
        <div>
          <h2 className="title-with-icon"><span className="title-icon" aria-hidden><UiIcon id="inicio" /></span>Inicio</h2>
          <p className="page-text">Painel principal para abrir o fluxo rapido do dia.</p>
        </div>
      </div>

      <article className="inicio-hero">
        <div className="inicio-hero-left">
          <p className="eyebrow">Painel principal</p>
          <h3>Fluxo rapido do dia</h3>
          <p>Use os atalhos para importar, separar producao e embalar pedidos com menos cliques.</p>
          <div className="inicio-hero-chips">
            <span>📦 {stats.ordersToday} pedidos hoje</span>
            <span>✅ {stats.packedToday} embalados</span>
            <span>⚠️ {stats.pendingPackingToday} pendentes</span>
          </div>
        </div>
        <div className="inicio-hero-right">
          {heroImage ? (
            <img src={heroImage} alt="Produto recente" className="inicio-hero-image" />
          ) : (
            <div className="inicio-hero-image empty">Sem imagem</div>
          )}
        </div>
      </article>

      <div className="kpi-grid kpi-grid-4 inicio-kpis">
        <article className="kpi-card elevated">
          <p><span className="inicio-kpi-icon">🧾</span>Pedidos de hoje</p>
          <strong>{stats.ordersToday}</strong>
        </article>
        <article className="kpi-card elevated">
          <p><span className="inicio-kpi-icon">📌</span>Pendentes de embalar</p>
          <strong>{stats.pendingPackingToday}</strong>
        </article>
        <article className="kpi-card elevated">
          <p><span className="inicio-kpi-icon">📦</span>Embalados hoje</p>
          <strong>{stats.packedToday}</strong>
        </article>
        <article className="kpi-card elevated">
          <p><span className="inicio-kpi-icon">🛠️</span>Producao pendente</p>
          <strong>{stats.productionPendingToday}</strong>
        </article>
      </div>

      <div className="ml-ops-hub-grid inicio-quick-grid">
        <Link to="/mercado-livre/importacao" className="ml-ops-hub-card is-importacao">
          <span className="inicio-action-icon" aria-hidden>⬆️</span>
          <strong>Importar lista</strong>
          <p>Subir planilha e salvar pedidos.</p>
        </Link>
        <Link to="/mercado-livre/pedidos-envio" className="ml-ops-hub-card is-pedidos">
          <span className="inicio-action-icon" aria-hidden>🚚</span>
          <strong>Pedidos de envio</strong>
          <p>Conferencia por rastreio e embalagem.</p>
        </Link>
        <button type="button" className="ml-ops-hub-card ml-ops-hub-card-btn is-separacao" onClick={() => navigate("/mercado-livre/pedidos-envio?scanner=1")}>
          <span className="inicio-action-icon" aria-hidden>📷</span>
          <strong>Abrir scanner</strong>
          <p>Vai direto para leitura em tela cheia.</p>
        </button>
        <Link to="/mercado-livre/separacao-producao" className="ml-ops-hub-card is-calendario">
          <span className="inicio-action-icon" aria-hidden>🧩</span>
          <strong>Separacao de producao</strong>
          <p>Agrupar e marcar pedidos separados.</p>
        </Link>
      </div>

      <div className="ops-grid inicio-alerts-grid">
        <article className="ops-card">
          <h3>Alertas</h3>
          {loading ? (
            <p className="page-text">Carregando alertas...</p>
          ) : error ? (
            <p className="error-text">{error}</p>
          ) : (
            <ul className="task-list">
              <li>📅 Pedidos sem data de envio: {stats.noDate}</li>
              <li>📝 Pedidos com observacao hoje: {stats.withObservationsToday}</li>
              <li>📦 Pendentes de embalagem hoje: {stats.pendingPackingToday}</li>
            </ul>
          )}
        </article>

        <article className="ops-card">
          <h3>Ultimas atualizacoes</h3>
          {stats.recentUpdates.length === 0 ? (
            <p className="page-text">Sem movimentacao recente.</p>
          ) : (
            <div className="mini-list">
              {stats.recentUpdates.map((item) => (
                <div key={item.id} className="mini-list-item">
                  <div>
                    <strong>{item.adName}</strong>
                    <p className="page-text">{item.fileName}</p>
                  </div>
                  <span>{new Date(item.updatedAt).toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
