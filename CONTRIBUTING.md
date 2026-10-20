# Contributing to Calens

Issues and pull requests are welcome. For questions and ideas, join the [Calens Discord](https://discord.gg/Rymuy4BVpY).

## Setup

1. Install Node 24. The version is pinned in `.nvmrc`, so `fnm use` or `nvm use` picks it up.
2. Install dependencies and build the extension:

   ```bash
   npm ci
   npm run build-dev
   ```

3. Open `chrome://extensions`, enable Developer mode, click "Load unpacked" and select the `dist/` folder.
4. After each rebuild, click reload on Calens in `chrome://extensions`.

Google Calendar's DOM is undocumented. The notes in [docs/google-calendar-dom.md](docs/google-calendar-dom.md) record what has been verified live. Check them before writing code or fixtures that read Google's markup, and update them with the date when you verify something new.

## Before opening a pull request

All of these must pass:

```bash
npm run typecheck   # 0 errors
npm run lint        # 0 errors
npm run test        # Vitest unit tests
npm run test:e2e    # Playwright, against the real dist/ build, fully offline
```

Add or update tests for the behavior you change. Keep the pull request focused on one change.

## Licensing

By contributing, you agree that your contribution is released under the [MIT License](LICENSE).
