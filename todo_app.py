#!/usr/bin/env python3
"""Todo App — Web UI + CLI

Run as web server (open in browser or phone):
  python todo_app.py
  python todo_app.py server

CLI commands (use inside Claude or terminal):
  python todo_app.py list
  python todo_app.py add "Task title" [high|normal|low]
  python todo_app.py done <id>
  python todo_app.py delete <id>
"""

import json
import os
import sys
import uuid
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


# ── HTML (embedded) ────────────────────────────────────────────────────────

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Todo</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f0f0f0;
  color: #1a1a1a;
  min-height: 100vh;
}

header {
  background: #111;
  color: white;
  padding: 16px 20px;
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
header h1 { font-size: 1.2rem; font-weight: 700; }
header p  { font-size: 0.78rem; opacity: 0.45; }

.add-bar {
  display: flex;
  gap: 8px;
  padding: 14px 16px;
  background: white;
  border-bottom: 1px solid #e5e5e5;
}
.add-bar input {
  flex: 1;
  padding: 10px 14px;
  border: 1.5px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  min-width: 0;
}
.add-bar input:focus { border-color: #111; }
.add-bar select {
  padding: 10px 6px;
  border: 1.5px solid #ddd;
  border-radius: 8px;
  font-size: 0.82rem;
  background: white;
  cursor: pointer;
}
.add-bar button {
  padding: 10px 18px;
  background: #111;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}
.add-bar button:active { opacity: 0.75; }

.filters {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  overflow-x: auto;
  scrollbar-width: none;
}
.filters::-webkit-scrollbar { display: none; }
.filter-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1.5px solid #ddd;
  background: white;
  cursor: pointer;
  font-size: 0.82rem;
  white-space: nowrap;
  flex-shrink: 0;
}
.filter-btn.active {
  background: #111;
  color: white;
  border-color: #111;
}

.list {
  padding: 10px 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-width: 640px;
  margin: 0 auto;
}

.todo-card {
  background: white;
  border-radius: 12px;
  padding: 13px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.07);
  border-left: 3px solid transparent;
  transition: opacity 0.15s;
}
.todo-card.done    { opacity: 0.45; }
.todo-card.pri-high { border-left-color: #ef4444; }
.todo-card.pri-low  { border-left-color: #94a3b8; }

.check-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid #d1d5db;
  background: none;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
}
.todo-card.done .check-btn {
  background: #22c55e;
  border-color: #22c55e;
  color: white;
}

.todo-body { flex: 1; min-width: 0; }
.todo-title {
  font-size: 0.95rem;
  word-break: break-word;
  line-height: 1.35;
}
.todo-card.done .todo-title {
  text-decoration: line-through;
  color: #9ca3af;
}

.todo-meta { display: flex; align-items: center; gap: 6px; margin-top: 5px; flex-wrap: wrap; }
.days-badge {
  font-size: 0.7rem;
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
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:active { opacity: 0.65; }
.del-btn { background: #fef2f2; color: #dc2626; }
.pri-btn { background: #f8f8f8; }

.empty {
  text-align: center;
  padding: 52px 20px;
  color: #9ca3af;
}
.empty .icon { font-size: 2.8rem; margin-bottom: 10px; }
</style>
</head>
<body>

<header>
  <h1>Todo</h1>
  <p id="summary">loading…</p>
</header>

<div class="add-bar">
  <input type="text" id="new-todo" placeholder="What needs to be done?" autocomplete="off" autocorrect="off">
  <select id="priority">
    <option value="normal">Normal</option>
    <option value="high">! High</option>
    <option value="low">↓ Low</option>
  </select>
  <button onclick="addTodo()">Add</button>
</div>

<div class="filters">
  <button class="filter-btn active" data-filter="active"  onclick="setFilter(this)">Active</button>
  <button class="filter-btn"        data-filter="all"     onclick="setFilter(this)">All</button>
  <button class="filter-btn"        data-filter="done"    onclick="setFilter(this)">Done</button>
  <button class="filter-btn"        data-filter="high"    onclick="setFilter(this)">High priority</button>
  <button class="filter-btn"        data-filter="overdue" onclick="setFilter(this)">7+ days</button>
</div>

<div class="list" id="list"></div>

<script>
let todos = [];
let filter = 'active';

async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.ok ? r.json() : null;
}

async function load() {
  todos = await api('GET', '/todos') || [];
  render();
}

function daysPending(todo) {
  if (todo.done) return null;
  const ms = Date.now() - new Date(todo.created_at).getTime();
  return Math.floor(ms / 86400000);
}

function daysBadge(todo) {
  if (todo.done) return '<span class="days-badge badge-done">completed</span>';
  const d = daysPending(todo);
  if (d === 0) return '<span class="days-badge badge-today">added today</span>';
  if (d <= 3)  return `<span class="days-badge badge-ok">${d}d pending</span>`;
  if (d <= 7)  return `<span class="days-badge badge-warn">${d}d pending</span>`;
  return `<span class="days-badge badge-urgent">${d}d pending !</span>`;
}

const PRI_LABELS = { high: '🔴', normal: '⚪', low: '🔵' };
const PRI_CYCLE  = { normal: 'high', high: 'low', low: 'normal' };
const PRI_ORDER  = { high: 2, normal: 1, low: 0 };

function setFilter(btn) {
  filter = btn.dataset.filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render();
}

function render() {
  const active = todos.filter(t => !t.done);
  const done   = todos.filter(t => t.done);
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
        ${!t.done ? `<button class="icon-btn pri-btn" title="Cycle priority" onclick="cyclePri('${t.id}')">${PRI_LABELS[t.priority]}</button>` : ''}
        <button class="icon-btn del-btn" title="Delete" onclick="del('${t.id}')">✕</button>
      </div>
    </div>`).join('');
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
        pass  # suppress default access logs

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
        else:
            body = HTML.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

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
    print(f"\n  Todo App")
    print(f"  ─────────────────────────────────")
    print(f"  Local:   http://localhost:{PORT}")
    print(f"  Network: http://{ip}:{PORT}   ← open on your phone (same Wi-Fi)")
    print(f"  ─────────────────────────────────")
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
