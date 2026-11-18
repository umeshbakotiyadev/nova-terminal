import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArchiveRestore, Bug, Check, Download, ExternalLink, Info, Keyboard, Palette, RotateCcw, SlidersHorizontal, Type, Upload, X } from "lucide-react";

import { version } from "../../package.json";

import { applyBackup, describeBackup, exportBackup, pickBackup, type BackupParts, type NovaBackup } from "../lib/backup";
import { fade, pop } from "../lib/motion";
import { tildify } from "../lib/paths";
import { appKey, isMac } from "../lib/platform";
import {
  FONT_CHOICES,
  MAX_BLUR,
  MAX_FONT,
  MIN_FONT,
  fontStack,
  useSettings,
  type CursorStyle,
  type NewTabFolder,
} from "../stores/settings";
import { themes, type NovaTheme } from "../themes";

type Section = "appearance" | "text" | "features" | "shortcuts" | "backup" | "about";

const SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={15} /> },
  { id: "text", label: "Text & cursor", icon: <Type size={15} /> },
  { id: "features", label: "Features", icon: <SlidersHorizontal size={15} /> },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: <Keyboard size={15} /> },
  { id: "backup", label: "Backup & restore", icon: <ArchiveRestore size={15} /> },
  { id: "about", label: "About", icon: <Info size={15} /> },
];

