import "./styles/index.css";
import { createRoot } from "react-dom/client";

import App from "./app";
import { startDevLog } from "./lib/dev-log";

startDevLog();

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing #root");
createRoot(container).render(<App />);
