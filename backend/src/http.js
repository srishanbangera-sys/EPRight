import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { get } from './db.js';
import { UPLOAD_DIR } from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'epright-dev-secret-change-me';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const bad = (msg, details) => new HttpError(400, msg, details);
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);

export function signToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '7d' });
}

export function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  if (!token) return next(new HttpError(401, 'Please sign in'));
  try {
    const { uid } = jwt.verify(token, JWT_SECRET);
    const user = get('SELECT id, email, name, role, organization_id, is_demo FROM users WHERE id = ?', uid);
    if (!user) return next(new HttpError(401, 'Session expired, please sign in again'));
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'Session expired, please sign in again'));
  }
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(forbidden(`Only ${roles.join(' or ').toLowerCase()} accounts can do this`));
  next();
};

const ALLOWED = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.csv', '.xlsx', '.txt'];
export const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.includes(ext)) return cb(bad(`File type ${ext || '(none)'} is not allowed`));
    cb(null, true);
  },
});

export const fileUrl = (f) => (f ? `/uploads/${f.filename}` : null);

// ---- Input validation helpers ----
export function num(v, name, { min = -Infinity, max = Infinity, required = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${name} is required`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw bad(`${name} must be a number`);
  if (n < min) throw bad(`${name} must be at least ${min}`);
  if (n > max) throw bad(`${name} must be at most ${max}`);
  return n;
}

export function str(v, name, { required = true, max = 500 } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (required) throw bad(`${name} is required`);
    return null;
  }
  const s = String(v).trim();
  if (s.length > max) throw bad(`${name} is too long`);
  return s;
}

export function date(v, name, { required = true } = {}) {
  const s = str(v, name, { required, max: 30 });
  if (s === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) || Number.isNaN(Date.parse(s.slice(0, 10)))) throw bad(`${name} must be a date (YYYY-MM-DD)`);
  return s.slice(0, 10);
}

export function fyParam(v, fallback) {
  const s = v || fallback;
  if (!/^\d{4}-\d{2}$/.test(s)) throw bad('Financial year must look like 2026-27');
  return s;
}
