import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const isAdmin = window.location.pathname.replace(/\/+$/, "").endsWith("/admin");
const AdminApp = React.lazy(() => import("./admin/AdminApp"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isAdmin ? (
      <React.Suspense fallback={null}>
        <AdminApp />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
