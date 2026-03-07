type UiIconId =
  | "inicio"
  | "financeiro"
  | "precificacao"
  | "produtos"
  | "configuracoes"
  | "mercado_livre"
  | "mensagens"
  | "separacao"
  | "pedidos"
  | "nota_fiscal"
  | "capa_agenda"
  | "calendario";

export function UiIcon({ id }: { id: UiIconId }) {
  const props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9" } as const;

  if (id === "inicio") return <svg {...props}><path d="M4 10.5 12 4l8 6.5" /><path d="M6.5 9.7V20h11V9.7" /></svg>;
  if (id === "financeiro") return <svg {...props}><path d="M12 3v18" /><path d="M16 7.2c0-1.8-1.8-3.2-4-3.2s-4 1.4-4 3.2 1.8 3.2 4 3.2 4 1.4 4 3.2-1.8 3.2-4 3.2-4-1.4-4-3.2" /></svg>;
  if (id === "precificacao") return <svg {...props}><path d="M4 19h16" /><rect x="6" y="11" width="2.8" height="6" /><rect x="10.6" y="8" width="2.8" height="9" /><rect x="15.2" y="5" width="2.8" height="12" /></svg>;
  if (id === "produtos") return <svg {...props}><path d="M12 3l8 4-8 4-8-4 8-4z" /><path d="M4 7v10l8 4 8-4V7" /></svg>;
  if (id === "configuracoes") return <svg {...props}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.1M12 19.1v2.1M4.8 4.8l1.5 1.5M17.7 17.7l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.8 19.2l1.5-1.5M17.7 6.3l1.5-1.5" /></svg>;
  if (id === "mercado_livre") return <svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M8 12h8M9 9.5l2.5 2.5L9 14.5M15 9.5L12.5 12l2.5 2.5" /></svg>;
  if (id === "mensagens") return <svg {...props}><rect x="3.5" y="4.5" width="17" height="13" rx="2" /><path d="M5.5 7.5 12 12l6.5-4.5" /><path d="M9 19.5h6" /></svg>;
  if (id === "separacao") return <svg {...props}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 12h8M8 15h5" /></svg>;
  if (id === "pedidos") return <svg {...props}><rect x="4" y="4.5" width="16" height="15" rx="2" /><path d="M8 8.5h8M8 12h8M8 15.5h5" /></svg>;
  if (id === "nota_fiscal") return <svg {...props}><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  if (id === "capa_agenda") return <svg {...props}><path d="M6 4.5h9.5A2.5 2.5 0 0 1 18 7v13H8.5A2.5 2.5 0 0 1 6 17.5z" /><path d="M8 7.5h7M8 11h7M8 14.5h5" /></svg>;
  return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>;
}

