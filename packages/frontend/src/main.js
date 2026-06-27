import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles.css";

// GHL embed passes context (locationId, api token) via query string or window global.
// Fall back to demo defaults so the app runs standalone.
const params = new URLSearchParams(window.location.search);
window.__COPILOT__ = {
  locationId: params.get("locationId") || window.__GHL_LOCATION_ID__ || "loc_demo_001",
  token: params.get("token") || window.__COPILOT_TOKEN__ || "dev-local-token",
  apiBase: window.__COPILOT_API_BASE__ || "",
};

createApp(App).use(createPinia()).mount("#app");
