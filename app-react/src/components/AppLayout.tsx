import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { id: "dashboard", label: "Dashboard", path: "/" },
  { id: "precificacao", label: "Precificacao", path: "/precificacao" },
  { id: "calendario", label: "Calendario", path: "/calendario" },
  { id: "produtos", label: "Meus Produtos", path: "/produtos" },
  { id: "mercado_livre", label: "Mercado Livre", path: "/mercado-livre" },
  { id: "teste_impressao", label: "Teste de Impressao", path: "/teste-impressao" },
  { id: "configuracoes", label: "Configuracoes", path: "/configuracoes" }
];

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
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
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === "/"}
              onClick={closeMenu}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <p>Sistema React</p>
          <small>Mesmo padrao visual do original</small>
        </div>
      </aside>

      {menuOpen && <button className="mobile-overlay" type="button" onClick={closeMenu} />}

      <main className="content">
        <button
          className="mobile-menu-btn"
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Abrir menu"
        >
          {menuOpen ? "Fechar" : "Menu"}
        </button>
        <Outlet />
      </main>
    </div>
  );
}
