import { Link } from "react-router-dom";

type OpsCard = {
  id: string;
  title: string;
  desc: string;
  to: string;
  icon: string;
};

const cards: OpsCard[] = [
  {
    id: "importacao",
    title: "Importacao",
    desc: "Subir planilha, salvar pedidos novos e aplicar prazo de envio.",
    to: "/mercado-livre/importacao",
    icon: "⬆"
  },
  {
    id: "calendario",
    title: "Calendario de Envio",
    desc: "Visualizar volume por dia e selecionar a data de trabalho.",
    to: "/mercado-livre/calendario-envio",
    icon: "📅"
  },
  {
    id: "separacao",
    title: "Separacao de Producao",
    desc: "Ver agrupamento por SKU, quantidade e total a produzir.",
    to: "/mercado-livre/separacao-producao",
    icon: "📦"
  },
  {
    id: "pedidos",
    title: "Pedidos de Envio",
    desc: "Conferencia por rastreio, scanner e status embalado/pendente.",
    to: "/mercado-livre/pedidos-envio",
    icon: "🧾"
  }
];

export function MercadoLivreOperacoesPage() {
  return (
    <section className="page ml-ops-hub-page">
      <div className="section-head row-between">
        <div>
          <h2>Operacoes de Pedido</h2>
          <p className="page-text">Acesse cada etapa separadamente para deixar o sistema mais organizado no PC e mobile.</p>
        </div>
      </div>

      <div className="ml-ops-hub-grid">
        {cards.map((card) => (
          <Link key={card.id} to={card.to} className="ml-ops-hub-card">
            <span className="ml-ops-hub-icon" aria-hidden>
              {card.icon}
            </span>
            <strong>{card.title}</strong>
            <p>{card.desc}</p>
            <span className="ml-ops-hub-link">Abrir etapa</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

