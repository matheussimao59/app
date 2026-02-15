import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./modules/DashboardPage";
import { PricingPage } from "./modules/PricingPage";
import { CalendarPage } from "./modules/CalendarPage";
import { ProductsPage } from "./modules/ProductsPage";
import { SettingsPage } from "./modules/SettingsPage";

export function App() {
  return (
    <AuthGate>
      {() => (
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/precificacao" element={<PricingPage />} />
            <Route path="/calendario" element={<CalendarPage />} />
            <Route path="/produtos" element={<ProductsPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </AuthGate>
  );
}
