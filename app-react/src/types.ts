export type ModuleId =
  | "dashboard"
  | "precificacao"
  | "calendario"
  | "produtos"
  | "configuracoes";

export interface NavItem {
  id: ModuleId;
  label: string;
  path: string;
}
