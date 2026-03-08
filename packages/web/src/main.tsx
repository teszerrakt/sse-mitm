import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ConfigProvider } from "./hooks/useConfig";
import { CertStatusProvider } from "./hooks/useCertStatus";
import { WebSocketProvider } from "./hooks/useWebSocket";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider>
      <CertStatusProvider>
        <WebSocketProvider>
          <App />
        </WebSocketProvider>
      </CertStatusProvider>
    </ConfigProvider>
  </StrictMode>,
);
