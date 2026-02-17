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
import { TesteImpressaoPage } from "./modules/TesteImpressaoPage";
import { NotaFiscalPage } from "./modules/NotaFiscalPage";

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
            <Route path="mercado-livre/mensagens" element={<MercadoLivreMensagensPage />} />
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
