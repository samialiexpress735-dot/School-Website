import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/noto-sans-ethiopic/400.css";
import "@fontsource/noto-sans-ethiopic/600.css";
import "@fontsource/noto-sans-ethiopic/700.css";
import "./styles.css";
import App from "./App.jsx";
import { AuthProvider } from "./lib/AuthContext.jsx";

// HashRouter keeps the site working on any hosting (no server rewrite rules needed).
// Addresses look like  https://your-domain/#/en/login  and  /#/am/login
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
);
