"""Single-instance authoritative Hollywood Empire room service.
Room mutation is executed in one headless Chromium game instance, never in a guest browser.
"""
import asyncio
import json
import logging
import os
import re
import secrets
import sqlite3
import time
from pathlib import Path
from aiohttp import web, WSMsgType
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get('HE_DATA_DIR', ROOT / 'data'))
DB = DATA_DIR / 'rooms.sqlite3'
ROOMS = {}
PLAYWRIGHT = None
BROWSER = None
MAX_MESSAGE = 16384
ROOM_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
logging.basicConfig(level=logging.INFO)
log = logging.getLogger('hollywood-online')


def db_connection():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB)
    db.execute('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL)')
    return db


def store(room):
    data = {k: v for k, v in room.items() if k not in ('context', 'page', 'connections', 'lock')}
    with db_connection() as db:
        db.execute('INSERT INTO rooms(code,data) VALUES (?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data',
                   (room['code'], json.dumps(data, separators=(',', ':'))))


def get_room(code):
    if code in ROOMS:
        return ROOMS[code]
    with db_connection() as db:
        result = db.execute('SELECT data FROM rooms WHERE code=?', (code,)).fetchone()
    if not result:
        return None
    room = json.loads(result[0])
    room.update(connections={}, lock=asyncio.Lock(), page=None, context=None)
    ROOMS[code] = room
    return room


def create_room(name):
    while True:
        code = ''.join(secrets.choice(ROOM_CHARSET) for _ in range(6))
        if not get_room(code):
            break
    room = {'code': code, 'members': [{'seat': 0, 'name': clean_name(name), 'token': secrets.token_urlsafe(32)}],
            'started': False, 'state': None, 'version': 0, 'created_at': time.time(),
            'connections': {}, 'lock': asyncio.Lock(), 'page': None, 'context': None}
    ROOMS[code] = room
    store(room)
    return room


def clean_name(name):
    name = re.sub(r'[<>\x00-\x1f]', '', str(name or 'Studio')).strip()
    return name[:32] or 'Studio'


async def engine(room):
    if room['page']:
        return room['page']
    if BROWSER is None:
        raise RuntimeError('Chromium engine unavailable')
    context = await BROWSER.new_context(accept_downloads=False)
    page = await context.new_page()
    page.on('dialog', lambda dialog: asyncio.create_task(dialog.accept()))
    # Load engine from trusted on-disk HTML, avoiding network dependency in server Chromium.
    await page.set_content((ROOT / 'index.html').read_text(encoding='utf-8'), wait_until='domcontentloaded', timeout=90000)
    await page.wait_for_function('Boolean(window.HollywoodOnlineBridge)', timeout=60000)
    if room['started']:
        await page.evaluate('(s)=>window.HollywoodOnlineBridge.setSnapshot(s)', room['state'])
    room['context'] = context
    room['page'] = page
    return page


async def broadcast(room):
    for ws, seat in list(room['connections'].items()):
        if ws.closed:
            room['connections'].pop(ws, None)
            continue
        try:
            await ws.send_json({'type': 'state', 'code': room['code'], 'seat': seat,
                                'members': [{'seat': x['seat'], 'name': x['name']} for x in room['members']],
                                'started': room['started'], 'version': room['version'],
                                'state': room['state']})
        except Exception:
            room['connections'].pop(ws, None)


def current_seat(room):
    state = room['state'] or {}
    queue = state.get('queue') or []
    return queue[0] if queue else None


