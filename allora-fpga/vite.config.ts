import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { demoBridge } from "../marketing/scripts/vite-demo";

export default defineConfig(({ command }) => {
  const token =
    command === "serve" ? process.env.VITE_ALLORA_DEMO_TOKEN : undefined;
  return {
    plugins: [react(), ...(token ? [demoBridge(token)] : [])],
    server: token
      ? { host: "127.0.0.1", port: 5178, strictPort: true }
      : undefined,
  };
});
