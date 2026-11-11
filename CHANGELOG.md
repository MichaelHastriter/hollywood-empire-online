# V4.83 — Online multiplayer beta and GitHub release

## New
- GitHub repository layout, Dockerfile, Render Blueprint, CI integration tests, pinned Python dependencies.
- Online room lobby with six-character codes for 2–4 human players, plus optional AI opponents.
- Assigned studio seats, reconnect token saved in browser, explicit host-led era advancement.
- WebSocket synchronization and server-side canonical Chromium game engine.
- Server-side authorization for active studio picking/passing, studio-owned TV licensing, and host era progression.
- Serialized room actions with monotonically increasing version checks and SQLite snapshots.
- Online panel showing joined studios, whose turn it is, room code, and reconnect workflow.

## Preserved from V4.82
- Film and TV catalog, playable eras, film draft order and director eligibility, franchise rights.
- Temporary genre fame, financial simulation, extra-pick surcharges, TV cancellation, five-year finale.
- Standalone local-game mode.

## Known beta limitations
- No migration of offline save files into online rooms yet.
- UI browser-testing across physically separate phones not yet complete.
- No persistent server-side user accounts, host transfer, chat, rate limiting or anti-DoS quotas.
- Use a single deployment instance with persistent disk; multiple replicas are unsupported.
- Server-side state ownership protects game integrity, but guests can inspect serialized opponent information if technically sophisticated.