async def command(room, seat, msg):
    typ = msg.get('type')
    if typ == 'start':
        if seat != 0 or room['started']:
            raise ValueError('Only the host can start a new room')
        human_count = len(room['members'])
        bots = msg.get('bots', 4 - human_count)
        first, last = msg.get('startTurn', 0), msg.get('endTurn', 47)
        if type(bots) is not int or bots < 0 or bots + human_count > 4:
            raise ValueError('Invalid number of AI studios')
        if type(first) is not int or type(last) is not int or not (0 <= first <= last <= 47):
            raise ValueError('Invalid era range')
        page = await engine(room)
        await page.evaluate('(c)=>window.HollywoodOnlineBridge.init(c)', {
            'startTurn': first, 'endTurn': last, 'humans': human_count,
            'bots': bots, 'names': [x['name'] for x in room['members']]
        })
        room['started'] = True
    else:
        if not room['started']:
            raise ValueError('Start the game first')
        state = room['state']
        if msg.get('version') != room['version']:
            raise ValueError('Game updated; retry after synchronization')
        page = await engine(room)
        if typ in ('buy', 'pass'):
            if seat != current_seat(room):
                raise ValueError('It is another studio’s turn')
            payload = {'filmId': msg.get('filmId', '')} if typ == 'buy' else {}
        elif typ == 'tv':
            if msg.get('playerIndex') != seat:
                raise ValueError('Cannot modify another studio’s contracts')
            if not isinstance(msg.get('enabled'), bool):
                raise ValueError('Invalid contract choice')
            payload = {'playerIndex': seat, 'filmId': msg.get('filmId', ''), 'enabled': msg['enabled']}
        elif typ == 'advance':
            if seat != 0 or state.get('queue') or state.get('complete'):
                raise ValueError('Only the host can advance after every draft selection')
            payload = {}
        else:
            raise ValueError('Unsupported game action')
        if typ == 'buy' and not re.fullmatch(r'[\w.:-]{1,120}', str(payload['filmId'])):
            raise ValueError('Invalid film ID')
        result = await page.evaluate('([t,p])=>window.HollywoodOnlineBridge.action(t,p)', [typ, payload])
        if result is False:
            raise ValueError('Film is not eligible or already acquired')
    room['state'] = await page.evaluate('window.HollywoodOnlineBridge.getSnapshot()')
    room['version'] += 1
    store(room)
    await broadcast(room)


async def websocket_handler(request):
    ws = web.WebSocketResponse(max_msg_size=MAX_MESSAGE, heartbeat=30)
    await ws.prepare(request)
    room = None
    seat = None
    try:
        async for packet in ws:
            if packet.type != WSMsgType.TEXT:
                continue
            try:
                msg = json.loads(packet.data)
                if not isinstance(msg, dict):
                    raise ValueError('Invalid message')
                if room is None:
                    kind = msg.get('type')
                    if kind == 'create':
                        room = create_room(msg.get('name'))
                        seat = 0
                    elif kind in ('join', 'resume'):
                        code = str(msg.get('code', '')).strip().upper()
                        if not re.fullmatch('[A-Z2-9]{6}', code):
                            raise ValueError('Invalid room code')
                        room = get_room(code)
                        if not room:
                            raise ValueError('Room not found')
                        async with room['lock']:
                            token = msg.get('token')
                            existing = next((m for m in room['members'] if token and secrets.compare_digest(m['token'], str(token))), None)
                            if existing:
                                seat = existing['seat']
                            elif kind == 'join' and not room['started'] and len(room['members']) < 4:
                                seat = len(room['members'])
                                room['members'].append({'seat': seat, 'name': clean_name(msg.get('name')), 'token': secrets.token_urlsafe(32)})
                                store(room)
                            else:
                                raise ValueError('Room started, full, or reconnect key invalid')
                    else:
                        raise ValueError('Create or join a room first')
                    member = room['members'][seat]
                    room['connections'][ws] = seat
                    await ws.send_json({'type': 'welcome', 'code': room['code'], 'seat': seat, 'token': member['token']})
                    await broadcast(room)
                else:
                    async with room['lock']:
                        await command(room, seat, msg)
            except Exception as err:
                await ws.send_json({'type': 'error', 'message': str(err)[:180]})
    finally:
        if room:
            room['connections'].pop(ws, None)
            if not room['connections'] and room.get('context'):
                await room['context'].close()
                room['context'] = None
                room['page'] = None
    return ws


async def on_startup(app):
    global PLAYWRIGHT, BROWSER
    db_connection().close()
    PLAYWRIGHT = await async_playwright().start()
    chromium = os.environ.get('CHROMIUM_PATH')
    args = {'headless': True, 'args': ['--no-sandbox']}
    if chromium:
        args['executable_path'] = chromium
    BROWSER = await PLAYWRIGHT.chromium.launch(**args)
    log.info('Hollywood Empire online engine ready')


async def on_cleanup(app):
    for room in ROOMS.values():
        if room.get('context'):
            await room['context'].close()
    if BROWSER:
        await BROWSER.close()
    if PLAYWRIGHT:
        await PLAYWRIGHT.stop()


def make_app():
    app = web.Application(client_max_size=32768)
    app.router.add_get('/ws', websocket_handler)
    app.router.add_get('/health', lambda req: web.json_response({'status': 'ok'}))
    app.router.add_get('/', lambda req: web.FileResponse(ROOT / 'index.html'))
    app.router.add_get('/online.js', lambda req: web.FileResponse(ROOT / 'online.js'))
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


if __name__ == '__main__':
    web.run_app(make_app(), host='0.0.0.0', port=int(os.environ.get('PORT', '8080')))
