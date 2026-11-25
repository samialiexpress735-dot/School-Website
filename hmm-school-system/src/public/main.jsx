import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/noto-sans-ethiopic/400.css";
import "@fontsource/noto-sans-ethiopic/600.css";
import "@fontsource/noto-sans-ethiopic/700.css";
import "./public.css";
import PublicApp from "./PublicApp.jsx";

// Same hash addresses as the administration system, so it works on any hosting: /public.html#/en/home
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <PublicApp />
    </HashRouter>
  </React.StrictMode>
);
