# Hollywood Empire V4.83 — GitHub-ready online multiplayer

A historical movie-studio strategy game with the existing **1,207 films, 23 TV entries and 48 eras**, now packaged as a deployable website with authoritative server-driven rooms. The V4.82 draft, finances, genre fame, TV licensing/cancellation rules and five-year settlement run unchanged inside the online engine.

## What is included

- `public/index.html`: the full original Hollywood Empire game, with an additional bridge for remote commands. **Offline single-device play remains supported.**
- `public/online.js`: create/join/reconnect UI, room codes, synchronized state, and remote actions.
- `server/app.py`: Python WebSocket server. Each room runs **one canonical Chromium game engine**; clients cannot write arbitrary financial balances or states. Mutations are serialized and version-checked. The server enforces assigned seats for drafting and TV contracts.
- `tests/test_online.py`: repeatable two-player WebSocket integration tests.
- `Dockerfile` and `render.yaml`: deployment assets.

## Deploy through GitHub + Render

1. Create a new GitHub repository such as `hollywood-empire-online`. Upload **the contents of this folder**, keeping `Dockerfile`, `render.yaml`, `public/`, `server/` and `requirements.txt` at the root.
2. On [Render](https://render.com/), choose **New → Blueprint**, connect the GitHub repository, and approve the proposed `hollywood-empire-online` service. The Blueprint uses a Docker web service with a 1 GB persistent disk for game saves. **Review Render's pricing before approving; persistent disks generally require a paid instance.**
3. After deployment, open your assigned `https://...onrender.com` URL from two different phones.
4. On phone 1, choose **🌐 Online multiplayer → Create room**, then share the six-character code.
5. On phone 2, choose **Join room**, enter the code, and enter its studio name. Both phones must join **before the host starts**.
6. The host chooses the playable era range and AI opponent count, then clicks **Start shared game**. Each human controls their assigned studio. The host advances an era after all draft picks are finished.
7. When reconnecting from the same device/browser, select **Reconnect saved room**. Your browser stores a private token proving ownership of your original seat.

**GitHub Pages alone is insufficient for online rooms.** It can serve static HTML but cannot run this Python/WebSocket game server or persistent room database.

## Run locally

Requirements: Python 3.11+, Chromium and Playwright browser runtime.

```bash
pip install -r requirements.txt
python -m playwright install chromium
python -m server.app
```

Then open `http://localhost:8080` in two browsers. On Linux with installed Chromium, you can set `CHROMIUM_PATH=/usr/bin/chromium` instead of installing a new browser.

Test an already-running server:

```bash
python tests/test_online.py
```

To persist saves in a specific directory, set `HE_DATA_DIR=/data`. Rooms are stored in a local SQLite database. **Deploy only one server instance with a persistent volume**. Multiple replicas do not share canonical browser state or SQLite data.

## Gameplay and security constraints

- The server is authoritative for game state: `buy`, `pass`, `advance` and `tv` operations execute against the room's one headless game instance. Each move has a state revision and is checked against the assigned studio or host permissions.
- Studio names are sanitized. Room access requires a short code before starting; an unpredictable secret reconnect token is needed afterward. Treat the reconnect token as a password. HTTPS/WSS should be enabled by your deployment provider.
- This is a **small-group, single-instance beta**, suitable for initial two-phone playtesting. It is **not** a horizontally-scaled production multiplayer service. There is currently no registered account recovery, invite management, server-side chat, tournament ladder, abuse monitoring, or host migration.
- The backend runs Chromium per active room, which can be resource intensive. Use a machine with adequate RAM and monitor usage before opening many rooms.
- The server stores room snapshots and reconnect tokens in SQLite on disk. Protect backups, restrict server access, and do not commit data files or `.env` secrets to GitHub.
- Guest browsers receive the game's existing serialized state to render locally; do not consider unpublished film outcomes or rival finance data secret from advanced users. Server-side mutation authorization protects **integrity**, not complete information confidentiality.
- The studio owner may toggle its own TV rights; opponents' checkboxes cannot change server state. Previously canceled TV series remain locked under the original rules.
- The campaign runs existing AI studios on the server, so each opponent uses the same canonical turn queue and financial engine.
- This version does **not** yet support importing existing offline save JSON into an online room, or copying an online room into a standalone HTML save. Keep your offline V4.82 saves separately.

## Verified tests and limitations

Tested on a local Chromium-backed server: two-human room creation/join, identical initial state, turn-authorization rejection, cross-player TV control rejection, authorized pass synchronization, stale-revision rejection, and reconnect retaining the same studio and game state.

Not yet verified in this package: a complete multi-era two-phone campaign over the public internet, large-room concurrency/load, host-device disappearance during era advancement, and all save/finish/playback UI edge cases. These should be treated as beta testing priorities.

## Architecture

```text
Phone A  ─┐
          ├── HTTPS/WSS ──> Python aiohttp server ──> canonical Playwright Chromium instance per room
Phone B  ─┘                         │                            │
                                   └── SQLite room snapshots <───┘
```

All game mutations enter through server-controlled actions, not client-supplied snapshots.
