import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { hasTauriInvoke } from "./lib/tauri";

const isViewerWindow = new URLSearchParams(window.location.search).has(
  "viewer",
);
document.documentElement.dataset.nativeTitlebar = String(
  !isViewerWindow && hasTauriInvoke() && /Mac/.test(navigator.platform),
);
export const ViewerApp = lazy(() => import("./ViewerApp.tsx"));

// A separate dev-server origin keeps marketing recents/settings isolated.
if (
  !isViewerWindow &&
  import.meta.env.DEV &&
  import.meta.env.VITE_ALLORA_DEMO_TOKEN
) {
  if (window.location.port !== "5178")
    throw new Error("Demo mode requires its isolated origin");
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("allora-fpga-")) window.localStorage.removeItem(key);
  }
}

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
