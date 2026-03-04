import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let reloading = false;

    const announceUpdate = (waiting: ServiceWorker | null) => {
      if (!waiting) return;
      (window as any).__swWaiting = waiting;
      window.dispatchEvent(new CustomEvent("app-update-available"));
    };

    const wireUpdateFlow = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) announceUpdate(registration.waiting);

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            announceUpdate(registration.waiting || newWorker);
          }
        });
      });
    };

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    (window as any).__applyAppUpdate = () => {
      const waiting = (window as any).__swWaiting as ServiceWorker | undefined;
      if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => wireUpdateFlow(registration))
      .catch(() => {
        // Registro do SW é opcional; falha não deve quebrar o app.
      });
  });
}
