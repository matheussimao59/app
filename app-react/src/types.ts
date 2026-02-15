export type ModuleId =
  | "dashboard"
  | "precificacao"
  | "calendario"
  | "produtos"
  | "mercado_livre"
  | "configuracoes";

export interface NavItem {
  id: ModuleId;
  label: string;
  path: string;
}
