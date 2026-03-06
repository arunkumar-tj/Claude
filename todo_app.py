#!/usr/bin/env python3
"""Todo App — Web PWA + CLI

Install on iPhone:
  1. python todo_app.py
  2. Open http://<your-ip>:8080 in Safari on your iPhone
  3. Tap the Share button → "Add to Home Screen"
  4. Done — it works like a native app, offline too!

CLI commands:
  python todo_app.py list
  python todo_app.py add "Task title" [high|normal|low]
  python todo_app.py done <id>
  python todo_app.py delete <id>
"""

import json
import os
import struct
import sys
import uuid
import zlib
import socket
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "todos.json")
PORT = 8080


# ── Data layer ─────────────────────────────────────────────────────────────

def load():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f:
            return json.load(f)
    return []


def save(todos):
    with open(DATA_FILE, "w") as f:
        json.dump(todos, f, indent=2)


def new_todo(title, priority="normal"):
    return {
        "id": str(uuid.uuid4())[:8],
        "title": title,
        "done": False,
        "priority": priority,  # high | normal | low
        "created_at": datetime.now().isoformat(),
        "done_at": None,
    }


def days_pending(todo):
    if todo.get("done"):
        return None
    created = datetime.fromisoformat(todo["created_at"])
    return (datetime.now() - created).days


# ── CLI ────────────────────────────────────────────────────────────────────

def cli_list():
    todos = load()
    if not todos:
        print('No todos yet. Add one: python todo_app.py add "Task name"')
        return

    active = [t for t in todos if not t["done"]]
    done = [t for t in todos if t["done"]]

    pri_order = {"high": 2, "normal": 1, "low": 0}
    active_sorted = sorted(active, key=lambda x: (-pri_order[x["priority"]], x["created_at"]))

    print(f"\n{'ID':8}  {'DAYS':8}  {'PRI':6}  TASK")
    print("─" * 60)

    for t in active_sorted:
        d = days_pending(t)
        badge = "today" if d == 0 else f"{d}d"
        urgency = "  " if d is None or d <= 3 else ("⚠ " if d <= 7 else "🔴")
        pri = {"high": "[HIGH]", "normal": "      ", "low": "[low] "}[t["priority"]]
        print(f"{t['id']:8}  {urgency}{badge:6}  {pri}  {t['title']}")

    if done:
        print(f"\n  ✓ Completed ({len(done)} total, showing last 5):")
        for t in done[-5:]:
            print(f"    {t['id']:8}  ✓  {t['title']}")

    print()


def cli_add(title, priority="normal"):
    valid = {"high", "normal", "low"}
    if priority not in valid:
        print(f"Priority must be one of: {', '.join(valid)}")
        sys.exit(1)
    todos = load()
    t = new_todo(title, priority)
    todos.append(t)
    save(todos)
    print(f"Added [{t['id']}]: {t['title']}  (priority: {priority})")


def cli_done(todo_id):
    todos = load()
    for t in todos:
        if t["id"].startswith(todo_id):
            t["done"] = True
            t["done_at"] = datetime.now().isoformat()
            save(todos)
            print(f"✓ Done: {t['title']}")
            return
    print(f"Not found: {todo_id}")
    sys.exit(1)


def cli_delete(todo_id):
    todos = load()
    before = len(todos)
    todos = [t for t in todos if not t["id"].startswith(todo_id)]
    if len(todos) < before:
        save(todos)
        print(f"Deleted {todo_id}")
    else:
        print(f"Not found: {todo_id}")
        sys.exit(1)


# ── Icon generator (pure stdlib, no PIL) ───────────────────────────────────

