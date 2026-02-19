# Repository Guidelines

## Project Structure & Module Organization
This repository is split into a Python backend and a React/TypeScript frontend.

- `backend/`: FastAPI service (`backend/main.py`) with domain modules in `api/`, `core/`, `parsing/`, `realtime/`, and `serial/`.
- `backend/test/`: Pytest suites grouped by domain (`core/`, `parsing/`, `realtime/`, `architecture/`).
- `frontend/src/`: UI and client logic. Main app entry is `src/main.tsx`, with feature code under `src/domain/**` and app shell in `src/app/`.
- `frontend/dist/`: Built frontend assets.
- `doc/plan/`: Design/planning documents.

## Build, Test, and Development Commands
Run all commands from repo root unless noted.

- `bun run dev`: Starts frontend watcher and backend API together.
- `bun run dev:frontend`: Frontend watch build only.
- `bun run dev:backend`: Backend with `uvicorn` reload on port `8080`.
- `bun run build`: Production frontend build into `frontend/dist/`.
- `bun run lint`: Runs Biome checks for frontend code.
- `bun run test`: Runs frontend (`vitest`) then backend (`pytest`) tests.
- `bun run test:frontend` / `bun run test:backend`: Run one test stack.

## Coding Style & Naming Conventions
- Frontend formatting/linting is enforced by Biome (`frontend/biome.json`): 2-space indent, single quotes, semicolons required.
- React components use `PascalCase` filenames (for example `StatusStrip.tsx`); utility and service modules use `camelCase`/lowercase (for example `monitorSocket.ts`).
- Backend follows standard Python conventions: 4-space indent, `snake_case` functions/modules, typed models in `backend/core/models.py`.

## Testing Guidelines
- **Use TDD**: Write a failing test first, then implement the minimal fix, then verify all tests pass.
- Backend: `pytest` with tests under `backend/test/` named `test_*.py`.
- Frontend: `vitest` with colocated tests like `*.test.ts`.
- Add or update tests in the same domain area as the change.
- Before claiming work is done, **always run `bun run test` and `bun run lint`** and verify they pass.
- For UI and integration changes, verify with **Playwright via `bun run demo`** to confirm end-to-end behavior works.

## Commit & Pull Request Guidelines
Current history uses short, imperative commit subjects (for example: `Add ...`, `Initial commit`). Keep commits focused and descriptive.

For pull requests:
- Explain what changed and why.
- Link related issue/task IDs.
- Include screenshots or recordings for UI changes.
- Note local verification steps and results (`bun run lint`, `bun run test`).
