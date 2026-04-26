Myika Unreal session conventions

1. Conventional Commits for every new commit.
   Format: type(scope): subject
   Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
   Scopes: bridge, desktop, plugin, tools, docs, security, memory, repo

2. Update CHANGELOG.md [Unreleased] in the same commit as any user-visible change.
   Update ROADMAP.md if scope moves between Now / Next / Later.
   Skip for pure refactors, internal-only edits, memory edits.

3. Public-tree hygiene: never write internal-only content into this repo.
   Internal goes to ../myika-unreal-internal/.
   Banned filenames here: CLAUDE-DEV.md, LESSONS.md, *_SPEC.md, DAY*_PLAN.md, PRIMITIVES_BACKLOG.md.

Sources of truth:
- CONTRIBUTING.md — full contributor guide
- ../myika-unreal-internal/CLAUDE-DEV.md — runtime agent context (private)
- User auto-memory MEMORY.md — Conventional Commits / changelog rule / hygiene rule feedback memories
