# Vuess

A chess game built with Vue 3, TypeScript, Pinia and chess.js. Play **in person** on one device, against the **computer** (Stockfish), or **online** against a friend through [vuess-server](../vuess-server). It includes per-game rules (Beginner, Casual, Strict or custom), clocks with increment, move history with position browsing, undo/redo, automatic saving, PGN import/export, and full keyboard and touch support.

## Getting started

Requires Node 20+ and pnpm.

```sh
pnpm install
pnpm dev            # http://localhost:5173
```

Online play needs [vuess-server](../vuess-server), a separate project expected next to this one:

```sh
pnpm --dir ../vuess-server install
pnpm dev:server     # vuess-server on http://localhost:4310
```

Set `VITE_ONLINE_SERVER_URL` (for example in `.env.local`) when the server runs elsewhere.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server |
| `pnpm dev:server` | Start vuess-server from `../vuess-server` (for online play) |
| `pnpm build` | Type-check, then production build to `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm type-check` | `vue-tsc` across app, tests and tooling configs |
| `pnpm lint` / `pnpm lint:fix` | ESLint (Vue + TypeScript recommended rules) |
| `pnpm test` | Vitest unit and component tests |
| `pnpm test:e2e` | Playwright browser tests on desktop and mobile Chrome. Builds first, and also builds and starts `../vuess-server` when present (online tests are skipped without it). Run `pnpm exec playwright install chromium` once. |
| `pnpm check` | Type-check, lint, unit tests and build |

## Architecture

