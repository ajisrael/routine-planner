import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initKeyboardTracking } from "./lib/keyboard";
import "./styles.css";

initKeyboardTracking();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);