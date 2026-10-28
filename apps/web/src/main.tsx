import "./styles/index.css";
import { createRoot } from "react-dom/client";

import App from "./app";
import { hideKeyboardAccessoryBar } from "./lib/native";

hideKeyboardAccessoryBar();

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing #root");
createRoot(container).render(<App />);
