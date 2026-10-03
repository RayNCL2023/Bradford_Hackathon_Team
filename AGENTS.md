# Rules for AI agents (and humans) on AI Beat Studio

Hackathon project, 5 people, each with an AI agent, working in parallel. These rules keep merges fast and conflict-free. Follow them exactly.

## 1. Stay in your lane
Each person owns one branch and one folder. **Only edit files inside your own folder.**

| Person | Branch | You may edit |
|---|---|---|
| 1 Shell / lead | `feat/shell` | `src/shell/`, `src/shared/`, `main.cjs`, `preload.cjs`, root config |
| 2 Piano roll | `feat/pianoroll` | `src/pianoroll/` |
| 3 Audio engine | `feat/audio` | `src/audio/` |
| 4 AI producer | `feat/ai` | `src/ai/` |
| 5 Vocals + tips | `feat/voice` | `src/voice/`, `pitch/` |

Need something changed outside your folder (a new IPC channel, a contract field, a new npm package)? Ask Person 1. Do not do it yourself.

## 2. The contract is law
`src/shared/contracts.js` defines the data passed between modules (Note, Track, Project, AiRequest, AiResult, VocalClip). Use those shapes exactly. Keep your module's exported functions (listed at the top of each `index.js`) with the same names and arguments, so other modules keep working. You may add functions; don't rename or remove them.

## 3. Always runnable
Main must always start with `npm start`. Use `src/shared/mock.js` for fake data until the real modules land, so you never wait on anyone.

## 4. Merge often (every 30-45 min, or whenever something works)
```bash
git fetch origin
git rebase origin/main          # bring in everyone else's work
npm run check                   # must pass
git push -f origin HEAD         # update your own branch only
git checkout main && git pull --ff-only
git merge --ff-only <your-branch> && git push origin main
git checkout <your-branch>
```
- If `merge --ff-only` fails, someone merged first: go back to the rebase step.
- If the rebase hits a conflict in a file you don't own, take main's version (`git checkout --theirs <file>`, then `git rebase --continue`).
- Never force-push `main`. Never commit `.env` or API keys.
- If you broke main, fixing it is your top priority.

## 5. Code style
Plain modern JavaScript (ES modules in `src/`, CommonJS only for `*.cjs` main-process files). No frameworks and no build step. Small commits with clear messages. Comment only what isn't obvious.

## 6. Merge points
12:15 (merge 1), 13:30 (merge 2), 14:30 (merge 3 = feature freeze, bug fixes only after this).
