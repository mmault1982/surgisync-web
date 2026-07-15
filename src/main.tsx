import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SessionProvider } from "./auth/SessionContext";
import "./index.css";

// No StrictMode: its dev-mode double effects fire two concurrent
// token/refresh/ calls, and the backend blacklists the rotated token from the
// first one — see the single-flight TODO in api/client.ts.
createRoot(document.getElementById("root")!).render(
  <SessionProvider>
    <App />
  </SessionProvider>,
);
