/**
 * What Nova knows about common commands: a description, subcommands, flags,
 * and what kind of argument they take (so `cd` suggests only folders,
 * `git checkout` suggests branches, `npm run` suggests package.json scripts).
 */

export type ArgKind = "path" | "folder" | "branch" | "script" | "none";

export interface Option {
  name: string;
  description: string;
}

export interface Subcommand {
  name: string;
  description: string;
  options?: Option[];
  args?: ArgKind;
}

export interface Spec {
  name: string;
  description: string;
  subcommands?: Subcommand[];
  options?: Option[];
  args?: ArgKind;
  /** Package managers where `pnpm <script>` works without `run`. */
  scriptsAsSubcommands?: boolean;
}

const o = (name: string, description: string): Option => ({ name, description });
const sub = (name: string, description: string, args?: ArgKind, options?: Option[]): Subcommand => ({
  name,
  description,
  args,
  options,
});

const nodePackageManager = (name: string, description: string, install: string, add: string): Spec => ({
  name,
  description,
  scriptsAsSubcommands: name !== "npm",
  subcommands: [
    sub(install, "Install all dependencies", "none"),
    sub(add, "Add a package", "none", [o("-D", "Save as a dev dependency"), o("-g", "Install globally")]),
    sub("remove", "Remove a package", "none"),
    sub("run", "Run a package.json script", "script"),
    sub("test", "Run the test script", "none"),
    sub("start", "Run the start script", "none"),
    sub("init", "Create a package.json", "none"),
    sub("update", "Update packages", "none"),
    sub("outdated", "List outdated packages", "none"),
    sub("publish", "Publish to the registry", "none"),
    sub(name === "npm" ? "exec" : "dlx", "Run a package without installing it", "none"),
    ...(name === "npm"
      ? [sub("ci", "Clean install from the lockfile", "none"), sub("audit", "Check for vulnerabilities", "none"), sub("uninstall", "Remove a package", "none")]
      : []),
  ],
});