def make_icon_png(size):
    """Generate a dark PNG icon with a white checkmark, using only stdlib."""
    bg = (17, 17, 17)
    fg = (255, 255, 255)

    img = [[bg] * size for _ in range(size)]

    def draw_line(x0, y0, x1, y1, thickness):
        steps = max(abs(x1 - x0), abs(y1 - y0))
        if steps == 0:
            return
        for i in range(steps + 1):
            x = round(x0 + (x1 - x0) * i / steps)
            y = round(y0 + (y1 - y0) * i / steps)
            for dx in range(-thickness, thickness + 1):
                for dy in range(-thickness, thickness + 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < size and 0 <= ny < size:
                        img[ny][nx] = fg

    m = size // 5
    t = max(size // 18, 2)
    mid_x = int(size * 0.38)
    mid_y = size - m
    draw_line(m, size // 2, mid_x, mid_y, t)
    draw_line(mid_x, mid_y, size - m, m, t)

    def png_chunk(name, data):
        payload = name + data
        return struct.pack('>I', len(data)) + payload + struct.pack('>I', zlib.crc32(payload) & 0xFFFFFFFF)

    raw = b''.join(b'\x00' + bytes(c for px in row for c in px) for row in img)

    return (
        b'\x89PNG\r\n\x1a\n'
        + png_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
        + png_chunk(b'IDAT', zlib.compress(raw, 6))
        + png_chunk(b'IEND', b'')
    )


ICON_192 = make_icon_png(192)
ICON_512 = make_icon_png(512)


# ── Static assets ──────────────────────────────────────────────────────────

MANIFEST = json.dumps({
    "name": "Todo",
    "short_name": "Todo",
    "description": "Simple todo app — tracks pending days",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#111111",
    "theme_color": "#111111",
    "icons": [
        {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
        {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
    ],
}).encode()

SERVICE_WORKER = b"""
const CACHE = 'todo-v2';
const SHELL  = ['/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API calls: network first, no caching
  if (url.pathname.startsWith('/todos') || url.pathname.startsWith('/icon') || url.pathname === '/manifest.json') {
    e.respondWith(fetch(e.request).catch(() => new Response('offline', { status: 503 })));
    return;
  }
  // App shell: cache first
  e.respondWith(
    caches.match('/').then(cached => cached || fetch(e.request))
  );
});
"""

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Todo</title>

<!-- PWA / iOS install support -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Todo">
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#111111">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icon-192.png">

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --safe-top:    env(safe-area-inset-top,    0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left:   env(safe-area-inset-left,   0px);
  --safe-right:  env(safe-area-inset-right,  0px);
}

html { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f0f0f0;
  color: #1a1a1a;
  height: 100%;
  display: flex;
  flex-direction: column;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior: none;
}

/* ── Header ── */
header {
  background: #111;
  color: white;
  padding: calc(14px + var(--safe-top)) 20px 14px;
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-shrink: 0;
}
header h1 { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.3px; }
header p  { font-size: 0.75rem; opacity: 0.45; flex: 1; }
#install-hint {
  font-size: 0.7rem;
  background: rgba(255,255,255,0.15);
  padding: 4px 10px;
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
  display: none;
}

/* ── Add bar ── */
.add-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  padding-left: calc(16px + var(--safe-left));
  padding-right: calc(16px + var(--safe-right));
  background: white;
  border-bottom: 1px solid #e5e5e5;
  flex-shrink: 0;
}
.add-bar input {
  flex: 1;
  min-width: 0;
  padding: 11px 14px;
  border: 1.5px solid #ddd;
  border-radius: 10px;
  font-size: 1rem;
  outline: none;
  -webkit-appearance: none;
}
.add-bar input:focus { border-color: #111; }
.add-bar select {
  padding: 11px 6px;
  border: 1.5px solid #ddd;
  border-radius: 10px;
  font-size: 0.82rem;
  background: white;
  -webkit-appearance: none;
  appearance: none;
  padding-right: 4px;
}
.add-bar button {
  padding: 11px 18px;
  background: #111;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-appearance: none;
}
.add-bar button:active { opacity: 0.7; }

/* ── Filters ── */
.filters {
  display: flex;
  gap: 7px;
  padding: 10px 16px;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
  background: #f0f0f0;
}
.filters::-webkit-scrollbar { display: none; }
.filter-btn {
  padding: 7px 14px;
  border-radius: 20px;
  border: 1.5px solid #d0d0d0;
  background: white;
  cursor: pointer;
  font-size: 0.82rem;
  white-space: nowrap;
  flex-shrink: 0;
  -webkit-appearance: none;
}
.filter-btn.active { background: #111; color: white; border-color: #111; }

/* ── List ── */
.list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 10px 16px calc(16px + var(--safe-bottom));
  padding-left: calc(16px + var(--safe-left));
  padding-right: calc(16px + var(--safe-right));
  display: flex;
  flex-direction: column;
  gap: 9px;
}

/* ── Card ── */
.todo-card {
  background: white;
  border-radius: 13px;
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.07);
  border-left: 3px solid transparent;
  transition: opacity 0.15s;
  touch-action: manipulation;
}
.todo-card.done    { opacity: 0.4; }
.todo-card.pri-high { border-left-color: #ef4444; }
.todo-card.pri-low  { border-left-color: #94a3b8; }

.check-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid #d1d5db;
  background: none;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-appearance: none;
}
.todo-card.done .check-btn { background: #22c55e; border-color: #22c55e; color: white; }

.todo-body { flex: 1; min-width: 0; }
.todo-title { font-size: 0.96rem; word-break: break-word; line-height: 1.4; }
.todo-card.done .todo-title { text-decoration: line-through; color: #9ca3af; }

.todo-meta { display: flex; align-items: center; gap: 6px; margin-top: 5px; flex-wrap: wrap; }
.days-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}
.badge-today  { background: #f0fdf4; color: #16a34a; }
.badge-ok     { background: #f0fdf4; color: #16a34a; }
.badge-warn   { background: #fefce8; color: #ca8a04; }
.badge-urgent { background: #fef2f2; color: #dc2626; }
.badge-done   { background: #f3f4f6; color: #6b7280; }

.actions { display: flex; gap: 6px; flex-shrink: 0; }
.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  border: none;
  cursor: pointer;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-appearance: none;
}
.icon-btn:active { opacity: 0.6; transform: scale(0.93); }
.del-btn { background: #fef2f2; color: #dc2626; }
.pri-btn { background: #f4f4f4; }

.empty { text-align: center; padding: 60px 20px; color: #9ca3af; }
.empty .icon { font-size: 3rem; margin-bottom: 12px; }

/* ── Install banner ── */
.install-banner {
  display: none;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #1a1a1a;
  color: white;
  font-size: 0.82rem;
}
.install-banner.show { display: flex; }
.install-banner span { flex: 1; opacity: 0.85; }
.install-banner button {
  padding: 7px 14px;
  background: white;
  color: #111;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
</style>
</head>
<body>

<header>
  <h1>Todo</h1>
  <p id="summary">loading…</p>
  <span id="install-hint" onclick="showInstallHelp()">+ Install</span>
</header>

<div class="install-banner" id="install-banner">
  <span>Install: Safari → Share → "Add to Home Screen"</span>
  <button onclick="dismissBanner()">Got it</button>
</div>

<div class="add-bar">
  <input type="text" id="new-todo" placeholder="Add a todo…"
         autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false">
  <select id="priority">
    <option value="normal">·</option>
    <option value="high">!</option>
    <option value="low">↓</option>
  </select>
  <button onclick="addTodo()">Add</button>
</div>

<div class="filters">
  <button class="filter-btn active" data-filter="active"  onclick="setFilter(this)">Active</button>
  <button class="filter-btn"        data-filter="all"     onclick="setFilter(this)">All</button>
  <button class="filter-btn"        data-filter="done"    onclick="setFilter(this)">Done</button>
  <button class="filter-btn"        data-filter="high"    onclick="setFilter(this)">High</button>
  <button class="filter-btn"        data-filter="overdue" onclick="setFilter(this)">7+ days</button>
</div>

<div class="list" id="list"></div>

<script>
let todos  = [];
let filter = 'active';

// ── PWA install prompt ──────────────────────────────────────────────────
const isStandalone = window.navigator.standalone === true
  || window.matchMedia('(display-mode: standalone)').matches;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

if (!isStandalone) {
  if (isIOS) {
    document.getElementById('install-hint').style.display = 'block';
  }
}

function showInstallHelp() {
  document.getElementById('install-banner').classList.add('show');
}
function dismissBanner() {
  document.getElementById('install-banner').classList.remove('show');
}

// ── Service Worker ──────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── API ─────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  try {
    const r = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

async function load() {
  const data = await api('GET', '/todos');
  if (data) { todos = data; render(); }
}

// ── Rendering ───────────────────────────────────────────────────────────
function daysPending(todo) {
  if (todo.done) return null;
  return Math.floor((Date.now() - new Date(todo.created_at).getTime()) / 86400000);
}

function daysBadge(todo) {
  if (todo.done) return '<span class="days-badge badge-done">done</span>';
  const d = daysPending(todo);
  if (d === 0) return '<span class="days-badge badge-today">today</span>';
  if (d <= 3)  return `<span class="days-badge badge-ok">${d}d</span>`;
  if (d <= 7)  return `<span class="days-badge badge-warn">${d}d pending</span>`;
  return `<span class="days-badge badge-urgent">${d}d overdue</span>`;
}

const PRI_ICON  = { high: '🔴', normal: '⚪', low: '🔵' };
const PRI_CYCLE = { normal: 'high', high: 'low', low: 'normal' };
const PRI_ORDER = { high: 2, normal: 1, low: 0 };

function setFilter(btn) {
  filter = btn.dataset.filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render();
}

function render() {
  const active = todos.filter(t => !t.done);
  const done   = todos.filter(t =>  t.done);
  document.getElementById('summary').textContent =
    `${active.length} active · ${done.length} done`;

  let list = todos;
  if (filter === 'active')  list = active;
  else if (filter === 'done')   list = done;
  else if (filter === 'high')   list = active.filter(t => t.priority === 'high');
  else if (filter === 'overdue') list = active.filter(t => daysPending(t) >= 7);

  list = [...list].sort((a, b) => {
    if (!a.done && !b.done) {
      const pd = PRI_ORDER[b.priority] - PRI_ORDER[a.priority];
      if (pd !== 0) return pd;
    }
    return new Date(a.created_at) - new Date(b.created_at);
  });

  const el = document.getElementById('list');
  if (!list.length) {
    el.innerHTML = '<div class="empty"><div class="icon">✓</div><p>Nothing here</p></div>';
    return;
  }

  el.innerHTML = list.map(t => `
    <div class="todo-card ${t.done ? 'done' : ''} pri-${t.priority}">
      <button class="check-btn" onclick="toggle('${t.id}')">${t.done ? '✓' : ''}</button>
      <div class="todo-body">
        <div class="todo-title">${esc(t.title)}</div>
        <div class="todo-meta">${daysBadge(t)}</div>
      </div>
      <div class="actions">
        ${!t.done ? `<button class="icon-btn pri-btn" title="Priority" onclick="cyclePri('${t.id}')">${PRI_ICON[t.priority]}</button>` : ''}
        <button class="icon-btn del-btn" title="Delete" onclick="del('${t.id}')">✕</button>
      </div>
    </div>`).join('');
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Actions ─────────────────────────────────────────────────────────────
async function addTodo() {
  const inp = document.getElementById('new-todo');
  const title = inp.value.trim();
  if (!title) { inp.focus(); return; }
  const priority = document.getElementById('priority').value;
  await api('POST', '/todos', { title, priority });
  inp.value = '';
  inp.focus();
  load();
}

async function toggle(id) {
  await api('PATCH', `/todos/${id}`, { action: 'toggle' });
  load();
}

async function del(id) {
  await api('DELETE', `/todos/${id}`);
  load();
}

async function cyclePri(id) {
  const t = todos.find(x => x.id === id);
  if (!t) return;
  await api('PATCH', `/todos/${id}`, { action: 'priority', value: PRI_CYCLE[t.priority] });
  load();
}

document.getElementById('new-todo').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTodo();
});

load();
setInterval(load, 30000);
</script>
</body>
</html>"""


# ── HTTP handler ───────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send_bytes(self, body, content_type, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/todos":
            self.send_json(load())
        elif path == "/manifest.json":
            self.send_bytes(MANIFEST, "application/manifest+json")
        elif path == "/sw.js":
            self.send_bytes(SERVICE_WORKER, "application/javascript")
        elif path == "/icon-192.png":
            self.send_bytes(ICON_192, "image/png")
        elif path == "/icon-512.png":
            self.send_bytes(ICON_512, "image/png")
        else:
            self.send_bytes(HTML.encode(), "text/html; charset=utf-8")

    def do_POST(self):
        if urlparse(self.path).path == "/todos":
            data = self.read_body()
            title = data.get("title", "").strip()
            if not title:
                self.send_json({"error": "title required"}, 400)
                return
            todos = load()
            t = new_todo(title, data.get("priority", "normal"))
            todos.append(t)
            save(todos)
            self.send_json(t, 201)

    def do_PATCH(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) == 2 and parts[0] == "todos":
            todo_id = parts[1]
            data = self.read_body()
            todos = load()
            for t in todos:
                if t["id"] == todo_id:
                    action = data.get("action")
                    if action == "toggle":
                        t["done"] = not t["done"]
                        t["done_at"] = datetime.now().isoformat() if t["done"] else None
                    elif action == "priority":
                        t["priority"] = data.get("value", "normal")
                    save(todos)
                    self.send_json(t)
                    return
            self.send_json({"error": "not found"}, 404)

    def do_DELETE(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) == 2 and parts[0] == "todos":
            todo_id = parts[1]
            todos = load()
            new_todos = [t for t in todos if t["id"] != todo_id]
            save(new_todos)
            self.send_json({"ok": True})


# ── Server startup ─────────────────────────────────────────────────────────

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


def start_server():
    ip = get_local_ip()
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"\n  Todo App  (PWA — installable on iPhone)")
    print(f"  ──────────────────────────────────────────")
    print(f"  Local:   http://localhost:{PORT}")
    print(f"  iPhone:  http://{ip}:{PORT}")
    print(f"           Open in Safari → Share → Add to Home Screen")
    print(f"  ──────────────────────────────────────────")
    print(f"  Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    args = sys.argv[1:]

    if not args or args[0] == "server":
        start_server()
    elif args[0] == "list":
        cli_list()
    elif args[0] == "add":
        if len(args) < 2:
            print('Usage: python todo_app.py add "Task title" [high|normal|low]')
            sys.exit(1)
        priority = args[-1] if args[-1] in {"high", "normal", "low"} and len(args) > 2 else "normal"
        title = " ".join(args[1:-1] if priority != "normal" and len(args) > 2 else args[1:])
        cli_add(title, priority)
    elif args[0] == "done":
        if len(args) != 2:
            print("Usage: python todo_app.py done <id>")
            sys.exit(1)
        cli_done(args[1])
    elif args[0] == "delete":
        if len(args) != 2:
            print("Usage: python todo_app.py delete <id>")
            sys.exit(1)
        cli_delete(args[1])
    else:
        print(__doc__)
