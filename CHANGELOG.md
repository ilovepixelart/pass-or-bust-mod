# Changelog

All notable changes to pass-or-bust are listed here. Versions follow
[Semantic Versioning](https://semver.org/); while the version is 0.x, any
release may change behaviour.

## [Unreleased]

### Fixed

- A test run piped through `grep` never settled: no market opened, so a bet placed between runs stood through it and waited for the next unfiltered run. Claude checks its fixes this way (`npm test 2>&1 | grep -E "^(not )?ok|^# (pass|fail)"`). Such a run now settles on the summary grep kept, read only by runners whose summary a dropped line cannot turn into a pass (bun, deno, node, pytest, jest, vitest); without a whole summary it is void. go and cargo runs through grep, and `grep -o`, still open no market.
- An output holding several summaries (a workspace running one suite per package) settled on the last one, so a failing package followed by a passing one paid a bet on pass. Every summary in the output now counts, and one failing summary fails the run.
- A `|`, `&&` or `;` inside quotes split the command: in `grep -E "ok|fail"` the pattern was read as a pipe. Commands are now cut only outside quotes.
- A heredoc's lines were read as commands, so writing `npm test` into a file with `cat <<'EOF'` opened a market, and quotes inside a heredoc body could hide the test run after it. Heredoc bodies are now skipped.

## [0.2.0] - 2026-10-08

### Fixed

- A failing `node --test` suite run through a script runner and a pipe (`npm test 2>&1 | tail -60`) settled as a pass: with no runner named, every runner's summary was tried, and the go reader took the first word of a TAP line (`ok 1 - name`) for go's `ok <package>`. A bet on pass would have been paid on failing tests. The go reader now only accepts go's own result lines (`ok <package> <time>`, `FAIL <package> <time>`, a closing `PASS` or `FAIL`).

### Added

- `node --test` opens a market, and its summary (`# pass 2`, `# fail 1`, which it prints when it is not in a terminal, as under Claude) settles a piped run.

## [0.1.0] - 2026-10-07

First release. Requires Claude Code 2.1.287 or later.

### Added

- Slots for test runs: when Claude runs a test command, three reels spin
  above the prompt and stop left to right on the run's real result:
  pass, fail, or void when the run never reached a result.
- Bets of 100 fake credits: `1` bets on pass and `2` on fail, typed at an
  empty prompt while the reels spin, or `ctrl+x tab` then `1` or `2`
  between runs. A bet placed between runs stands for the next run; `c`
  cancels it. A bankroll below one stake offers a bailout, `b`.
- Odds from the project's own record, kept per working directory: the
  chance of a pass is `(passes + 1) / (runs + 2)`, and each side pays
  `0.95 / chance`, rounded down to the cent and held between 1.01 and 50.
- Test commands detected for npm, pnpm, yarn, bun, deno, jest, vitest,
  pytest (also through `python -m` and `uv run`), go, cargo, make, mix,
  rspec, dotnet, mvn and gradle.
- Runs piped through `tail`, `tee` or `cat` settle from the runner's own
  summary for bun, deno, go, cargo, pytest, jest and vitest; unreadable
  or cut-off output is void and refunds the stake. Pipes through other
  commands, and background runs, open no market.
- With a bet on and the reels on screen, the test result is held back
  from Claude until the reels stop, at most 2.5 seconds, and returned
  unchanged.
- A tally, a coin pile and a CASHED OUT, BUSTED or REFUNDED stamp on
  settlement, with a toast and a sound once the stamp lands.
- `/bankroll`: balance, lifetime P&L, a chart of recent bets, win rate,
  pass rate, best streak, bailouts and a rank from "Generous donor to
  the house" to "The House".
- A versioned store layout (`layout: 1`). A store saved in a newer layout
  is neither read nor overwritten; the mod says so and opens no market.
- Settlement and bets read the bankroll from the store right before
  saving, and the bankroll is loaded again after `/clear`, `/resume` and
  `/branch`.

### Public surface

- Command: `/bankroll`.
- Keys: `1`, `2`, `c`, `b` on the band; `ctrl+x tab` focuses it.
- Plugin store keys: `layout` (1), `bank`, `slip`, `history:<cwd>`.

### Known limitations

- Sessions share one store and it has no atomic update: a result another
  session saves between this session's read and its save is lost.
- Designed for a dark Claude Code theme.