```
src/
  App.vue                       Shell: header, nav, <RouterView>; starts the game runtime
  router/index.ts               /  /online  /online/:gameId  /settings  /about  (+ catch-all → /)
  views/                        GameView (local games), OnlineLobbyView, OnlineGameView, SettingsView, AboutView
  composables/useGameLayout.ts  Phone/tablet full-screen layout switch and page lock (styles/game-layout.css)
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
    services/engine/            Computer opponent: engine interface, Stockfish worker client, UCI helpers, levels
    stores/game.ts              The game store: move pipeline, clocks, undo/redo, results, PGN, opponent
    composables/
      useBoardInteraction.ts    One move pipeline for tap, drag and keyboard
      useGameRuntime.ts         Restore on start, clock ticker, lifecycle saves
      useComputerPlayer.ts      Plays the computer side; ignores replies that arrive after the game changed
      useSound.ts, useReducedMotion.ts
    components/                 ChessBoard, BoardSquare, ChessPiece, PlayerPanel, ChessClock,
                                MoveHistory, GameControls, the dialogs, SettingsPanel
    assets/pieces.ts            Piece artwork (two-layer SVG paths: halo + body, coloured via CSS variables)
  features/online/
    protocol.ts                 Socket.IO message types (copy of vuess-server/src/protocol.ts)
    services/connection.ts      Socket.IO client and request helper (acknowledgements with a timeout)
    stores/online.ts            Online game state from the server, saved seats, the move awaiting confirmation
    components/OnlineNotices.vue  Errors, reconnecting and draw offers
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

## Play modes

Choose the mode in **New game**:

- **Play in person:** two people on one device; everything described below under "Game policies".
- **Computer:** play Stockfish at levels 1 (Newcomer) to 8 (Master). You choose your colour, the time control and the rules. Undo (when takebacks are on) takes back your move and the computer's reply together. Agreed draws are not offered against the computer.
- **Online:** creates a game on vuess-server and shows an invite link to send to a friend. Also available from the **Online** page, which can join with a link or code.

### Computer opponent

- The engine is **Stockfish 19** (the lite, single-threaded WebAssembly build from the `stockfish` npm package, about 1.8 MB). It runs in a Web Worker, so the board never freezes while it thinks, and it is downloaded only when you play the computer.
- Each level sets Stockfish's *Skill Level* (0–20), a search depth and a time cap (`services/engine/levels.ts`), so low levels play weaker moves yet still answer quickly.
- Every engine request is tagged with the game's revision. If you undo, start a new game, pause or reload before the reply arrives, the request is cancelled and a late reply is ignored. Engine failures show an error with **Try again**.
- **Licence:** Stockfish is GPL-3.0. Vuess loads it as a separate file at runtime; if you distribute the app, follow the GPL for the engine files (keep the licence and offer the source).

### Online play

- **The server decides everything:** move legality, whose turn it is, the clocks and results. Your move appears immediately and is taken back with a message if the server rejects it.
- Online games use **Chess.com style** rules (no takebacks, automatic repetition and fifty-move draws). Draws are offered and accepted; your opponent moving instead of answering declines the offer.
- Your seat is saved in this browser (`vuess.online.seats`), so reloading or reconnecting returns you to your side. Socket.IO reconnects automatically, and the game re-syncs from the server.
- Opening a link to a full game lets you watch.
- See vuess-server's README for the protocol, limits and hosting.

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

- Every accepted change, plus lifecycle checkpoints (tab hidden, page hide), saves to `localStorage["vuess.game"]` as `{ version: 5, savedAt, game }`. Older saves are upgraded on load: version 1 (before per-game rules) gets the Casual rules, version 2 (before the en passant rule) gets en passant on, version 3 (before `rulesChoice`) gets the preset its rules match, or Customized rules, and version 4 (before computer games) is an in-person game. Each upgrade matches how those games were played. Preferences are saved separately under `vuess.settings`.
- **Saved data is never trusted on load.** It is checked for shape, every move is replayed and its SAN compared, and the stored outcome is checked against the position. If loading fails (corrupt JSON, an unsupported version, illegal moves or an inconsistent result), the raw data is copied to `vuess.game.unreadable`, a fresh game starts, and a notice explains what happened.
- Storage failures (quota, privacy mode) show a warning; play continues unsaved.

### PGN

- Export includes Event, Site, Date, White, Black, Result, TimeControl, Termination, and SetUp/FEN for custom start positions.
- Import parses only the first game in the file. The import is fully validated before it replaces the current game; if it fails, the current game is unchanged.
- **Imported games are untimed**, because PGN cannot restore clock checkpoints. A PGN with result `*` becomes a playable game. A PGN with a final result loads as a finished game for review (`recorded-result`), unless the moves themselves end the game, in which case the rule-based outcome is used.

## Phone and tablet layout

On phones and portrait tablets (narrower than 760px, or taller than wide), the game screen works like the Chess.com app: it fills the screen and the page never scrolls. Wider-than-tall screens from 760px use the side-by-side layout (board plus a side panel with the move list), so no layout puts the moves below the board. The move list keeps the current move visible by scrolling only its own box, never the page.

- From top to bottom: a horizontally scrolling move list, the opponent's bar, the board edge to edge, your bar, a one-line status with the rules name and time control, and a bottom toolbar (New, Undo when takebacks are on, Back, Forward, Claim draw when available, More).
- The board is sized from the space left after both player bars, using container query units, so the bars stay attached to it and any spare height goes above and below the group.
- **More** opens a bottom sheet with the remaining actions (flip, pause/resume, draw, resign, PGN) and the rules summary.
- Errors and save warnings appear as pop-ups above the toolbar instead of pushing the layout down. The layout respects the phone's safe areas (notch and home indicator).

## Accessibility

- The board is an ARIA grid with a roving tabindex. Arrow keys follow the board's orientation, Enter/Space selects and moves, and Escape clears the selection or cancels a drag.
- Each square has a label such as "e4, white knight, selected" or "h3, empty, legal move". Highlights also use shapes, not only colour: a dot for a move, a ring for a capture, a corner notch for the last move, and an outlined glow for check.
- Moves and results are announced through a polite live region.
- Dialogs use the native `<dialog>` with `showModal()`, which makes the rest of the page inert. Focus returns to the opener on close, and Escape cancels.
- Animations follow the OS reduced-motion setting by default and can be forced on or off in Settings.
- Shortcuts: <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo, <kbd>F</kbd> flip board.

## Testing

- `src/features/chess/__tests__/`: rules integration (castling, en passant, promotion, endings, PGN), clock maths, the game store (turn enforcement, undo/redo, persistence and recovery, clock expiry, increments, hidden-tab elapsed time, pause on reload) using an injected fake time source, and board/interaction component tests (orientation, keyboard, drag, promotion and cancel).
- `__tests__/computer.spec.ts`: UCI helpers and levels, the computer playing after you, stale replies ignored after undo, engine failure and retry, pausing, takebacks of both moves, and the version 4 to 5 save upgrade (with a fake engine).
- `src/features/online/__tests__/`: invite links, and the online store against a fake socket: creating, rejoining with the saved seat, a move shown at once then confirmed or taken back, one join at a time, ignored out-of-date updates, clocks and an unreachable server.
- `e2e/online.spec.ts` (needs vuess-server): two browsers play through an invite link, exchange moves, reload with the seat restored, and agree a draw; the New game dialog creates an online game.
- `e2e/game.spec.ts`: the real Stockfish replying and undo taking back both moves; checkmate plus reload/restore, promotion with cancel, drag-and-drop, keyboard play, history browsing, undo/redo, timed games pausing after reload, PGN round trip with a failed import, corrupted-save recovery, routing, and no horizontal overflow. Runs on desktop Chrome and a Pixel 7 profile.

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
2. **Game review with the engine.** Reuse the Stockfish worker to evaluate each position after a game (evaluation bar, best move, mistake labels) on the history view. Files: `services/engine/` (an `analyse` call), `MoveHistory.vue`, a new review panel.
3. **Analysis board.** A read-only replay model built with `buildPosition(initialFen, moves.slice(0, n))`, kept separate from the active game. Optionally add engine evaluation through the same worker. Files: new `views/AnalysisView.vue` route, a new `useReplay` composable, reusing `ChessBoard` and `MoveHistory`.
4. **Online: matchmaking, accounts and persistence.** Random pairing by time control, player accounts and ratings, and storing games in a database so a server restart does not end them. Files: mostly vuess-server (`game/registry.ts`, new routes), plus a lobby list in `OnlineLobbyView.vue`.
5. **Puzzles and custom starting positions.** `createRecord(setup, initialFen)` already accepts any FEN, and the rules layer validates it. Add a FEN editor, plus a goal checker (for example "mate in N") that runs on `position.ruleOutcome`. Files: new `features/puzzles/`, and `GameSetupDialog.vue` (FEN input).
6. **Saved games library.** Move from a single localStorage key to IndexedDB keyed by `record.id`, with a list and resume view. Files: `services/persistence.ts`, a new view.
7. **Localisation and more themes.** Pull UI strings into message files (`outcomeText.ts` already centralises the result wording). Themes only need new CSS custom properties.
