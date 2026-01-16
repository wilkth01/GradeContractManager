import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "@/contexts/theme-context"; // Added ThemeProvider import

createRoot(document.getElementById("root")!).render(
  <ThemeProvider> {/* Wrapped App with ThemeProvider */}
    <App />
  </ThemeProvider>
);