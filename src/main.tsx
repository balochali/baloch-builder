import React from "react";
import ReactDOM from "react-dom/client";
import { Providers } from "@/app/providers";
import { AppRouter } from "@/app/router";
import "@/styles/globals.css";
import "@/styles/workspace-redesign.css";
import "@/styles/workspace-ui.css";
import "@/styles/charts.css";
import "@/styles/builder-identity.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </React.StrictMode>,
);
