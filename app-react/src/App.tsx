import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./modules/DashboardPage";
import { PricingPage } from "./modules/PricingPage";
import { CalendarPage } from "./modules/CalendarPage";
import { ProductsPage } from "./modules/ProductsPage";
import { SettingsPage } from "./modules/SettingsPage";
import { MercadoLivrePage } from "./modules/MercadoLivrePage";

export function App() {
  return (
    <AuthGate>
      {() => (
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="precificacao" element={<PricingPage />} />
            <Route path="calendario" element={<CalendarPage />} />
            <Route path="produtos" element={<ProductsPage />} />
            <Route path="mercado-livre" element={<MercadoLivrePage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </AuthGate>
  );
}
