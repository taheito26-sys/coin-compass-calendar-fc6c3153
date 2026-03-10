import { createRoot } from "react-dom/client";
import App from "./App";
import './index.css';
import './responsive-overrides.css';

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

try {
  console.log("[main] Mounting React app...");
  createRoot(rootElement).render(<App />);
  console.log("[main] React render called successfully");
} catch (err) {
  console.error("[main] Fatal mount error:", err);
  rootElement.innerHTML = `<div style="padding:48px;text-align:center;color:red;">Fatal error: ${err}</div>`;
}
