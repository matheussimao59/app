import { NavLink, Outlet } from "react-router-dom";
import { NavItem } from "../types";

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/" },
  { id: "precificacao", label: "Precificação", path: "/precificacao" },
  { id: "calendario", label: "Calendário", path: "/calendario" },
  { id: "produtos", label: "Meus Produtos", path: "/produtos" },
  { id: "configuracoes", label: "Configurações", path: "/configuracoes" }
];

export function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>Financeiro</h2>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
