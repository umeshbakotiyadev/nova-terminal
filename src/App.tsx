import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { FolderInput } from "lucide-react";

import { CommandPalette } from "./components/CommandPalette";
import { ContextMenu } from "./components/ContextMenu";
import { SettingsView } from "./components/SettingsView";
import { TabsPanel } from "./components/TabsPanel";
import { TitleBar } from "./components/TitleBar";
import { Workspace } from "./components/Workspace";
import { applyAppearance } from "./lib/appearance";
import { useFileDrop } from "./lib/fileDrop";
import { easeOut } from "./lib/motion";
import { focusActive } from "./lib/registry";
import { useShortcuts } from "./lib/shortcuts";
import { useSettings } from "./stores/settings";
import { showsInput, useActiveTab, useTabs } from "./stores/tabs";

export default function App() {
  const activeId = useTabs((s) => s.activeId);
  const sidebarOpen = useTabs((s) => s.sidebarOpen);
  const paletteOpen = useTabs((s) => s.paletteOpen);
  const settingsOpen = useSettings((s) => s.settingsOpen);
  const animations = useSettings((s) => s.animations);
  const active = useActiveTab();
  const inputShown = showsInput(active);
  useShortcuts();

  // Drag files or folders onto the window to paste their paths.
  const [dropping, setDropping] = useState(false);
  useFileDrop(setDropping);

  // Theme, opacity and blur follow Settings live.
  useEffect(() => useSettings.subscribe((s) => applyAppearance(s)), []);

  // Keyboard goes to Nova's input at the prompt, and to the program while
  // a command or full-screen app is running.
  useEffect(() => {
    if (paletteOpen || settingsOpen) return;
    const frame = requestAnimationFrame(() => focusActive(activeId, inputShown));
    return () => cancelAnimationFrame(frame);
  }, [activeId, inputShown, paletteOpen, settingsOpen]);

  return (
    // "user" follows macOS Reduce motion; "always" turns motion off.
    <MotionConfig reducedMotion={animations ? "user" : "always"}>
      <div
        className={[
          "nova-surface flex h-full flex-col bg-[var(--nova-bg)]",
          animations ? "" : "nova-reduce-motion",
        ].join(" ")}
      >
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <AnimatePresence initial={false}>{sidebarOpen && <TabsPanel key="tabs-panel" />}</AnimatePresence>
          <main className="relative flex min-w-0 flex-1 flex-col">
            <Workspace />

            <AnimatePresence>
              {dropping && (
                <motion.div
                  key="drop"
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.985 }}
                  transition={easeOut}
                  className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-[var(--nova-accent)] bg-[var(--nova-accent)]/10"
                >
                  <motion.div
                    initial={{ y: 8 }}
                    animate={{ y: 0 }}
                    className="flex items-center gap-2.5 rounded-lg bg-[var(--nova-panel)] px-4 py-2.5 text-[13px] text-[var(--nova-text)] shadow-lg"
                  >
                    <FolderInput size={16} className="text-[var(--nova-accent)]" />
                    Drop to paste the path
                    <span className="text-[var(--nova-faint)]">· a folder on an empty line becomes cd</span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>

        <AnimatePresence>{paletteOpen && <CommandPalette key="palette" />}</AnimatePresence>
        <AnimatePresence>{settingsOpen && <SettingsView key="settings" />}</AnimatePresence>
        <ContextMenu />
      </div>
    </MotionConfig>
  );
}
