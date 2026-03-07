import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.tsx";
import "./index.css";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";

const root = createRoot(document.getElementById("root")!);

if (CLERK_KEY) {
  root.render(
    <ClerkProvider publishableKey={CLERK_KEY}>
      <App />
    </ClerkProvider>
  );
} else {
  // No Clerk key — render without auth
  root.render(<App />);
}
