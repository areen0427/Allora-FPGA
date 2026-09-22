import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

const isViewerWindow = new URLSearchParams(window.location.search).has("viewer");
export const ViewerApp = lazy(() => import("./ViewerApp.tsx"));

createRoot(document.getElementById("root")!).render(
  isViewerWindow ? (
    <Suspense fallback={null}>
      <ViewerApp />
    </Suspense>
  ) : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
);
