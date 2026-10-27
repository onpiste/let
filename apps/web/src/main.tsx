import "./styles.css";
import { createRoot } from "react-dom/client";

import App from "./app";

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing #root");
createRoot(container).render(<App />);