/** The settings page (⌘,). Every change applies instantly and is saved. */
export function SettingsView() {
  const close = () => useSettings.getState().setSettingsOpen(false);
  const reset = useSettings((s) => s.reset);
  const [section, setSection] = useState<Section>(() => {
    const wanted = useSettings.getState().settingsSection;
    return SECTIONS.some((s) => s.id === wanted) ? (wanted as Section) : "appearance";
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <motion.div
      {...fade}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <motion.div
        {...pop}
        className="flex h-[min(640px,100%)] w-[min(920px,100%)] overflow-hidden rounded-xl border border-[var(--nova-border-strong)] bg-[var(--nova-panel)] shadow-2xl shadow-black/50 backdrop-blur-xl">
        <nav className="flex w-[210px] shrink-0 flex-col border-r border-[var(--nova-border)] p-3">
          <h2 className="px-2 pb-3 pt-1 text-[15px] font-semibold text-[var(--nova-text)]">Settings</h2>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={[
                "relative flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors",
                section === s.id
                  ? "text-[var(--nova-text)]"
                  : "text-[var(--nova-muted)] hover:bg-[var(--nova-hover)] hover:text-[var(--nova-text)]",
              ].join(" ")}
            >
              {section === s.id && <span className="absolute inset-0 rounded-md bg-[var(--nova-hover-strong)]" />}
              <span className="relative">{s.icon}</span>
              <span className="relative">{s.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={reset}
            className="mt-auto flex h-8 items-center gap-2 rounded-md px-2 text-[12.5px] text-[var(--nova-faint)] hover:bg-[var(--nova-hover)] hover:text-[var(--nova-muted)]"
          >
            <RotateCcw size={13} /> Reset to defaults
          </button>
        </nav>

        <div className="relative min-w-0 flex-1 overflow-y-auto px-8 py-6">
          <button
            type="button"
            aria-label="Close settings"
            onClick={close}
            className="absolute right-4 top-4 grid size-8 place-items-center rounded-md text-[var(--nova-muted)] hover:bg-[var(--nova-hover)] hover:text-[var(--nova-text)]"
          >
            <X size={16} />
          </button>
          {/* Sections swap instantly and settle in (no waiting on the old one). */}
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {section === "appearance" && <AppearanceSection />}
            {section === "text" && <TextSection />}
            {section === "features" && <FeaturesSection />}
            {section === "shortcuts" && <ShortcutsSection />}
            {section === "backup" && <BackupSection />}
            {section === "about" && <AboutSection />}
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---- Sections --------------------------------------------------------------

function AppearanceSection() {
  const themeId = useSettings((s) => s.themeId);
  const opacity = useSettings((s) => s.opacity);
  const blurRadius = useSettings((s) => s.blurRadius);
  const animations = useSettings((s) => s.animations);
  const update = useSettings((s) => s.update);

  return (
    <>
      <Heading>Appearance</Heading>
      <Label>Theme</Label>
      <div className="mb-8 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
        {themes.map((t) => (
          <ThemeCard key={t.id} theme={t} selected={t.id === themeId} onSelect={() => update({ themeId: t.id })} />
        ))}
      </div>

      <Row label="Window opacity" description="See your desktop through the window.">
        <Slider
          min={50}
          max={100}
          step={1}
          value={opacity}
          onChange={(v) => update({ opacity: v })}
          format={(v) => `${v}%`}
        />
      </Row>
      <Row
        label="Background blur"
        description={
          opacity >= 100
            ? "Lower the window opacity to see the blur."
            : isMac
              ? "How much the desktop behind the window is blurred."
              : "Blurs the desktop behind the window."
        }
      >
        {/* Only macOS lets apps choose how strong the blur is. */}
        {isMac ? (
          <Slider
            min={0}
            max={MAX_BLUR}
            step={1}
            value={blurRadius}
            disabled={opacity >= 100}
            onChange={(v) => update({ blurRadius: v })}
            format={(v) => (v === 0 ? "Off" : String(v))}
          />
        ) : (
          <Toggle checked={blurRadius > 0} disabled={opacity >= 100} onChange={(v) => update({ blurRadius: v ? 20 : 0 })} />
        )}
      </Row>
      <Row
        label="Animations"
        description={`Smooth motion for panels, tabs and menus. Also follows ${isMac ? "macOS “Reduce motion”" : "Windows “Animation effects”"}.`}
      >
        <Toggle checked={animations} onChange={(v) => update({ animations: v })} />
      </Row>
    </>
  );
}

function TextSection() {
  const s = useSettings();
  const known = FONT_CHOICES.some((f) => f.value === s.fontFamily);

  return (
    <>
      <Heading>Text & cursor</Heading>
      <Row label="Font" description="Fonts you haven't installed fall back to JetBrains Mono.">
        <select
          value={known ? s.fontFamily : "custom"}
          onChange={(e) => e.target.value !== "custom" && s.update({ fontFamily: e.target.value })}
          className="h-8 w-[220px] rounded-md border border-[var(--nova-border-strong)] bg-[var(--nova-fill)] px-2 text-[13px] text-[var(--nova-text)] outline-none"
        >
          {FONT_CHOICES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
          {!known && <option value="custom">{s.fontFamily}</option>}
        </select>
      </Row>
      <Row label="Font size">
        <Stepper
          value={s.fontSize}
          min={MIN_FONT}
          max={MAX_FONT}
          onChange={(v) => s.update({ fontSize: v })}
          suffix="px"
        />
      </Row>
      <Row label="Line height">
        <Slider
          min={1}
          max={1.8}
          step={0.05}
          value={s.lineHeight}
          onChange={(v) => s.update({ lineHeight: v })}
          format={(v) => v.toFixed(2)}
        />
      </Row>
      <Row label="Cursor style">
        <Segmented<CursorStyle>
          value={s.cursorStyle}
          onChange={(v) => s.update({ cursorStyle: v })}
          options={[
            { value: "bar", label: "Bar" },
            { value: "block", label: "Block" },
            { value: "underline", label: "Underline" },
          ]}
        />
      </Row>
      <Row label="Blinking cursor">
        <Toggle checked={s.cursorBlink} onChange={(v) => s.update({ cursorBlink: v })} />
      </Row>

      <Label>Preview</Label>
      <div
        className="rounded-lg border border-[var(--nova-border)] bg-[var(--nova-bg)] px-4 py-3 text-[var(--nova-text)]"
        style={{ fontFamily: fontStack(s.fontFamily), fontSize: s.fontSize, lineHeight: s.lineHeight }}
      >
        <div>
          <span className="text-[var(--nova-accent)]">~/projects/nova</span> git status
        </div>
        <div className="text-[var(--nova-muted)]">On branch main · nothing to commit</div>
        <div>{"=> != === -> <= >= // ligatures"}</div>
      </div>
    </>
  );
}

function FeaturesSection() {
  const s = useSettings();
  return (
    <>
      <Heading>Features</Heading>
      <Row label="Suggest while typing" description="Show commands, flags, files, branches and scripts as you type. Tab always shows them.">
        <Toggle checked={s.suggestWhileTyping} onChange={(v) => s.update({ suggestWhileTyping: v })} />
      </Row>
      <Row label="Syntax highlighting" description="Colour commands, flags, strings and paths in the input box; unknown commands are underlined in red.">
        <Toggle checked={s.syntaxHighlighting} onChange={(v) => s.update({ syntaxHighlighting: v })} />
      </Row>
      <Row label="Copy on select" description="Selecting text in the terminal copies it right away.">
        <Toggle checked={s.copyOnSelect} onChange={(v) => s.update({ copyOnSelect: v })} />
      </Row>
      <Row label="Restore tabs on launch" description="Reopen your tabs in the same folders next time.">
        <Toggle checked={s.restoreSession} onChange={(v) => s.update({ restoreSession: v })} />
      </Row>
      <Row label="Scrollback" description="Lines of output kept per pane. Lower uses less memory with many tabs.">
        <Segmented<string>
          value={String(s.scrollback)}
          onChange={(v) => s.update({ scrollback: Number(v) })}
          options={[
            { value: "5000", label: "5k" },
            { value: "10000", label: "10k" },
            { value: "50000", label: "50k" },
            { value: "100000", label: "100k" },
          ]}
        />
      </Row>
      <Row label="New tabs open in">
        <Segmented<NewTabFolder>
          value={s.newTabFolder}
          onChange={(v) => s.update({ newTabFolder: v })}
          options={[
            { value: "current", label: "Current folder" },
            { value: "home", label: "Home folder" },
          ]}
        />
      </Row>
    </>
  );
}

const m = isMac ? "⌘" : "Ctrl+Shift+";
const SHORTCUTS: [string, string][] = [
  ["New tab", `${m}T`],
  ["Split pane right / down", `${appKey("D")} / ${appKey("D", true)}`],
  ["Close pane (or tab)", `${m}W`],
  ["Next / previous pane", `${m}] / ${m}[`],
  ["Go to tab 1–9", `${m}1 … ${m}9`],
  ["Next / previous tab", `${appKey("]", true)} / ${appKey("[", true)}  ·  ${isMac ? "⌃Tab / ⌃⇧Tab" : "Ctrl+Tab / Ctrl+Shift+Tab"}`],
  ["Command palette", `${m}P`],
  ["Show / hide tabs panel", `${m}B`],
  ["Settings", `${m},`],
  ["Clear terminal", `${m}K  ·  ${isMac ? "⌃L" : "Ctrl+L"}`],
  ["Bigger / smaller / reset text", `${m}= / ${m}- / ${m}0`],
  ["Run command", isMac ? "⏎" : "Enter"],
  ["Show / accept suggestions", isMac ? "⇥" : "Tab"],
  ["Accept grey suggestion", "→"],
  ["Format command", isMac ? "⌥⇧F" : "Alt+Shift+F"],
  ["New line in command", isMac ? "⇧⏎" : "Shift+Enter"],
  ["Previous / next command", "↑ / ↓"],
  ["Clear input · stop program", isMac ? "⌃C" : "Ctrl+C"],
  ...(isMac ? [] : ([["Copy / paste", "Ctrl+Shift+C / Ctrl+Shift+V"]] as [string, string][])),
  ["Open link", isMac ? "⌘click" : "Ctrl+click"],
];

function ShortcutsSection() {
  return (
    <>
      <Heading>Keyboard shortcuts</Heading>
      <div className="divide-y divide-[var(--nova-border)] rounded-lg border border-[var(--nova-border)]">
        {SHORTCUTS.map(([action, keys]) => (
          <div key={action} className="flex h-10 items-center justify-between px-4 text-[13px]">
            <span className="text-[var(--nova-text)]">{action}</span>
            <kbd className="font-sans text-[12px] text-[var(--nova-muted)]">{keys}</kbd>
          </div>
        ))}
      </div>
    </>
  );
}

/** Where Nova's source code lives. */
const REPO_URL = "https://github.com/umeshbakotiyadev/nova-terminal";

function AboutSection() {
  const link =
    "flex h-8 items-center gap-2 rounded-md border border-[var(--nova-border-strong)] px-3 text-[13px] text-[var(--nova-text)] hover:bg-[var(--nova-hover)]";
  return (
    <>
      <Heading>About</Heading>
      <div className="flex items-center gap-4">
        <img src="/nova.svg" alt="" className="size-14" />
        <div>
          <div className="text-[16px] font-semibold text-[var(--nova-text)]">Nova Terminal</div>
          <div className="text-[13px] text-[var(--nova-muted)]">Version {version} · Tauri + Rust + xterm.js</div>
        </div>
      </div>
      <p className="mt-6 max-w-[520px] text-[13px] leading-relaxed text-[var(--nova-muted)]">
        Settings are saved on this computer. Your shell history and tabs never leave your computer.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={link} onClick={() => void openUrl(REPO_URL)}>
          <ExternalLink size={14} /> Source code
        </button>
        <button type="button" className={link} onClick={() => void openUrl(`${REPO_URL}/issues/new/choose`)}>
          <Bug size={14} /> Report a problem
        </button>
      </div>
      <p className="mt-5 text-[12px] text-[var(--nova-faint)]">
        Open source under the MIT or Apache-2.0 licence, at your option.
      </p>
    </>
  );
}

function BackupSection() {
  const [exportParts, setExportParts] = useState<BackupParts>({
    settings: true,
    tabs: true,
    history: true,
    recentDirs: true,
  });
  const [loaded, setLoaded] = useState<NovaBackup | null>(null);
  const [importParts, setImportParts] = useState<BackupParts>({
    settings: true,
    tabs: true,
    history: true,
    recentDirs: true,
  });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setStatus(null);
    try {
      await task();
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const onExport = () =>
    run(async () => {
      const path = await exportBackup(exportParts);
      if (path) setStatus({ ok: true, text: `Saved to ${tildify(path)}` });
    });

  const onPick = () =>
    run(async () => {
      const backup = await pickBackup();
      if (!backup) return;
      const info = describeBackup(backup);
      setLoaded(backup);
      setImportParts({
        settings: info.settings > 0,
        tabs: info.tabs > 0,
        history: info.history > 0,
        recentDirs: info.recentDirs > 0,
      });
    });

  const onImport = () => {
    if (!loaded) return;
    const { tabsOpened } = applyBackup(loaded, importParts);
    setLoaded(null);
    setStatus({
      ok: true,
      text: tabsOpened
        ? `Imported. ${tabsOpened} tab${tabsOpened === 1 ? "" : "s"} opened next to your current ones.`
        : "Imported.",
    });
  };

  const info = loaded ? describeBackup(loaded) : null;

  return (
    <>
      <Heading>Backup & restore</Heading>
      <p className="mb-6 max-w-[560px] text-[13px] leading-relaxed text-[var(--nova-muted)]">
        Save everything that makes Nova yours into one file, then load it on another computer or after a reinstall. It's
        plain JSON, so you can keep it with your dotfiles or share it with a teammate.
      </p>

      <Label>Export</Label>
      <div className="mb-8 rounded-lg border border-[var(--nova-border)] p-4">
        <PartChecks parts={exportParts} onChange={setExportParts} />
        <button
          type="button"
          disabled={busy || !Object.values(exportParts).some(Boolean)}
          onClick={onExport}
          className="mt-4 flex h-8 items-center gap-2 rounded-md bg-[var(--nova-accent)] px-3 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          <Download size={14} /> Export to file…
        </button>
      </div>

      <Label>Import</Label>
      <div className="rounded-lg border border-[var(--nova-border)] p-4">
        {info ? (
          <>
            <div className="mb-3 text-[12.5px] text-[var(--nova-muted)]">
              Backup from{" "}
              <span className="text-[var(--nova-text)]">
                {info.exportedAt ? info.exportedAt.toLocaleString() : "an unknown date"}
              </span>
              . Choose what to bring in:
            </div>
            <PartChecks
              parts={importParts}
              onChange={setImportParts}
              counts={{
                settings: info.settings,
                tabs: info.tabs,
                history: info.history,
                recentDirs: info.recentDirs,
              }}
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={!Object.values(importParts).some(Boolean)}
                onClick={onImport}
                className="flex h-8 items-center gap-2 rounded-md bg-[var(--nova-accent)] px-3 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                <Upload size={14} /> Import
              </button>
              <button
                type="button"
                onClick={() => setLoaded(null)}
                className="h-8 rounded-md border border-[var(--nova-border-strong)] px-3 text-[13px] text-[var(--nova-muted)] hover:bg-[var(--nova-hover)] hover:text-[var(--nova-text)]"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-[12.5px] text-[var(--nova-muted)]">
              Pick a backup file. You'll see what's inside before anything changes. Tabs open next to your current
              ones; nothing is closed.
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onPick}
              className="mt-4 flex h-8 items-center gap-2 rounded-md border border-[var(--nova-border-strong)] px-3 text-[13px] text-[var(--nova-text)] hover:bg-[var(--nova-hover)] disabled:opacity-50"
            >
              <Upload size={14} /> Choose backup file…
            </button>
          </>
        )}
      </div>

      {status && (
        <div
          className={[
            "mt-4 flex items-center gap-2 text-[12.5px]",
            status.ok ? "text-[var(--nova-ansi-green)]" : "text-[var(--nova-red)]",
          ].join(" ")}
        >
          {status.ok ? <Check size={14} /> : <X size={14} />}
          <span className="min-w-0 break-all">{status.text}</span>
        </div>
      )}
    </>
  );
}

const PART_LABELS: { key: keyof BackupParts; label: string; hint: string }[] = [
  { key: "settings", label: "Settings & theme", hint: "font, colours, opacity, cursor, features" },
  { key: "tabs", label: "Open tabs", hint: "folders, names and split layouts" },
  { key: "history", label: "Command history", hint: "commands run in Nova" },
  { key: "recentDirs", label: "Recent folders", hint: "for the folder picker" },
];

function PartChecks({
  parts,
  onChange,
  counts,
}: {
  parts: BackupParts;
  onChange: (parts: BackupParts) => void;
  counts?: Record<keyof BackupParts, number>;
}) {
  return (
    <div className="space-y-2">
      {PART_LABELS.map(({ key, label, hint }) => {
        const missing = counts !== undefined && counts[key] === 0;
        return (
          <label
            key={key}
            className={["flex cursor-default items-center gap-3 text-[13px]", missing ? "opacity-40" : ""].join(" ")}
          >
            <input
              type="checkbox"
              checked={parts[key] && !missing}
              disabled={missing}
              onChange={(e) => onChange({ ...parts, [key]: e.target.checked })}
              className="size-4 accent-[var(--nova-accent)]"
            />
            <span className="text-[var(--nova-text)]">{label}</span>
            <span className="text-[12px] text-[var(--nova-faint)]">
              {counts ? (missing ? "not in this file" : `${counts[key]} ${key === "settings" ? "settings" : "items"}`) : hint}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ---- Controls --------------------------------------------------------------

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-6 text-[18px] font-semibold text-[var(--nova-text)]">{children}</h3>;
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 text-[12px] font-medium uppercase tracking-wide text-[var(--nova-faint)]">{children}</div>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-6 border-b border-[var(--nova-border)] py-3">
      <div className="min-w-0">
        <div className="text-[13.5px] text-[var(--nova-text)]">{label}</div>
        {description && <div className="mt-0.5 text-[12px] text-[var(--nova-muted)]">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative h-[22px] w-[38px] rounded-full transition-colors disabled:opacity-40",
        checked ? "bg-[var(--nova-accent)]" : "bg-[var(--nova-hover-strong)]",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-[3px] size-4 rounded-full bg-white shadow transition-all",
          checked ? "left-[19px]" : "left-[3px]",
        ].join(" ")}
      />
    </button>
  );
}

function Slider({
  min,
  max,
  step,
  value,
  disabled,
  onChange,
  format,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className={["flex items-center gap-3 transition-opacity", disabled ? "opacity-40" : ""].join(" ")}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-[180px] accent-[var(--nova-accent)] outline-none disabled:cursor-not-allowed"
      />
      <span className="w-12 text-right text-[12.5px] tabular-nums text-[var(--nova-muted)]">{format(value)}</span>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix: string;
}) {
  const btn =
    "grid size-8 place-items-center text-[16px] text-[var(--nova-muted)] hover:bg-[var(--nova-hover)] hover:text-[var(--nova-text)] disabled:opacity-40";
  return (
    <div className="flex items-center overflow-hidden rounded-md border border-[var(--nova-border-strong)]">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="w-14 text-center text-[13px] tabular-nums text-[var(--nova-text)]">
        {value}
        {suffix}
      </span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-[var(--nova-border-strong)] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={[
            "h-7 rounded px-3 text-[12.5px] transition-colors",
            o.value === value
              ? "bg-[var(--nova-hover-strong)] text-[var(--nova-text)]"
              : "text-[var(--nova-muted)] hover:text-[var(--nova-text)]",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ThemeCard({ theme, selected, onSelect }: { theme: NovaTheme; selected: boolean; onSelect: () => void }) {
  const t = theme.terminal;
  const swatches = [t.red, t.green, t.yellow, t.blue, t.magenta, t.cyan];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "overflow-hidden rounded-lg border text-left transition-all",
        selected
          ? "border-[var(--nova-accent)] ring-2 ring-[var(--nova-accent)]/40"
          : "border-[var(--nova-border-strong)] hover:border-[var(--nova-faint)]",
      ].join(" ")}
    >
      <div className="h-[78px] px-3 py-2.5 font-mono text-[11px] leading-[1.6]" style={{ background: t.background, color: t.foreground }}>
        <div>
          <span style={{ color: theme.accent }}>~/nova</span> ls
        </div>
        <div>
          <span style={{ color: t.blue }}>src</span> <span style={{ color: t.green }}>README.md</span>
        </div>
        <div className="mt-1.5 flex gap-1">
          {swatches.map((c, i) => (
            <span key={i} className="size-2.5 rounded-full" style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="flex h-8 items-center justify-between bg-[var(--nova-fill)] px-3 text-[12px] text-[var(--nova-text)]">
        {theme.name}
        {selected && <Check size={13} className="text-[var(--nova-accent)]" />}
      </div>
    </button>
  );
}
