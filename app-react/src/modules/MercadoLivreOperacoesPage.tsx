import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type OpsCard = {
  id: "importacao" | "calendario" | "separacao" | "pedidos";
  title: string;
  desc: string;
  to: string;
};

const cards: OpsCard[] = [
  {
    id: "importacao",
    title: "Importacao",
    desc: "Subir planilha, salvar pedidos novos e aplicar prazo de envio.",
    to: "/mercado-livre/importacao"
  },
  {
    id: "calendario",
    title: "Calendario de Envio",
    desc: "Visualizar volume por dia e selecionar a data de trabalho.",
    to: "/mercado-livre/calendario-envio"
  },
  {
    id: "separacao",
    title: "Separacao de Producao",
    desc: "Ver agrupamento por SKU, quantidade e total a produzir.",
    to: "/mercado-livre/separacao-producao"
  },
  {
    id: "pedidos",
    title: "Pedidos de Envio",
    desc: "Conferencia por rastreio, scanner e status embalado/pendente.",
    to: "/mercado-livre/pedidos-envio"
  }
];

function cardIcon(id: OpsCard["id"]) {
  const props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9" } as const;

  if (id === "importacao") {
    return (
      <svg {...props}>
        <path d="M12 4v11" />
        <path d="M8.5 11.5L12 15l3.5-3.5" />
        <rect x="4" y="17" width="16" height="3" rx="1.2" />
      </svg>
    );
  }

  if (id === "calendario") {
    return (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4" />
      </svg>
    );
  }

  if (id === "separacao") {
    return (
      <svg {...props}>
        <path d="M12 3l8 4-8 4-8-4 8-4z" />
        <path d="M4 7v10l8 4 8-4V7" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <rect x="4" y="4.5" width="16" height="15" rx="2" />
      <path d="M8 8.5h8M8 12h8M8 15.5h5" />
    </svg>
  );
}

export function MercadoLivreOperacoesPage() {
  const navigate = useNavigate();
  const [importModalOpen, setImportModalOpen] = useState(false);

  return (
    <section className="page ml-ops-hub-page">
      <div className="section-head row-between">
        <div>
          <h2>Operacoes de Pedido</h2>
          <p className="page-text">Acesse cada etapa separadamente para deixar o sistema mais organizado no PC e mobile.</p>
        </div>
      </div>

      <div className="ml-ops-hub-grid">
        {cards.map((card) =>
          card.id === "importacao" ? (
            <button key={card.id} type="button" className={`ml-ops-hub-card ml-ops-hub-card-btn is-${card.id}`} onClick={() => setImportModalOpen(true)}>
              <span className="ml-ops-hub-icon" aria-hidden>
                {cardIcon(card.id)}
              </span>
              <strong>{card.title}</strong>
              <p>{card.desc}</p>
              <span className="ml-ops-hub-link">Abrir etapa</span>
            </button>
          ) : (
            <Link key={card.id} to={card.to} className={`ml-ops-hub-card is-${card.id}`}>
              <span className="ml-ops-hub-icon" aria-hidden>
                {cardIcon(card.id)}
              </span>
              <strong>{card.title}</strong>
              <p>{card.desc}</p>
              <span className="ml-ops-hub-link">Abrir etapa</span>
            </Link>
          )
        )}
      </div>

      <button
        type="button"
        className="ml-ops-scan-fab"
        onClick={() => navigate("/mercado-livre/pedidos-envio?scanner=1")}
        aria-label="Abrir scanner"
        title="Abrir scanner"
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

      {importModalOpen && (
        <div className="assistant-modal-backdrop" onClick={() => setImportModalOpen(false)}>
          <article className="assistant-modal ml-import-modal" onClick={(e) => e.stopPropagation()}>
            <header className="assistant-modal-head">
              <h3>Importacao</h3>
              <button type="button" onClick={() => setImportModalOpen(false)}>Fechar</button>
            </header>
            <p className="page-text">Abrir a tela de importacao para subir planilha e salvar pedidos novos.</p>
            <div className="ml-import-modal-actions">
              <button type="button" className="primary-btn" onClick={() => navigate("/mercado-livre/importacao")}>
                Abrir importacao
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