export const SPECS: Spec[] = [
  {
    name: "git",
    description: "Version control",
    subcommands: [
      sub("status", "Show changed files", "none", [o("-s", "Short format"), o("-b", "Show branch")]),
      sub("add", "Stage changes", "path", [o(".", "Stage everything here"), o("-A", "Stage all changes"), o("-p", "Pick hunks interactively")]),
      sub("commit", "Record staged changes", "none", [
        o("-m", "Commit message"),
        o("-a", "Stage tracked files first"),
        o("--amend", "Rewrite the last commit"),
        o("--no-verify", "Skip hooks"),
      ]),
      sub("push", "Upload commits", "branch", [
        o("-u", "Set upstream"),
        o("--force-with-lease", "Safe force push"),
        o("--tags", "Push tags"),
        o("origin", "Default remote"),
      ]),
      sub("pull", "Fetch and merge", "branch", [o("--rebase", "Rebase instead of merge"), o("origin", "Default remote")]),
      sub("fetch", "Download refs", "none", [o("--all", "All remotes"), o("--prune", "Remove deleted branches")]),
      sub("checkout", "Switch branches or restore files", "branch", [o("-b", "Create and switch to a branch"), o("--", "Restore files")]),
      sub("switch", "Switch branches", "branch", [o("-c", "Create and switch")]),
      sub("branch", "List, create or delete branches", "branch", [
        o("-a", "Include remote branches"),
        o("-d", "Delete a merged branch"),
        o("-D", "Force delete a branch"),
        o("-m", "Rename a branch"),
      ]),
      sub("merge", "Join branches", "branch", [o("--no-ff", "Always create a merge commit"), o("--abort", "Abort the merge")]),
      sub("rebase", "Reapply commits on top of another base", "branch", [
        o("-i", "Interactive"),
        o("--continue", "Continue after resolving"),
        o("--abort", "Abort the rebase"),
      ]),
      sub("log", "Show commit history", "none", [
        o("--oneline", "One line per commit"),
        o("--graph", "Draw the branch graph"),
        o("-n", "Limit the number of commits"),
        o("--stat", "Show changed files"),
      ]),
      sub("diff", "Show changes", "path", [o("--staged", "Staged changes"), o("--stat", "Summary only"), o("--name-only", "File names only")]),
      sub("stash", "Shelve changes", "none", [o("pop", "Apply and drop the latest stash"), o("list", "List stashes"), o("apply", "Apply a stash"), o("-u", "Include untracked files")]),
      sub("clone", "Copy a repository", "none", [o("--depth", "Shallow clone")]),
      sub("init", "Create a repository", "folder"),
      sub("reset", "Undo commits or unstage", "path", [o("--soft", "Keep changes staged"), o("--hard", "Discard changes"), o("HEAD~1", "Previous commit")]),
      sub("restore", "Restore files", "path", [o("--staged", "Unstage files")]),
      sub("remote", "Manage remotes", "none", [o("-v", "Show URLs"), o("add", "Add a remote")]),
      sub("tag", "Manage tags", "none", [o("-a", "Annotated tag")]),
      sub("cherry-pick", "Apply a commit from elsewhere", "none"),
      sub("revert", "Undo a commit with a new commit", "none"),
      sub("show", "Show a commit", "none"),
      sub("blame", "Who changed each line", "path"),
    ],
  },
  nodePackageManager("npm", "Node package manager", "install", "install"),
  nodePackageManager("pnpm", "Fast Node package manager", "install", "add"),
  nodePackageManager("yarn", "Node package manager", "install", "add"),
  nodePackageManager("bun", "JavaScript runtime and package manager", "install", "add"),
  { name: "npx", description: "Run a Node package", args: "none" },
  {
    name: "docker",
    description: "Containers",
    subcommands: [
      sub("ps", "List running containers", "none", [o("-a", "Include stopped containers")]),
      sub("run", "Run a container", "none", [o("-it", "Interactive terminal"), o("-d", "Run in background"), o("-p", "Publish a port"), o("--rm", "Remove when it exits"), o("-v", "Mount a volume"), o("--name", "Container name")]),
      sub("build", "Build an image", "folder", [o("-t", "Tag the image"), o("-f", "Dockerfile path")]),
      sub("exec", "Run a command in a container", "none", [o("-it", "Interactive terminal")]),
      sub("images", "List images", "none"),
      sub("logs", "Show container logs", "none", [o("-f", "Follow")]),
      sub("stop", "Stop containers", "none"),
      sub("start", "Start containers", "none"),
      sub("rm", "Remove containers", "none", [o("-f", "Force")]),
      sub("rmi", "Remove images", "none"),
      sub("pull", "Download an image", "none"),
      sub("push", "Upload an image", "none"),
      sub("compose", "Multi-container apps (up, down, logs, ps)", "none", [o("up", "Start services"), o("down", "Stop services"), o("logs", "Show logs"), o("-d", "Run in background")]),
    ],
  },
  {
    name: "brew",
    description: "macOS package manager",
    subcommands: [
      sub("install", "Install a package", "none", [o("--cask", "Install an app")]),
      sub("uninstall", "Remove a package", "none"),
      sub("update", "Update Homebrew", "none"),
      sub("upgrade", "Upgrade packages", "none"),
      sub("list", "Installed packages", "none"),
      sub("search", "Find packages", "none"),
      sub("info", "Package details", "none"),
      sub("services", "Manage background services", "none"),
      sub("doctor", "Check for problems", "none"),
      sub("cleanup", "Remove old versions", "none"),
    ],
  },
  {
    name: "cargo",
    description: "Rust package manager",
    subcommands: [
      sub("build", "Compile the project", "none", [o("--release", "Optimised build")]),
      sub("run", "Build and run", "none", [o("--release", "Optimised build")]),
      sub("test", "Run tests", "none"),
      sub("check", "Check for errors without building", "none"),
      sub("add", "Add a dependency", "none"),
      sub("new", "Create a project", "folder"),
      sub("init", "Create a project here", "none"),
      sub("fmt", "Format code", "none"),
      sub("clippy", "Lint code", "none"),
      sub("doc", "Build documentation", "none", [o("--open", "Open in a browser")]),
      sub("update", "Update dependencies", "none"),
      sub("publish", "Publish to crates.io", "none"),
    ],
  },
  {
    name: "gh",
    description: "GitHub CLI",
    subcommands: [
      sub("pr", "Pull requests (create, list, checkout, view)", "none", [o("create", "Open a pull request"), o("list", "List pull requests"), o("checkout", "Check out a pull request"), o("view", "View a pull request")]),
      sub("issue", "Issues (create, list, view)", "none"),
      sub("repo", "Repositories (create, clone, view)", "none"),
      sub("run", "Workflow runs (list, view, watch)", "none"),
      sub("auth", "Log in and out", "none"),
      sub("browse", "Open the repo in a browser", "none"),
    ],
  },
  { name: "cd", description: "Change folder", args: "folder" },
  { name: "ls", description: "List files", args: "path", options: [o("-l", "Long format"), o("-a", "Include hidden files"), o("-la", "Long format with hidden files"), o("-h", "Readable sizes"), o("-t", "Sort by time"), o("-R", "Recursive")] },
  { name: "pwd", description: "Print current folder", args: "none" },
  { name: "cat", description: "Print files", args: "path" },
  { name: "less", description: "Page through a file", args: "path" },
  { name: "head", description: "First lines of a file", args: "path", options: [o("-n", "Number of lines")] },
  { name: "tail", description: "Last lines of a file", args: "path", options: [o("-f", "Follow new lines"), o("-n", "Number of lines")] },
  { name: "mkdir", description: "Create folders", args: "folder", options: [o("-p", "Create parents as needed")] },
  { name: "rm", description: "Delete files", args: "path", options: [o("-r", "Folders and contents"), o("-f", "Don't ask"), o("-rf", "Force delete folders"), o("-i", "Ask before each")] },
  { name: "rmdir", description: "Delete empty folders", args: "folder" },
  { name: "cp", description: "Copy files", args: "path", options: [o("-r", "Copy folders"), o("-i", "Ask before overwriting"), o("-v", "Verbose")] },
  { name: "mv", description: "Move or rename", args: "path", options: [o("-i", "Ask before overwriting"), o("-v", "Verbose")] },
  { name: "touch", description: "Create an empty file", args: "path" },
  { name: "open", description: "Open with the default app", args: "path", options: [o("-a", "Choose the app"), o(".", "Open this folder in Finder")] },
  { name: "code", description: "Open in VS Code", args: "path" },
  { name: "cursor", description: "Open in Cursor", args: "path" },
  { name: "grep", description: "Search text", args: "path", options: [o("-r", "Search folders"), o("-i", "Ignore case"), o("-n", "Show line numbers"), o("-v", "Invert match"), o("-E", "Extended regex"), o("-l", "File names only")] },
  { name: "rg", description: "ripgrep: fast search", args: "path", options: [o("-i", "Ignore case"), o("-l", "File names only"), o("-g", "Glob filter")] },
  { name: "find", description: "Find files", args: "folder", options: [o("-name", "Match file name"), o("-type", "f = file, d = folder"), o("-mtime", "Modified time")] },
  { name: "curl", description: "Transfer data from URLs", args: "none", options: [o("-X", "HTTP method"), o("-H", "Header"), o("-d", "Request body"), o("-o", "Save to file"), o("-L", "Follow redirects"), o("-s", "Silent"), o("-I", "Headers only")] },
  { name: "wget", description: "Download files", args: "none" },
  { name: "chmod", description: "Change permissions", args: "path", options: [o("+x", "Make executable"), o("-R", "Recursive")] },
  { name: "chown", description: "Change owner", args: "path", options: [o("-R", "Recursive")] },
  { name: "tar", description: "Archive files", args: "path", options: [o("-xzf", "Extract .tar.gz"), o("-czf", "Create .tar.gz"), o("-tf", "List contents")] },
  { name: "zip", description: "Create a zip", args: "path", options: [o("-r", "Include folders")] },
  { name: "unzip", description: "Extract a zip", args: "path" },
  { name: "ssh", description: "Remote shell", args: "none" },
  { name: "scp", description: "Copy over SSH", args: "path", options: [o("-r", "Copy folders")] },
  { name: "echo", description: "Print text", args: "none" },
  { name: "clear", description: "Clear the screen", args: "none" },
  { name: "history", description: "Command history", args: "none" },
  { name: "which", description: "Where a command lives", args: "none" },
  { name: "man", description: "Manual pages", args: "none" },
  { name: "top", description: "Running processes", args: "none" },
  { name: "htop", description: "Interactive process viewer", args: "none" },
  { name: "ps", description: "List processes", args: "none", options: [o("aux", "All processes")] },
  { name: "kill", description: "Stop a process", args: "none", options: [o("-9", "Force kill")] },
  { name: "lsof", description: "Open files and ports", args: "none", options: [o("-i", "Network, e.g. -i :3000")] },
  { name: "ping", description: "Check a host", args: "none" },
  { name: "node", description: "Run JavaScript", args: "path" },
  { name: "python3", description: "Run Python", args: "path", options: [o("-m", "Run a module"), o("-c", "Run code")] },
  { name: "pip3", description: "Python packages", args: "none", options: [o("install", "Install a package")] },
  { name: "go", description: "Go toolchain", subcommands: [sub("run", "Run a program", "path"), sub("build", "Compile", "none"), sub("test", "Run tests", "none"), sub("mod", "Modules", "none"), sub("get", "Add a dependency", "none")] },
  { name: "make", description: "Run Makefile targets", args: "none" },
  { name: "vim", description: "Edit a file", args: "path" },
  { name: "nvim", description: "Edit a file", args: "path" },
  { name: "nano", description: "Edit a file", args: "path" },
  { name: "source", description: "Run a file in this shell", args: "path" },
  { name: "export", description: "Set an environment variable", args: "none" },
  { name: "tsc", description: "TypeScript compiler", args: "none", options: [o("--noEmit", "Type-check only"), o("-w", "Watch")] },
  { name: "kubectl", description: "Kubernetes", subcommands: [sub("get", "List resources", "none"), sub("describe", "Show details", "none"), sub("apply", "Apply a manifest", "path"), sub("logs", "Show logs", "none"), sub("exec", "Run in a pod", "none"), sub("delete", "Delete resources", "none")] },
];

const byName = new Map(SPECS.map((s) => [s.name, s]));

export const specFor = (command: string | null): Spec | undefined =>
  command ? byName.get(command) : undefined;

/** Shell builtins and keywords (always valid commands). */
export const BUILTINS = [
  "cd", "echo", "export", "source", ".", "alias", "unalias", "exit", "history", "pwd", "pushd", "popd",
  "type", "which", "set", "unset", "eval", "exec", "jobs", "fg", "bg", "kill", "wait", "read", "printf",
  "test", "[", "[[", "true", "false", "time", "ulimit", "umask", "local", "return", "shift", "trap",
  "builtin", "command", "hash", "autoload", "setopt", "unsetopt", "bindkey", "zle", "compdef", "print",
  "emulate", "typeset", "declare", "let", "rehash", "if", "then", "else", "elif", "fi", "for", "while",
  "do", "done", "case", "esac", "function", "noglob", "nocorrect", "sudo", "clear",
];

/** Words that run the next word as a command (`sudo npm i`). */
export const PRECOMMANDS = new Set(["sudo", "nohup", "time", "env", "exec", "command", "builtin", "noglob", "nocorrect", "xargs", "watch"]);
