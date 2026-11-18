import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";
import App from "./App";
import { initHome } from "./lib/paths";
import { applyAppearance } from "./lib/appearance";
import { useSettings } from "./stores/settings";

// Colours first, so the window never flashes the wrong theme.
applyAppearance(useSettings.getState());

// xterm.js measures the font when it opens, so load it first.
async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load('13px "JetBrains Mono"'),
      document.fonts.load('bold 13px "JetBrains Mono"'),
    ]);
  } catch {
    // Fall back to the next font in the stack.
  }
}

void Promise.all([loadFonts(), initHome()]).then(() => {
  // No StrictMode: it would start every shell twice in development.
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
});
