/**
 * Scoped Token Management — Phase 2 Security
 *
 * API tokens with role-based access, expiry, and revocation.
 * Uses node:sqlite (DatabaseSync) following the audit-logger pattern.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { requireNodeSqlite } from "../memory/sqlite.js";
import type { Role } from "./roles.js";
import { isValidRole } from "./roles.js";

const log = createSubsystemLogger("tokens");

// ─── Types ───────────────────────────────────────

export interface TokenRecord {
  id: number;
  hash: string;
  name: string;
  role: Role;
  scopes: string | null;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked: number;
  revoked_at: string | null;
}

export interface TokenListEntry {
  id: number;
  name: string;
  prefix: string;
  role: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked: boolean;
  revoked_at: string | null;
}

export interface TokenCreateResult {
  token: string; // Full token — shown only once
  id: number;
  name: string;
  prefix: string;
  role: string;
  scopes: string[];
  expires_at: string | null;
}

// ─── Schema ──────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  scopes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,
  last_used_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tokens_hash ON tokens(hash);
CREATE INDEX IF NOT EXISTS idx_tokens_name ON tokens(name);
`;

// ─── Token Generation ────────────────────────────

const TOKEN_PREFIX = "ctx_";
const TOKEN_BYTES = 32;

function generateToken(): string {
  const bytes = crypto.randomBytes(TOKEN_BYTES);
  return TOKEN_PREFIX + bytes.toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function tokenPrefix(token: string): string {
  // Show first 12 chars for identification: "ctx_abcdef12"
  return token.substring(0, 12);
}

// ─── Expiry Parsing ──────────────────────────────

function parseExpiry(expires?: string): string | null {
  if (!expires) {
    return null;
  }
  const match = expires.match(/^(\d+)(d|h|m)$/);
  if (!match) {
    // Try parsing as ISO date
    const parsed = Date.parse(expires);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
    throw new Error(`Invalid expiry format: "${expires}". Use e.g. "30d", "24h", or ISO date.`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const now = Date.now();
  let ms = 0;
  switch (unit) {
    case "d":
      ms = value * 86400000;
      break;
    case "h":
      ms = value * 3600000;
      break;
    case "m":
      ms = value * 60000;
      break;
  }
  return new Date(now + ms).toISOString();
}

// ─── Token Store ─────────────────────────────────

let instance: TokenStore | null = null;

export class TokenStore {
  private db: DatabaseSync | null = null;
  private readonly dbPath: string;
  private initialized = false;

  constructor(opts?: { dbPath?: string }) {
    const stateDir = resolveStateDir(process.env);
    this.dbPath = opts?.dbPath ?? path.join(stateDir, "tokens.db");
  }

  init(): void {
    if (this.initialized) {
      return;
    }
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const { DatabaseSync: SqliteDatabase } = requireNodeSqlite();
      this.db = new SqliteDatabase(this.dbPath);
      this.db.exec(SCHEMA_SQL);
      this.initialized = true;
      log.info(`token store initialized at ${this.dbPath}`);
    } catch (err) {
      log.warn(`token store failed to initialize: ${String(err)}`);
      this.initialized = false;
    }
  }

  /** Create a new API token. Returns the full token string (shown only once). */
  create(params: {
    name: string;
    role: string;
    scopes?: string[];
    expires?: string;
  }): TokenCreateResult {
    if (!this.db) {
      throw new Error("Token store not initialized");
    }

    const name = params.name.trim();
    if (!name) {
      throw new Error("Token name is required");
    }

    if (!isValidRole(params.role)) {
      throw new Error(
        `Invalid role "${params.role}". Valid roles: admin, operator, viewer, chat-only`,
      );
    }
    const role = params.role;
    const scopes = params.scopes?.length ? params.scopes.join(",") : null;
    const expiresAt = parseExpiry(params.expires);

    const token = generateToken();
    const hash = hashToken(token);
    const prefix = tokenPrefix(token);

    const stmt = this.db.prepare(
      `INSERT INTO tokens (hash, name, role, scopes, expires_at) VALUES (?, ?, ?, ?, ?)`,
    );
    const result = stmt.run(hash, name, role, scopes, expiresAt);
    const id =
      typeof result === "object" && result !== null
        ? ((result as Record<string, unknown>).lastInsertRowid as number)
        : 0;

    log.info(`token created: name=${name} role=${role} prefix=${prefix}`);

    return {
      token,
      id: Number(id),
      name,
      prefix,
      role,
      scopes: scopes ? scopes.split(",") : [],
      expires_at: expiresAt,
    };
  }

  /** List all tokens (without sensitive hash data). */
  list(): TokenListEntry[] {
    if (!this.db) {
      return [];
    }
    try {
      const rows = this.db
        .prepare("SELECT * FROM tokens ORDER BY created_at DESC")
        .all() as TokenRecord[];
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        prefix: row.hash.substring(0, 8) + "…",
        role: row.role,
        scopes: row.scopes ? row.scopes.split(",") : [],
        created_at: row.created_at,
        expires_at: row.expires_at,
        last_used_at: row.last_used_at,
        revoked: Boolean(row.revoked),
        revoked_at: row.revoked_at,
      }));
    } catch (err) {
      log.warn(`token list failed: ${String(err)}`);
      return [];
    }
  }

  /** Revoke a token by prefix match or name. */
  revoke(identifier: string): { revoked: boolean; name?: string } {
    if (!this.db) {
      throw new Error("Token store not initialized");
    }

    const trimmed = identifier.trim();
    if (!trimmed) {
      throw new Error("Token identifier is required");
    }

    // Try by name first
    let row = this.db
      .prepare("SELECT id, name, revoked FROM tokens WHERE name = ? LIMIT 1")
      .get(trimmed) as { id: number; name: string; revoked: number } | undefined;

    // Try by hash prefix
    if (!row) {
      row = this.db
        .prepare("SELECT id, name, revoked FROM tokens WHERE hash LIKE ? LIMIT 1")
        .get(trimmed + "%") as { id: number; name: string; revoked: number } | undefined;
    }

    // Try by id
    if (!row && /^\d+$/.test(trimmed)) {
      row = this.db
        .prepare("SELECT id, name, revoked FROM tokens WHERE id = ? LIMIT 1")
        .get(parseInt(trimmed, 10)) as { id: number; name: string; revoked: number } | undefined;
    }

    if (!row) {
      return { revoked: false };
    }
    if (row.revoked) {
      return { revoked: false, name: row.name };
    }

    this.db
      .prepare(
        "UPDATE tokens SET revoked = 1, revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      )
      .run(row.id);

    log.info(`token revoked: name=${row.name}`);
    return { revoked: true, name: row.name };
  }

  /** Validate a token string. Returns the token record if valid, null otherwise. */
  validate(token: string): { role: Role; scopes: string[]; name: string; id: number } | null {
    if (!this.db) {
      return null;
    }
    try {
      const hash = hashToken(token);
      const row = this.db.prepare("SELECT * FROM tokens WHERE hash = ? LIMIT 1").get(hash) as
        | TokenRecord
        | undefined;

      if (!row) {
        return null;
      }
      if (row.revoked) {
        return null;
      }

      // Check expiry
      if (row.expires_at) {
        const expiresAtMs = Date.parse(row.expires_at);
        if (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs) {
          return null;
        }
      }

      // Update last_used_at
      this.db
        .prepare(
          "UPDATE tokens SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        )
        .run(row.id);

      return {
        role: row.role,
        scopes: row.scopes ? row.scopes.split(",") : [],
        name: row.name,
        id: row.id,
      };
    } catch (err) {
      log.warn(`token validation failed: ${String(err)}`);
      return null;
    }
  }

  close(): void {
    try {
      this.db?.close();
    } catch {
      // ignore
    }
    this.db = null;
    this.initialized = false;
  }

  static getInstance(): TokenStore {
    if (!instance) {
      instance = new TokenStore();
    }
    return instance;
  }

  static init(): TokenStore {
    if (!instance) {
      instance = new TokenStore();
    }
    instance.init();
    return instance;
  }

  static destroy(): void {
    instance?.close();
    instance = null;
  }
}
