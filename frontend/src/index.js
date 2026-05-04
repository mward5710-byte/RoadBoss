import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Phase 2G.2: register the web-push service worker on first paint. Scope is "/"
// so it can receive pushes for both /driver and /app routes.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('SW registration failed', err));
      // Listen for click-through messages from the SW so we can route client-side.
      navigator.serviceWorker.addEventListener('message', (event) => {
        try {
          if (event?.data?.type === 'roadboss:notification-click' && event?.data?.url) {
            const target = event.data.url;
            if (target && typeof target === 'string') {
              window.location.assign(target);
            }
          }
        } catch (_) {}
      });
    } catch (e) {
      console.warn('SW setup error', e);
    }
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
