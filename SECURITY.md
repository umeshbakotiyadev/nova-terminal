# Security policy

## Supported versions

Security fixes go into the latest release. Please update to it before reporting.

## Reporting a problem

Please **don't open a public issue** for a security problem. Report it privately through GitHub instead:

**[Report a vulnerability](https://github.com/umeshbakotiyadev/nova-terminal/security/advisories/new)**

Include what you found, how to reproduce it, the Nova version and your OS. You'll get a reply within a week. Once a fix is released, you'll be credited in the advisory unless you'd rather not be.

## What's in scope

Nova runs your shell with your own permissions, so running commands is expected behaviour. Problems we especially want to hear about:

- Output from a program (for example `cat` on a file you downloaded) that makes Nova run commands, write files, open links or change its settings without you asking. Nova reads escape codes from shell output for its blocks, folder and suggestions, so spoofed codes are worth checking.
- The frontend reaching Rust commands or files outside what it needs (see `src-tauri/capabilities/`).
- The shell integration scripts weakening your shell's security or leaking information.
- Backup files that can do more than restore Nova's settings and tabs when imported.

Problems in Tauri, xterm.js or other dependencies are best reported to those projects, but please tell us too if Nova is affected.
