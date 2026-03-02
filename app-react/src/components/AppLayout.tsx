import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

type BaseNavItem = {
  id: string;
  label: string;
  path: string;
};

const isLocalNfEnabled = Boolean((import.meta as any)?.env?.DEV);

function NavIcon({ id }: { id: string }) {
  const props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9" } as const;

  if (id === "precificacao") {
    return (
      <svg {...props}>
        <path d="M12 3v18" />
        <path d="M16 7.2c0-1.8-1.8-3.2-4-3.2s-4 1.4-4 3.2 1.8 3.2 4 3.2 4 1.4 4 3.2-1.8 3.2-4 3.2-4-1.4-4-3.2" />
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

  if (id === "produtos") {
    return (
      <svg {...props}>
        <path d="M12 3l8 4-8 4-8-4 8-4z" />
        <path d="M4 7v10l8 4 8-4V7" />
      </svg>
    );
  }

  if (id === "mercado_livre") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8 12h8M9 9.5l2.5 2.5L9 14.5M15 9.5L12.5 12l2.5 2.5" />
      </svg>
    );
  }

  if (id === "nota_fiscal") {
    return (
      <svg {...props}>
        <rect x="5" y="3.5" width="14" height="17" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }

  if (id === "teste_impressao") {
    return (
      <svg {...props}>
        <rect x="6" y="3.5" width="12" height="6" rx="1.2" />
        <rect x="4" y="9" width="16" height="8" rx="1.6" />
        <rect x="7" y="14.5" width="10" height="6" rx="1.2" />
      </svg>
    );
  }

  if (id === "separacao") {
    return (
      <svg {...props}>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M8 9h8M8 12h8M8 15h5" />
      </svg>
    );
  }

  if (id === "pedidos") {
    return (
      <svg {...props}>
        <rect x="4" y="4.5" width="16" height="15" rx="2" />
        <path d="M8 8.5h8M8 12h8M8 15.5h5" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.1M12 19.1v2.1M4.8 4.8l1.5 1.5M17.7 17.7l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.8 19.2l1.5-1.5M17.7 6.3l1.5-1.5" />
    </svg>
  );
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mlMenuOpen, setMlMenuOpen] = useState(true);
  const location = useLocation();
  const mlActive = location.pathname.startsWith("/mercado-livre");

  const navItems: BaseNavItem[] = [
    ...(isLocalNfEnabled ? [{ id: "nota_fiscal", label: "Nota Fiscal", path: "/nota-fiscal" }] : []),
    { id: "precificacao", label: "Precificacao", path: "/precificacao" },
    { id: "calendario", label: "Calendario", path: "/calendario" },
    { id: "produtos", label: "Meus Produtos", path: "/produtos" },
    { id: "pedidos", label: "Pedidos", path: "/mercado-livre/operacoes" },
    { id: "teste_impressao", label: "Teste de Impressao", path: "/teste-impressao" },
    { id: "configuracoes", label: "Configuracoes", path: "/configuracoes" }
  ];

  function closeMenu() {
    setMenuOpen(false);
  }

  function openAccountMenu() {
    window.dispatchEvent(new CustomEvent("app-account-toggle"));
  }

  return (
    <div className="app-shell">
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">F</div>
          <div>
            <h2>Financeiro</h2>
            <p>Suite de gestao operacional</p>
          </div>
        </div>

        <nav>
          <div className={mlActive ? "nav-group active" : "nav-group"}>
            <button type="button" className="nav-group-trigger" onClick={() => setMlMenuOpen((v) => !v)}>
              <span className="nav-badge" aria-hidden="true">
                <NavIcon id="mercado_livre" />
              </span>
              <span>Mercado Livre</span>
              <span className="nav-group-chevron">{mlMenuOpen ? "▾" : "▸"}</span>
            </button>
            {mlMenuOpen && (
              <div className="nav-submenu">
                <NavLink
                  to="/mercado-livre"
                  end
                  onClick={closeMenu}
                  className={({ isActive }) => (isActive ? "nav-subitem active" : "nav-subitem")}
                >
                  Painel
                </NavLink>
                <NavLink
                  to="/mercado-livre/mensagens"
                  onClick={closeMenu}
                  className={({ isActive }) => (isActive ? "nav-subitem active" : "nav-subitem")}
                >
                  Mensagens
                </NavLink>
                <NavLink
                  to="/mercado-livre/operacoes"
                  onClick={closeMenu}
                  className={({ isActive }) => (isActive ? "nav-subitem active" : "nav-subitem")}
                >
                  Operacoes
                </NavLink>
                <NavLink
                  to="/mercado-livre/importacao"
                  onClick={closeMenu}
                  className={({ isActive }) => (isActive ? "nav-subitem active" : "nav-subitem")}
                >
                  Importacao
                </NavLink>
                <NavLink
                  to="/mercado-livre/calendario-envio"
                  onClick={closeMenu}
                  className={({ isActive }) => (isActive ? "nav-subitem active" : "nav-subitem")}
                >
                  Calendario Envio
                </NavLink>
                <NavLink
                  to="/mercado-livre/separacao-producao"
                  onClick={closeMenu}
                  className={({ isActive }) => (isActive ? "nav-subitem active" : "nav-subitem")}
                >
                  Producao
                </NavLink>
                <NavLink
                  to="/mercado-livre/pedidos-envio"
                  onClick={closeMenu}
                  className={({ isActive }) => (isActive ? "nav-subitem active" : "nav-subitem")}
                >
                  Pedidos Envio
                </NavLink>
              </div>
            )}
          </div>

          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === "/"}
              onClick={closeMenu}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
              <span className="nav-badge" aria-hidden="true">
                <NavIcon id={item.id} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {menuOpen && <button className="mobile-overlay" type="button" onClick={closeMenu} />}

      <main className="content">
        <nav className="mobile-footer-bar" aria-label="Atalhos mobile">
          <button
            className="mobile-footer-item mobile-menu-btn"
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Abrir menu"
          >
            <span className="mobile-footer-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </span>
            <span>{menuOpen ? "Fechar" : "Menu"}</span>
          </button>
          <NavLink
            to="/produtos"
            className={({ isActive }) => (isActive ? "mobile-footer-item active" : "mobile-footer-item")}
          >
            <span className="mobile-footer-icon"><NavIcon id="produtos" /></span>
            <span>Produtos</span>
          </NavLink>
          <NavLink
            to="/mercado-livre/operacoes"
            className={({ isActive }) =>
              isActive || location.pathname.includes("/mercado-livre/operacoes") || location.pathname.includes("/mercado-livre/importacao") || location.pathname.includes("/mercado-livre/calendario-envio") || location.pathname.includes("/mercado-livre/separacao-producao") || location.pathname.includes("/mercado-livre/pedidos-envio")
                ? "mobile-footer-item active"
                : "mobile-footer-item"
            }
          >
            <span className="mobile-footer-icon"><NavIcon id="pedidos" /></span>
            <span>Pedidos</span>
          </NavLink>
          <button
            className="mobile-footer-item mobile-account-trigger"
            type="button"
            onClick={openAccountMenu}
            aria-label="Conta"
          >
            <span className="mobile-footer-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="8" r="3.2" />
                <path d="M4.8 19.2c1.2-3 3.8-4.7 7.2-4.7s6 1.7 7.2 4.7" />
              </svg>
            </span>
            <span>Conta</span>
          </button>
        </nav>
        <Outlet />
      </main>
    </div>
  );
}
