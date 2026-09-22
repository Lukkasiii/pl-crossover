import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import "./AppShell.css";

export function AppShell() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
