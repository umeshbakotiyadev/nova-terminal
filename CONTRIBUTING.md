# Contributing to Nova Terminal

Thanks for wanting to help. Bug reports, testing on your machine, documentation and code are all welcome.

## Ways to help

- **Report a bug.** Use the [bug report form](https://github.com/umeshbakotiyadev/nova-terminal/issues/new/choose). Your OS, shell and a screenshot make it much faster to fix.
- **Test on Windows.** Windows support is new. Trying Nova with PowerShell 7 and Windows PowerShell 5.1 and reporting what breaks is very useful.
- **Suggest a feature.** Open a feature request and describe the problem you want solved, not only the solution.
- **Send a pull request.** Small fixes can go straight to a PR. For anything bigger (a new feature, a new dependency, a change to how the shell integration works), open an issue first so we can agree on the approach before you spend time on it.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Getting set up

Follow [Build from source](README.md#build-from-source) in the README, then:

```bash
pnpm install
pnpm tauri dev
```

`pnpm tauri dev` opens Nova with hot reload: frontend changes appear instantly, and Rust changes rebuild and restart the app. Nova replaces the web view's right-click menu with its own; in a dev build, hold **Option** (Alt on Windows) while right-clicking to get the built-in one with **Inspect Element**.

## Finding your way around

| You want to change… | Look in |
| --- | --- |
| How a shell session starts, reads and writes | `src-tauri/src/pty.rs` |
| What the shell reports to Nova (prompt, command start and end, folder) | `src-tauri/shell-integration/` (zsh and PowerShell scripts) |
| Suggestion data from disk (commands on PATH, folders, branches, scripts, history) | `src-tauri/src/complete.rs` |
| The terminal, command blocks and escape-code handling | `src/components/TerminalView.tsx` |
| The input box | `src/components/InputBar.tsx` and `src/completion/` |
| Completions for a specific tool (git, docker, …) | `src/completion/specs.ts` |
| Tabs, panes and their layout | `src/stores/tabs.ts`, `src/stores/layout.ts`, `src/components/Workspace.tsx` |
| Keyboard shortcuts | `src/lib/shortcuts.ts` |
| Settings | `src/stores/settings.ts`, `src/components/SettingsView.tsx` |
| Themes | `src/themes/` |
| What the frontend may call in Rust | `src-tauri/capabilities/default.json` |

The README's [How it works](README.md#how-it-works) section explains how these fit together.

## Guidelines

### Code

- **TypeScript** is strict. `pnpm build` (type-check plus build) must pass. Follow the style of the code around you: two-space indents, double quotes, small focused components.
- **Rust** is formatted with `cargo fmt` (default settings) and should build without new warnings. Run `cargo test` in `src-tauri/`.
- **Comments** explain *why*, in plain words. A short doc comment on each exported function or component helps the next person.
- **Dependencies:** please don't add one for something a few lines of code can do. If you do need one, say why in the PR.

### macOS and Windows

Nova runs on both, so keep platform rules in one place:

- Use `isMac` and `isWindows` from `src/lib/platform.ts` rather than checking `navigator.platform` yourself.
- Show shortcuts with `appKey()` so labels read ⌘D on macOS and Ctrl+Shift+D on Windows.
- Handle paths with `src/lib/paths.ts`. Paths are kept with forward slashes internally (`C:/Users/me`), so the same code works on both.
- Escape text for the shell with `SHELL_ESCAPE` (a backslash for zsh, a backtick for PowerShell).
- In Rust, use `cfg!(windows)` or `#[cfg(target_os = "macos")]` and keep both sides compiling.

### Shell integration

The scripts in `src-tauri/shell-integration/` run inside people's own shells, after their own config, so they must be careful:

- Never change the user's settings beyond what Nova needs, and keep their prompt, history and key bindings working.
- `nova.ps1` must stay plain ASCII and work in both Windows PowerShell 5.1 and PowerShell 7.
- Test with a plain shell and with a popular setup (oh-my-zsh or starship for zsh, oh-my-posh for PowerShell).

### Design

Nova aims to feel calm and polished. Keep animations short and subtle (no bouncing or springy overshoot), respect the Animations setting and Reduce Motion, and check new UI in both a dark and a light theme.

## Before you open a pull request

- [ ] `pnpm build` passes
- [ ] `cargo fmt --check` and `cargo test` pass in `src-tauri/` (if you changed Rust)
- [ ] You tried the change in the app on at least one platform, and said which in the PR
- [ ] For visible changes, the PR has a screenshot or short recording
- [ ] User-facing changes have a line in `CHANGELOG.md` under **Unreleased**

Keep each pull request to one topic; several small PRs are easier to review than one large one. Write commit messages as a short summary in the imperative ("Add bash integration", "Fix tab name for drive roots"), with more detail in the body if needed.

CI runs on every pull request: it builds the frontend, checks Rust formatting, and compiles and tests the app on macOS and Windows.

## Releasing (maintainers)

1. Update the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Move the **Unreleased** notes in `CHANGELOG.md` under the new version and date.
3. Commit, then tag and push: `git tag v0.2.0 && git push origin main v0.2.0`.
4. The **Release** workflow builds the macOS and Windows installers and attaches them to a draft release. Check it and publish it.

## Licensing

Nova Terminal is dual licensed under MIT or Apache-2.0. Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in Nova Terminal by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.
