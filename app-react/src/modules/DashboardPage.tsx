import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type ProductRow = {
  id: string | number;
  product_name: string | null;
  selling_price: number | null;
  base_cost: number | null;
  final_margin: number | null;
  materials_json: unknown;
  created_at?: string;
};

function money(value: number) {
  return (Number(value) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export function DashboardPage() {
  const [items, setItems] = useState<ProductRow[]>([]);
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
        .from("pricing_products")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (queryError) {
        setError(queryError.message);
        setItems([]);
      } else {
        setItems((data || []) as ProductRow[]);
        setError(null);
      }
      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const count = items.length;
    const totalPrice = items.reduce((acc, item) => acc + (Number(item.selling_price) || 0), 0);
    const totalCost = items.reduce((acc, item) => acc + (Number(item.base_cost) || 0), 0);
    const avgMargin =
      count > 0
        ? items.reduce((acc, item) => acc + (Number(item.final_margin) || 0), 0) / count
        : 0;

    return {
      count,
      totalPrice,
      totalCost,
      avgTicket: count > 0 ? totalPrice / count : 0,
      totalProfit: totalPrice - totalCost,
      avgMargin
    };
  }, [items]);

  const topProducts = useMemo(() => {
    return [...items]
      .sort((a, b) => (Number(b.selling_price) || 0) - (Number(a.selling_price) || 0))
      .slice(0, 5);
  }, [items]);

  return (
    <section className="dashboard-stack">
      <article className="hero-card premium">
        <div className="hero-left">
          <p className="eyebrow">Resumo do negocio</p>
          <h2>Painel React com dados reais dos seus produtos</h2>
          <p>
            Visual identico ao padrao original com base no Supabase para acompanhar preco, custo
            e margem dos produtos cadastrados.
          </p>
          <div className="hero-cta-row">
            <Link to="/precificacao" className="primary-link">
              Novo calculo de precificacao
            </Link>
            <Link to="/produtos" className="ghost-link">
              Ver meus produtos
            </Link>
          </div>
        </div>
        <div className="hero-right">
          <div className="pulse-ring" />
          <div className="hero-chip">Produtos: {metrics.count}</div>
          <div className="hero-chip">Margem media: {metrics.avgMargin.toFixed(2)}%</div>
          <div className="hero-chip">Lucro estimado: {money(metrics.totalProfit)}</div>
        </div>
      </article>

      <div className="kpi-grid kpi-grid-4">
        <article className="kpi-card elevated">
          <p>Total precificado</p>
          <strong>{money(metrics.totalPrice)}</strong>
        </article>
        <article className="kpi-card elevated">
          <p>Custo base total</p>
          <strong>{money(metrics.totalCost)}</strong>
        </article>
        <article className="kpi-card elevated">
          <p>Ticket medio</p>
          <strong>{money(metrics.avgTicket)}</strong>
        </article>
        <article className="kpi-card elevated">
          <p>Lucro estimado</p>
          <strong className={metrics.totalProfit >= 0 ? "kpi-up" : "kpi-warn"}>
            {money(metrics.totalProfit)}
          </strong>
        </article>
      </div>

      <div className="ops-grid">
        <article className="ops-card">
          <h3>Status do sistema</h3>
          {loading && <p>Carregando indicadores...</p>}
          {!loading && error && <p className="error-text">Erro: {error}</p>}
          {!loading && !error && (
            <ul className="task-list">
              <li>Base conectada ao Supabase</li>
              <li>{metrics.count} produto(s) ativo(s) no painel</li>
              <li>Ultima atualizacao em tempo real por consulta</li>
            </ul>
          )}
        </article>

        <article className="ops-card">
          <h3>Top produtos por preco</h3>
          {topProducts.length === 0 ? (
            <p className="page-text">Cadastre produtos na precificacao para visualizar ranking.</p>
          ) : (
            <div className="mini-list">
              {topProducts.map((item) => (
                <div key={String(item.id)} className="mini-list-item">
                  <span>{item.product_name || "Sem nome"}</span>
                  <strong>{money(Number(item.selling_price) || 0)}</strong>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
