require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("Configure JWT_SECRET no arquivo .env com pelo menos 32 caracteres.");
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "parque123") {
  console.error("Configure ADMIN_PASSWORD no .env. Não use a senha de demonstração do front-end.");
  process.exit(1);
}

app.use(helmet());
app.use(cors({
  origin: (process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500").split(",").map(s => s.trim()),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "100kb" }));

const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "parque.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS content (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info' CHECK(type IN ('info','warning','urgent')),
    priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const username = process.env.ADMIN_USERNAME || "admin";
const existingAdmin = db.prepare("SELECT id FROM admins WHERE username = ?").get(username);
if (!existingAdmin) {
  const passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
  db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(username, passwordHash);
  console.log(`Administrador inicial criado: ${username}`);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Autenticação necessária." });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado. Entre novamente." });
  }
}

function validateText(value, max, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    return `${label} deve ser um texto entre 1 e ${max} caracteres.`;
  }
  return null;
}

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "Parque Ecológico API" }));

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Informe usuário e senha." });
  }
  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(username.trim());
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Usuário ou senha incorretos." });
  }
  const token = jwt.sign({ sub: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ token, expiresIn: 7200, username: admin.username });
});

app.get("/api/content", (_req, res) => {
  const rows = db.prepare("SELECT key, value, updated_at FROM content ORDER BY key").all();
  const result = {};
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value); }
    catch { result[row.key] = row.value; }
  }
  res.json(result);
});

app.put("/api/content/:key", requireAuth, (req, res) => {
  const key = String(req.params.key || "");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key)) return res.status(400).json({ error: "Chave inválida." });
  if (req.body === undefined || req.body.value === undefined) {
    return res.status(400).json({ error: "Envie o campo value." });
  }
  const value = JSON.stringify(req.body.value);
  if (value.length > 50000) return res.status(413).json({ error: "Conteúdo muito grande." });
  db.prepare(`
    INSERT INTO content (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
  res.json({ message: "Conteúdo salvo.", key });
});

app.get("/api/announcements", (_req, res) => {
  const rows = db.prepare("SELECT id, title, content, type, priority, created_at FROM announcements ORDER BY priority DESC, created_at DESC").all();
  res.json(rows);
});

app.post("/api/announcements", requireAuth, (req, res) => {
  const { title, content, type = "info", priority = 3 } = req.body || {};
  const titleError = validateText(title, 160, "Título");
  const contentError = validateText(content, 5000, "Conteúdo");
  if (titleError || contentError) return res.status(400).json({ error: titleError || contentError });
  if (!["info", "warning", "urgent"].includes(type)) return res.status(400).json({ error: "Tipo inválido." });
  if (!Number.isInteger(priority) || priority < 1 || priority > 5) return res.status(400).json({ error: "Prioridade deve ser de 1 a 5." });
  const result = db.prepare("INSERT INTO announcements (title, content, type, priority) VALUES (?, ?, ?, ?)").run(title.trim(), content.trim(), type, priority);
  const item = db.prepare("SELECT id, title, content, type, priority, created_at FROM announcements WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(item);
});

app.delete("/api/announcements/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "ID inválido." });
  const result = db.prepare("DELETE FROM announcements WHERE id = ?").run(id);
  if (!result.changes) return res.status(404).json({ error: "Comunicado não encontrado." });
  res.json({ message: "Comunicado excluído." });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

app.listen(PORT, () => {
  console.log(`API do Parque Ecológico disponível em http://localhost:${PORT}`);
});
