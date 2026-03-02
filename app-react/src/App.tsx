import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./modules/DashboardPage";
import { PricingPage } from "./modules/PricingPage";
import { CalendarPage } from "./modules/CalendarPage";
import { ProductsPage } from "./modules/ProductsPage";
import { SettingsPage } from "./modules/SettingsPage";
import { MercadoLivrePage } from "./modules/MercadoLivrePage";
import { MercadoLivreMensagensPage } from "./modules/MercadoLivreMensagensPage";
import { MercadoLivreSeparacaoPage } from "./modules/MercadoLivreSeparacaoPage";
import { MercadoLivreOperacoesPage } from "./modules/MercadoLivreOperacoesPage";
import { TesteImpressaoPage } from "./modules/TesteImpressaoPage";
import { NotaFiscalPage } from "./modules/NotaFiscalPage";
import { PedidosPage } from "./modules/PedidosPage";

const isLocalNfEnabled = Boolean((import.meta as any)?.env?.DEV);

export function App() {
  return (
    <AuthGate>
      {() => (
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/mercado-livre" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="precificacao" element={<PricingPage />} />
            <Route path="calendario" element={<CalendarPage />} />
            <Route path="produtos" element={<ProductsPage />} />
            <Route path="mercado-livre" element={<MercadoLivrePage />} />
            <Route path="mercado-livre/operacoes" element={<MercadoLivreOperacoesPage />} />
            <Route path="mercado-livre/mensagens" element={<MercadoLivreMensagensPage />} />
            <Route path="mercado-livre/enviar-pedido" element={<Navigate to="/mercado-livre/operacoes" replace />} />
            <Route path="mercado-livre/importacao" element={<MercadoLivreSeparacaoPage view="importacao" />} />
            <Route path="mercado-livre/calendario-envio" element={<MercadoLivreSeparacaoPage view="calendario" />} />
            <Route path="mercado-livre/separacao-producao" element={<MercadoLivreSeparacaoPage view="producao" />} />
            <Route path="mercado-livre/pedidos-envio" element={<MercadoLivreSeparacaoPage view="pedidos" />} />
            <Route path="mercado-livre/separacao-pedido" element={<Navigate to="/mercado-livre/operacoes" replace />} />
            <Route path="pedidos" element={<Navigate to="/pedidos/pendentes" replace />} />
            <Route path="pedidos/pendentes" element={<PedidosPage mode="pendentes" />} />
            <Route path="pedidos/nota-fiscal" element={<PedidosPage mode="nota-fiscal" />} />
            <Route path="pedidos/imprimir" element={<PedidosPage mode="imprimir" />} />
            <Route path="pedidos/retirada" element={<PedidosPage mode="retirada" />} />
            {isLocalNfEnabled && <Route path="nota-fiscal" element={<NotaFiscalPage />} />}
            <Route path="teste-impressao" element={<TesteImpressaoPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </AuthGate>
  );
}
