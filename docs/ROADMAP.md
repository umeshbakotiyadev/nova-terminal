# Roadmap

Where Nova Terminal is heading. Ticked items are in the code today; unticked ones are open for discussion and pull requests. If you want to pick something up, open an issue first so we can agree on the approach.

| Phase | Goal | Status |
| --- | --- | --- |
| 0 — Foundation | Tauri app, real shell in a window, tabs | ✅ Done |
| 1 — Core terminal | Vertical tabs, input box, command blocks, palette, split panes, settings, themes, session restore, opacity and blur, Windows support | ✅ Done (Windows needs real-world testing) |
| 2 — Smart input | Completions, history search, workflows, secret redaction | 🚧 In progress |
| 3 — AI (opt-in) | Ask for a command in plain words, explain an error, bring your own model or key | ⏳ Planned |
| 4 — Power features | Tab configs, drop-down (Quake) window, SSH sessions with blocks, signed and notarised builds, auto-update | ⏳ Planned |

## Phase 0

- [x] Tauri 2 + React + TypeScript + Tailwind project
- [x] Rust PTY sessions (spawn, stream, write, resize, kill)
- [x] xterm.js with WebGL, links, Unicode 11
- [x] Keyboard shortcuts (tabs, clear, zoom)
- [x] App icon

## Phase 1

- [x] zsh shell integration (OSC 133 + OSC 7)
- [x] Top bar with centred search
- [x] Vertical tabs panel with folder, git branch, running and failed indicators
- [x] Input box with folder and branch chips, multi-line editing, history
- [x] Command blocks with dividers; failed blocks in red
- [x] Command palette (⌘P)
- [x] Split panes (⌘D / ⌘⇧D), resizable, restored on launch
- [x] Settings screen (⌘,) with Appearance, Text & cursor, Features, Shortcuts, Backup & restore, About
- [x] 11 themes (Nova Dark/Light, Dracula, Tokyo Night, Catppuccin, One Dark, GitHub Dark/Light, Nord, Gruvbox, Solarized)
- [x] Session restore (tabs, split layouts, folders)
- [x] Window opacity and blur
- [x] Copy on select, new-tab folder choice
- [x] Windows: own title bar and window buttons, PowerShell integration (input box, blocks, exit codes, folder, cmdlet suggestions), Windows keys and `C:\` paths, Acrylic blur
- [ ] Windows: confirmed on real Windows 10 and 11 machines
- [ ] bash and fish shell integration (they run as a classic terminal today)
- [ ] Linux build tested and documented

## Phase 2 (in progress)

- [x] Suggestions while typing: commands, subcommands, flags, files, folders, git branches, package.json scripts
- [x] Grey history suggestion (→ to accept)
- [x] Syntax highlighting in the input box, unknown commands underlined
- [x] Format command (⌥⇧F)
- [x] Folder and branch pickers on the input chips
- [ ] ⌃R history search panel
- [ ] Workflows (saved, parameterised commands)
- [ ] Secret redaction in output
- [ ] Search inside a block's output

## Later

- [ ] Code signing (Apple Developer ID, Windows Authenticode) and auto-update
- [ ] Opt-in AI features
- [ ] Custom themes from a file
