<template>
  <article class="page prose">
    <h1>Rules &amp; help</h1>

    <section class="card">
      <h2>Ways to play</h2>
      <ul>
        <li><strong>Play in person:</strong> two players share this device.</li>
        <li>
          <strong>Computer:</strong> play Stockfish at levels 1 (Newcomer) to 8 (Master). Undo takes back your move
          and the computer's reply together.
        </li>
        <li>
          <strong>Online:</strong> create a game and send the link to a friend, or open a link you received. The
          server checks every move and keeps the clocks. Reloading the page returns you to your game.
        </li>
      </ul>
    </section>

    <section class="card">
      <h2>Playing</h2>
      <ul>
        <li>Tap or click a piece, then a highlighted square. You can also drag pieces.</li>
        <li>
          Dots mark legal moves; rings mark captures. A corner notch marks the last move and a red glow marks a king in
          check.
        </li>
        <li>
          <strong>En passant:</strong> when a pawn moves two squares and lands beside an enemy pawn, that enemy pawn
          may capture it on the very next move by moving diagonally onto the square it skipped. The captured pawn is
          removed from beside the landing square; the board shows it faded with a cross, and the move list marks it
          “e.p.”. En passant can be switched off with Customized rules.
        </li>
        <li>
          Click a move in the list to look at an earlier position. The live game is unaffected; use “Back to live game”
          to continue.
        </li>
      </ul>
    </section>

    <section class="card">
      <h2>Keyboard</h2>
      <dl class="keys">
        <dt><kbd>Tab</kbd></dt>
        <dd>Move focus onto the board</dd>
        <dt><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd></dt>
        <dd>Move between squares</dd>
        <dt><kbd>Enter</kbd> / <kbd>Space</kbd></dt>
        <dd>Select a piece, or move the selected piece to this square</dd>
        <dt><kbd>Esc</kbd></dt>
        <dd>Clear the selection, cancel a drag, or close a dialog</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd></dt>
        <dd>Undo / redo</dd>
        <dt><kbd>F</kbd></dt>
        <dd>Flip the board</dd>
      </dl>
    </section>

    <section class="card">
      <h2>How games end</h2>
      <ul>
        <li>
          <strong>Checkmate</strong>, <strong>stalemate</strong> and <strong>insufficient material</strong> end the
          game.
        </li>
        <li>
          <strong>Threefold repetition</strong> and the <strong>fifty-move rule</strong> end the game automatically in
          Beginner and Casual games. In Strict games (or with “must claim” in Customized rules) a <strong>Claim draw</strong>
          button appears instead, and play continues until someone claims.
        </li>
        <li>
          <strong>Fivefold repetition</strong> and the <strong>75-move rule</strong> always end the game, whatever the
          rules.
        </li>
        <li>Either player can <strong>resign</strong>, or both can <strong>agree to a draw</strong>.</li>
        <li>
          <strong>Out of time:</strong> the opponent wins, unless they have only a king, or a king and one knight or
          bishop. Then the game is a draw. Official rules ask whether checkmate is possible at all, so a few rare
          positions are judged differently here.
        </li>
      </ul>
      <p>
        When takebacks are allowed, undo works during a game and after checkmate or an automatic draw. Resignations,
        agreed or claimed draws and timeouts are final.
      </p>
    </section>

    <section class="card">
      <h2>Rules</h2>
      <p>
        New games use <strong>Chess.com style</strong> rules unless you pick something else when you start a game.
        Rules are saved with the game and cannot change once it starts.
      </p>
      <ul>
        <li>
          <strong>Chess.com style (default):</strong> plays like a Chess.com Live game: no takebacks, legal-move dots and check
          warnings on, repetition and fifty-move draws automatic, and running out of time against a lone king (or king
          and one minor piece) is a draw.
        </li>
        <li><strong>Beginner:</strong> every hint on, takebacks allowed, pawns promote to a queen automatically.</li>
        <li><strong>Casual:</strong> hints and takebacks on; you choose the promotion piece; draws are automatic.</li>
        <li>
          <strong>Strict:</strong> no takebacks, no legal-move dots and no “check!” warning (the king still glows red);
          repetition and fifty-move draws must be claimed.
        </li>
        <li>
          <strong>Customized rules</strong> is your own rule set, chosen like any preset. Its <em>chess rules</em>
          change how the game is played (en passant on or off; repetition and fifty-move draws automatic or claimed).
          Its <em>helpers</em> are assists such as takebacks and legal-move dots. Your set is remembered for the next
          time you choose it. To see what a preset includes, open “What … includes” under the list.
          Open “Rules for this game” next to the status to see what is on.
        </li>
        <li>
          “Rotate board each turn” keeps the side to move at the bottom, which helps when passing one device between
          players.
        </li>
      </ul>
    </section>

    <section class="card">
      <h2>Clocks</h2>
      <ul>
        <li>Clocks start after the first move. Increment is added after each completed move.</li>
        <li>Time keeps running if you switch tabs or open another page in this app.</li>
        <li>
          If you close or reload the app, the game is saved and comes back <strong>paused</strong>. Time while the app
          was closed is not counted. Press Resume to continue.
        </li>
        <li>Undo gives back the time each player had before the undone move.</li>
      </ul>
    </section>

    <section class="card">
      <h2>Saving and PGN</h2>
      <ul>
        <li>The game saves automatically in this browser after every change.</li>
        <li>
          Export a game as PGN to share it or open it in other chess software. Imported games are untimed: unfinished
          ones (result “*”) can be continued, and finished ones open for review.
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.keys {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.4rem 1rem;
  margin: 0;
}
.keys dd {
  margin: 0;
}
@media (max-width: 480px) {
  .keys {
    grid-template-columns: 1fr;
  }
  .keys dd {
    margin-bottom: 0.4rem;
  }
}
</style>
