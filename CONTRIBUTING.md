# Contributing to Myika Unreal

Thanks for considering a contribution. This document covers how to set up a development environment, the commit and PR conventions we use, and how the project's AI agent sessions enforce these conventions automatically.

## Development setup

See [`README.md`](README.md) for the full install. The short version:

- Windows 10 or 11
- Unreal Engine 5.7+ with Visual Studio 2022 (Game Development with C++ workload)
- Node.js 20+ and Rust stable
- Claude Code CLI installed and authenticated

```bash
git clone https://github.com/Myikaai/myika-unreal.git
cd myika-unreal

# Desktop app
cd desktop && npm install && npm run tauri dev

# UE plugin: copy ue-plugin/MyikaBridge into your project's Plugins/ folder,
# regenerate project files, and build via Visual Studio or Build.bat.
```

## Branch model

- `main` is the integration branch. It should always build.
- Feature work happens on short-lived branches named `feat/<scope>-<slug>`, `fix/<scope>-<slug>`, etc.
- Open a draft PR early. Mark it ready for review when CI passes (once CI exists) and you have a clean changelog entry.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/). The format is:

```
type(scope): subject

optional body

optional footer
```

**Types**

- `feat` — a new user-facing feature
- `fix` — a bug fix
- `docs` — documentation only
- `style` — formatting, whitespace, no behavior change
- `refactor` — code restructure with no behavior change
- `perf` — performance improvement
- `test` — adding or fixing tests
- `build` — build system or external dependencies
- `ci` — CI configuration
- `chore` — maintenance (deps, tooling, repo hygiene)
- `revert` — reverting a prior commit

**Scopes** (use the most specific that fits)

- `bridge` — WebSocket bridge protocol
- `desktop` — Tauri/Rust + React desktop app
- `plugin` — UE plugin (C++ + Python)
- `tools` — individual tool handlers
- `docs` — anything under `docs/` or top-level docs
- `security` — security model, policy, secret handling
- `memory` — auto-memory entries

**Examples**

```
feat(tools): add set_pin_default C++ handler
fix(bridge): handle WS reconnect when UE restarts
docs(security): document policy.json safe-mode profile
refactor(desktop): extract bridge-status hook
chore(memory): seed project_architecture entry
```

**Breaking changes**

Mark with `!` after the type/scope or include a `BREAKING CHANGE:` footer.

```
feat(bridge)!: rename `ok` to `success` in response envelope

BREAKING CHANGE: clients reading `payload.ok` must read `payload.success` instead.
```

A `commitlint.config.cjs` lives at the repo root; you can wire it into a Husky pre-commit hook locally if you want enforcement before push.

## Pull requests

- Fill out the PR template ([`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md)). It includes the commit-type checkbox and a checklist for `CHANGELOG.md`, `ROADMAP.md`, and docs updates.
- Update `CHANGELOG.md` `[Unreleased]` for any user-visible change in the same PR.
- Update `ROADMAP.md` if scope moves between Now / Next / Later.
- Update `docs/` if you change behavior or interfaces (`ARCHITECTURE.md`, `BRIDGE_PROTOCOL.md`, `TOOL_REFERENCE.md`, `SECURITY.md`).
- Internal-only material (day plans, session notes, demo spec, design handoff) lives in a separate private tree and should never appear in this repo.

## Reporting bugs and proposing features

- Bugs and feature requests use the templates under [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE).
- Security vulnerabilities use a [private security advisory](https://github.com/Myikaai/myika-unreal/security/advisories/new), not a public issue.

## Code of conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).

## How Claude Code sessions on this repo enforce these conventions

Myika Unreal is built primarily through Claude Code agent sessions. Two mechanisms keep the agent honest:

- **Auto-memory.** Three feedback memories — Conventional Commits, CHANGELOG/ROADMAP maintenance, public-tree hygiene — are loaded into every new session via the user's memory index. The agent reasons about them when proposing commits and writing files.
- **SessionStart hook.** A project-scoped `.claude/settings.json` runs a hook at session start that prints a one-screen rules card. The card is at [`.claude/session-start.md`](.claude/session-start.md). It restates the Conventional Commits format, the changelog/roadmap rule, and the public-tree hygiene rule so the agent has them in immediate context even without re-reading memory.

Both mechanisms point back to this document — there is one source of truth, and human contributors and the agent see the same one.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
