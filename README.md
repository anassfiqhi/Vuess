# Vuess

A local two-player chess game built with Vue 3, TypeScript, Pinia and chess.js. It includes per-game rules (Beginner, Casual, Strict or custom), clocks with increment, move history with position browsing, undo/redo, automatic saving, PGN import/export, and full keyboard and touch support.

## Getting started

Requires Node 20+ and pnpm.

```sh
pnpm install
pnpm dev            # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server |
| `pnpm build` | Type-check, then production build to `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm type-check` | `vue-tsc` across app, tests and tooling configs |
| `pnpm lint` / `pnpm lint:fix` | ESLint (Vue + TypeScript recommended rules) |
| `pnpm test` | Vitest unit and component tests |
| `pnpm test:e2e` | Playwright browser tests on desktop and mobile Chrome (builds first; run `pnpm exec playwright install chromium` once) |
| `pnpm check` | Type-check, lint, unit tests and build |

## Architecture

```
src/
  App.vue                       Shell: header, nav, <RouterView>; starts the game runtime
  router/index.ts               /  /settings  /about  (+ catch-all → /)
  views/                        GameView (orchestration), SettingsView, AboutView
  stores/settings.ts            Preferences (theme, sound, animation, coordinates, orientation)
  components/                   App-wide UI: BaseDialog, ConfirmDialog, AppIcon
  features/chess/
    types.ts                    Domain types: GameRecord, MoveInput, RecordedMove, Outcome, Result…
    services/chessRules.ts      The only module that imports chess.js; reports position facts
    services/gameRules.ts       Rule presets and outcome policy (what those facts mean under the game's rules)
    services/clock.ts           Pure clock maths and presets
    services/timeSource.ts      Injectable monotonic clock (performance.now)
    services/persistence.ts     Versioned save/load and validation of untrusted records
    services/storage.ts         localStorage access that never throws
    stores/game.ts              The game store: move pipeline, clocks, undo/redo, results, PGN
    composables/
      useBoardInteraction.ts    One move pipeline for tap, drag and keyboard
      useGameRuntime.ts         Restore on start, clock ticker, lifecycle saves
      useSound.ts, useReducedMotion.ts
    components/                 ChessBoard, BoardSquare, ChessPiece, PlayerPanel, ChessClock,
                                MoveHistory, GameControls, the dialogs, SettingsPanel
    assets/pieces.ts            Piece artwork (two-layer SVG paths: halo + body, coloured via CSS variables)
```

### Data flow

- **The game record is the source of truth.** `GameRecord` (in `types.ts`) is plain, versioned JSON. It holds the initial FEN, every accepted move, a cursor (moves after the cursor form the redo stack), players, time control, one clock checkpoint per move, and an explicit outcome.
- **Everything else is derived.** The board, side to move, legal moves, check, last move and rule-based endings are recomputed by replaying `moves[0..cursor]` through `chessRules.ts`. The app never stores a chess.js instance. Replaying from the start, rather than loading the last FEN, keeps the position history that threefold repetition needs.
- **Every change is one atomic commit.** The store builds a complete new record (move, clock checkpoint, outcome), then swaps it in with one assignment and saves it. Illegal or rejected moves never touch the record.
- **Fallible operations return `Result<T>`.** `tryMove`, `undoMove`, `importPgn`, `restoreGame` and others return `{ ok: true, value }` or `{ ok: false, error }`, where the error is a user-facing message. Expected failures never throw.
- **Interaction state stays out of the store.** Selection, pending promotion, drag position and the history position being viewed live in `useBoardInteraction` and `GameView`, and are never saved.
- **The board is reusable.** `ChessBoard` takes typed props (position, orientation, selection, targets) and emits `activate`, `drag-start`, `drop` and `cancel`. It knows nothing about the store or the rules.

### Move pipeline

Tap, drag and keyboard all go through `useBoardInteraction`:

1. Select a piece of the side to move.
2. Show its legal destinations.
3. Request a destination.
4. If the move is a promotion, open the picker without committing anything. Cancelling leaves the game untouched.
5. Call `game.tryMove`. It rejects the move if the game is over, paused or out of time, or if the move is illegal.
6. On success the store commits the move, the clock checkpoint and any rule-based outcome together.
7. Clear the interaction state; animate the move, play sound and announce it to screen readers.

Moves are disabled while viewing an earlier position, while paused, and after the game ends.

## Game policies

### Rules

Each game stores a `GameRules` object, chosen in the New game dialog and fixed for that game. New games, Settings → Reset and imported PGNs use **Chess.com style**, and the New game dialog always opens with it selected. The other presets follow it, then **Customized rules**, a separate choice for your own rule set.

| Option | Group | Chess.com style (default) | Beginner | Casual | Strict |
| --- | --- | --- | --- | --- | --- |
| En passant | chess rule | on | on | on | on |
| Repetition / fifty-move draws | chess rule | automatic | automatic | automatic | must be claimed |
| Takebacks (undo/redo) | helper | off | on | on | off |
| Show legal moves | helper | on | on | on | off |
| Highlight last move | helper | on | on | on | on |
| Check warning (status text and sound) | helper | on | on | on | off |
| Show captured pieces | helper | on | on | on | on |
| Auto-promote to queen | helper | off | on | off | off |
| Rotate board each turn | helper | off | off | off | off |

**Chess.com style** follows Chess.com's published Live rules: threefold repetition and the fifty-move rule draw automatically, and running out of time against insufficient material is a draw ([Chess.com: How do draws work](https://support.chess.com/en/articles/8572743-how-do-draws-work)). Legal-move dots and auto-queen are personal settings on Chess.com; the preset shows dots and asks for the promotion piece, and you can change both with Customized rules. Takebacks are off, as in rated Live games. Our timeout check uses the simple "lone king, or king and one minor piece" rule, which may differ from Chess.com in rare endgames.

**En passant off** is a variation, not standard chess. Those moves are removed from the legal-move list. Checkmate and stalemate are judged on the remaining moves, so a position whose only reply was an en passant capture is stalemate (or checkmate, if in check). Repetition ignores the en passant square. Exported PGN carries `[Variant "No en passant"]`. Imported PGN always uses standard rules.

- **Customized rules** is its own choice. Selecting it shows the switches; any combination is allowed. Your set is saved in preferences (`settings.customRules`) when a game starts with it, and comes back the next time you pick Customized rules. Picking a preset uses it exactly as defined, and "What … includes" lists its options read-only.
- Each game saves which choice was made (`rulesChoice`), so it shows "Customized rules" even if your switches happen to match a preset.
- When an assist is off, it is hidden from screen readers too (for example, no "legal move" in square labels). The checked king's red glow and the "Check" announcement stay in every mode, so players can always tell they are in check.
- With auto-queen on, underpromotion is not available.
- `chessRules.ts` reports facts (`terminal`, `drawClaim`, `forcedDraw`); `gameRules.ts` decides what they mean (`ruleOutcome`), so the draw policy is not mixed into the chess.js wrapper or the board.

### Endings

- Checkmate, stalemate and insufficient material (as chess.js defines it) end the game.
- **Threefold repetition and the fifty-move rule** end the game automatically under Beginner and Casual rules, a casual simplification. Under claim rules (Strict), a "Claim draw" button appears and play continues until someone claims.
- **Fivefold repetition and the 75-move rule** always end the game, as in FIDE rules. Repetition is counted from the replayed history, by placement, side to move, castling rights and en passant square.
- Resignation (either player, at any time), draw by agreement and claimed draws are recorded as explicit outcomes.
- **Timeout:** the side whose clock reaches zero loses, unless the opponent has only a king, or a king and one knight or bishop; then the game is drawn. FIDE's rule asks whether *any* legal sequence could lead to checkmate, so rare positions (for example a lone knight against pawns) are judged differently here.
- When takebacks are on, undo is allowed during play and after rule-based endings (checkmate, stalemate, automatic draws). Resignation, agreed or claimed draws and timeouts are final.

### Clocks

- Presets: untimed, 3+2, 5+0, 10+5, 15+10, 30+0.
- **Clocks start when the first move is made.** That first move costs no time and earns no increment. After that, each accepted move charges the mover's elapsed time and adds the increment.
- **Remaining time is computed, not counted down.** It is `checkpoint − (turnElapsedMs + now − runningSince)`, using `performance.now()`. The 100 ms ticker only refreshes the display and checks for expiry, so throttled background tabs cannot slow the clock. When a hidden tab becomes visible, time is settled immediately.
- Expiry is checked before every move. A move that arrives after the flag fell is rejected and the game ends on time.
- **Closing or reloading the app pauses the game.** The time already used in the current turn is saved on `pagehide` and when the tab is hidden. A restored timed game starts paused, and time spent while the app was closed is not charged. We chose this because `performance.now()` resets on reload, and a local game left closed overnight should not be lost on time. Switching tabs or routes does *not* pause the game.
- Undo and redo restore the matching clock checkpoints. Clocks freeze once the game ends.

### Saving

- Every accepted change, plus lifecycle checkpoints (tab hidden, page hide), saves to `localStorage["vuess.game"]` as `{ version: 4, savedAt, game }`. Older saves are upgraded on load: version 1 (before per-game rules) gets the Casual rules, version 2 (before the en passant rule) gets en passant on, and version 3 (before `rulesChoice`) gets the preset its rules match, or Customized rules. Each upgrade matches how those games were played. Preferences are saved separately under `vuess.settings`.
- **Saved data is never trusted on load.** It is checked for shape, every move is replayed and its SAN compared, and the stored outcome is checked against the position. If loading fails (corrupt JSON, an unsupported version, illegal moves or an inconsistent result), the raw data is copied to `vuess.game.unreadable`, a fresh game starts, and a notice explains what happened.
- Storage failures (quota, privacy mode) show a warning; play continues unsaved.

### PGN

- Export includes Event, Site, Date, White, Black, Result, TimeControl, Termination, and SetUp/FEN for custom start positions.
- Import parses only the first game in the file. The import is fully validated before it replaces the current game; if it fails, the current game is unchanged.
- **Imported games are untimed**, because PGN cannot restore clock checkpoints. A PGN with result `*` becomes a playable game. A PGN with a final result loads as a finished game for review (`recorded-result`), unless the moves themselves end the game, in which case the rule-based outcome is used.

## Accessibility

- The board is an ARIA grid with a roving tabindex. Arrow keys follow the board's orientation, Enter/Space selects and moves, and Escape clears the selection or cancels a drag.
- Each square has a label such as "e4, white knight, selected" or "h3, empty, legal move". Highlights also use shapes, not only colour: a dot for a move, a ring for a capture, a corner notch for the last move, and an outlined glow for check.
- Moves and results are announced through a polite live region.
- Dialogs use the native `<dialog>` with `showModal()`, which makes the rest of the page inert. Focus returns to the opener on close, and Escape cancels.
- Animations follow the OS reduced-motion setting by default and can be forced on or off in Settings.
- Shortcuts: <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo, <kbd>F</kbd> flip board.

## Testing

- `src/features/chess/__tests__/`: rules integration (castling, en passant, promotion, endings, PGN), clock maths, the game store (turn enforcement, undo/redo, persistence and recovery, clock expiry, increments, hidden-tab elapsed time, pause on reload) using an injected fake time source, and board/interaction component tests (orientation, keyboard, drag, promotion and cancel).
- `e2e/game.spec.ts`: checkmate plus reload/restore, promotion with cancel, drag-and-drop, keyboard play, history browsing, undo/redo, timed games pausing after reload, PGN round trip with a failed import, corrupted-save recovery, routing, and no horizontal overflow. Runs on desktop Chrome and a Pixel 7 profile.

## Known shortcuts

| Shortcut | Why it's acceptable now | How to improve |
| --- | --- | --- |
| The position is recomputed by replaying every move from the start (`buildPosition`) | Games are short; replaying a few hundred moves takes well under a millisecond | Cache chess.js instances by `(record.id, cursor)` or build incrementally, if profiling ever shows a cost |
| The timeout material check uses a simple rule (lone king, or king plus one minor piece) | Covers the common cases | Add a proper "can this side still mate?" check |
| A draw can only be claimed once the repeated position is on the board | Covers the usual case | FIDE also allows claiming by declaring the move that would create the repetition; add a "move and claim" option |
| No touch-specific drag tests | Touch uses the same pointer-event code as the mouse, which is tested | Add Playwright touchscreen tests, or a real-device check |
| Only one saved game | Matches the local, single-session scope | See "Saved games library" below |

## Roadmap

Ordered by value and how well the current design already supports it.

1. **Exact timeout adjudication.** Replace the simple "lone king or one minor piece" check with a search for whether the side can still deliver mate, at least under Strict rules. Benefit: correct results in rare endgames. Trade-off: a small search on every timeout. Files: `services/chessRules.ts` (`lacksMatingMaterial`), `stores/game.ts` (`checkTimeout`).
2. **Computer opponent (Web Worker).** Add `features/chess/services/opponent.ts` with an interface like `requestMove(record snapshot, revision, signal) → Promise<MoveInput>`, backed by a worker running an engine (for example Stockfish WASM). On reply, check that `record.revision` is unchanged and submit through `game.tryMove`. Cancel with `AbortController` on undo, restart or navigation. The store's `revision` field already exists for this. Trade-off: a large WASM download (lazy-load it), plus mobile CPU use. Files: new service and worker, `GameSetupDialog.vue` (opponent choice), `GameView.vue`.
3. **Analysis board.** A read-only replay model built with `buildPosition(initialFen, moves.slice(0, n))`, kept separate from the active game. Optionally add engine evaluation through the same worker. Files: new `views/AnalysisView.vue` route, a new `useReplay` composable, reusing `ChessBoard` and `MoveHistory`.
4. **Online play.** Add a transport interface: `submitMove({ gameId, expectedRevision, idempotencyKey, move })` and `onSnapshot(record)`. The server owns legality, player identity, clocks and results. The client becomes a viewer of the server's records, using `restoreGame`-style validation, and a full snapshot is fetched on reconnect. `GameRecord` already carries `revision`, and moves are plain data. Trade-off: needs a backend, authentication and clock synchronisation. Files: new `services/transport.ts`, and a mode switch in `stores/game.ts` that routes `tryMove` through the transport instead of committing locally.
5. **Puzzles and custom starting positions.** `createRecord(setup, initialFen)` already accepts any FEN, and the rules layer validates it. Add a FEN editor, plus a goal checker (for example "mate in N") that runs on `position.ruleOutcome`. Files: new `features/puzzles/`, and `GameSetupDialog.vue` (FEN input).
6. **Saved games library.** Move from a single localStorage key to IndexedDB keyed by `record.id`, with a list and resume view. Files: `services/persistence.ts`, a new view.
7. **Localisation and more themes.** Pull UI strings into message files (`outcomeText.ts` already centralises the result wording). Themes only need new CSS custom properties.
