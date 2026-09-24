import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initializeDemoData } from "./data/demo-data";
import "./styles.css";

const root = document.getElementById("root")!;

async function start() {
  await initializeDemoData();
  const { default: App } = await import("./App");
  createRoot(root).render(<StrictMode><App /></StrictMode>);
}

void start().catch(() => {
  const message = document.createElement("p");
  message.textContent = "The demo could not load. Please reload to try again.";
  message.setAttribute("role", "alert");
  root.replaceChildren(message);
});
