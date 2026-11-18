# Changelog

Notable changes to Nova Terminal are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-18

First public release.

### Added

- Your login shell in a GPU-accelerated terminal (xterm.js with WebGL), with full colour, mouse support and full-screen apps.
- Command blocks: each command and its output form one block; failed commands get a red edge and their exit code; a divider marks where a running command begins.
- Input box at the prompt with multi-line editing, history, syntax colouring, unknown commands underlined and command formatting (⌥⇧F).
- Suggestions as you type: commands, subcommands and flags for 60+ tools, files and folders, git branches, `package.json` scripts and history, plus a grey history suggestion.
- Vertical tabs with folder, git branch, running and failed indicators; drag to reorder and double-click to rename.
- Split panes with resizable dividers; tabs and layouts restored on launch.
- Folder and branch pickers on the input box chips.
- Command palette, 11 themes, and settings for font, cursor, opacity, blur, animations and scrollback.
- Backup and restore of settings, tabs, history and recent folders.
- Shell integration for zsh and PowerShell.
- Windows support: Nova's own title bar and window buttons, PowerShell 7 or Windows PowerShell, Windows shortcuts and paths, Acrylic background blur.

[Unreleased]: https://github.com/umeshbakotiyadev/nova-terminal/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/umeshbakotiyadev/nova-terminal/releases/tag/v0.1.0
