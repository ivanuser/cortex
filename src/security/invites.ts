/**
 * Invite Link Management — Issue #24
 *
 * Persistent invite codes with role, expiry, and usage limits.
 * Uses node:sqlite (DatabaseSync) following the tokens.ts pattern.
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

const log = createSubsystemLogger("invites");

// ─── Types ───────────────────────────────────────

export interface InviteRecord {
  id: number;
  code: string;
  role: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  created_by: string | null;
  created_at: string;
  revoked: number;
}

export interface InviteListEntry {
  id: number;
  code: string;
  role: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  created_by: string | null;
  created_at: string;
  revoked: boolean;
  valid: boolean;
}

export interface InviteCreateResult {
  code: string;
  role: string;
  expires_at: string | null;
  max_uses: number | null;
  created_at: string;
}

// ─── Schema ──────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  expires_at TEXT,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
`;

// ─── Code Generation ─────────────────────────────

const CODE_LENGTH = 32;

function generateInviteCode(): string {
  return crypto.randomBytes(CODE_LENGTH).toString("base64url").slice(0, CODE_LENGTH);
}

// ─── Expiry Parsing ──────────────────────────────

function parseExpiry(expiresIn?: string): string | null {
  if (!expiresIn) {
    return null;
  }
  const match = expiresIn.match(/^(\d+)(d|h|m)$/);
  if (!match) {
    const parsed = Date.parse(expiresIn);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
    throw new Error(
      `Invalid expiry format: "${expiresIn}". Use e.g. "7d", "24h", "30m", or ISO date.`,
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
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
  return new Date(Date.now() + ms).toISOString();
}

// ─── Invite Store ────────────────────────────────

let instance: InviteStore | null = null;

export class InviteStore {
  private db: DatabaseSync | null = null;
  private readonly dbPath: string;
  private initialized = false;

  constructor(opts?: { dbPath?: string }) {
    const stateDir = resolveStateDir(process.env);
    this.dbPath = opts?.dbPath ?? path.join(stateDir, "invites.db");
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
      log.info(`invite store initialized at ${this.dbPath}`);
    } catch (err) {
      log.warn(`invite store failed to initialize: ${String(err)}`);
      this.initialized = false;
    }
  }

  /** Create a new invite code. */
  createInvite(opts: {
    role: string;
    expiresIn?: string;
    maxUses?: number;
    createdBy?: string;
  }): InviteCreateResult {
    if (!this.db) {
      throw new Error("Invite store not initialized");
    }

    if (!isValidRole(opts.role)) {
      throw new Error(
        `Invalid role "${opts.role}". Valid roles: admin, operator, viewer, chat-only`,
      );
    }

    const code = generateInviteCode();
    const expiresAt = parseExpiry(opts.expiresIn);
    const maxUses = opts.maxUses != null && opts.maxUses > 0 ? opts.maxUses : null;

    const stmt = this.db.prepare(
      `INSERT INTO invites (code, role, expires_at, max_uses, created_by) VALUES (?, ?, ?, ?, ?)`,
    );
    stmt.run(code, opts.role, expiresAt, maxUses, opts.createdBy ?? null);

    log.info(`invite created: role=${opts.role} code=${code.slice(0, 8)}…`);

    // Retrieve created_at from DB
    const row = this.db.prepare("SELECT created_at FROM invites WHERE code = ?").get(code) as
      | { created_at: string }
      | undefined;

    return {
      code,
      role: opts.role,
      expires_at: expiresAt,
      max_uses: maxUses,
      created_at: row?.created_at ?? new Date().toISOString(),
    };
  }

  /** Validate an invite code. Returns role if valid, null otherwise. */
  validateInvite(code: string): { valid: true; role: Role } | { valid: false } {
    if (!this.db) {
      return { valid: false };
    }
    try {
      const row = this.db.prepare("SELECT * FROM invites WHERE code = ? LIMIT 1").get(code) as
        | InviteRecord
        | undefined;

      if (!row) {
        return { valid: false };
      }
      if (row.revoked) {
        return { valid: false };
      }
      // Check expiry
      if (row.expires_at) {
        const expiresAtMs = Date.parse(row.expires_at);
        if (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs) {
          return { valid: false };
        }
      }
      // Check usage limit
      if (row.max_uses != null && row.used_count >= row.max_uses) {
        return { valid: false };
      }
      if (!isValidRole(row.role)) {
        return { valid: false };
      }
      return { valid: true, role: row.role };
    } catch (err) {
      log.warn(`invite validation failed: ${String(err)}`);
      return { valid: false };
    }
  }

  /** Use an invite (increment used_count). Call after successful pairing. */
  useInvite(code: string): boolean {
    if (!this.db) {
      return false;
    }
    try {
      const result = this.db
        .prepare("UPDATE invites SET used_count = used_count + 1 WHERE code = ?")
        .run(code);
      const changes =
        typeof result === "object" && result !== null
          ? ((result as Record<string, unknown>).changes as number)
          : 0;
      if (changes > 0) {
        log.info(`invite used: code=${code.slice(0, 8)}…`);
      }
      return changes > 0;
    } catch (err) {
      log.warn(`invite use failed: ${String(err)}`);
      return false;
    }
  }

  /** List all invites with status info. */
  listInvites(): InviteListEntry[] {
    if (!this.db) {
      return [];
    }
    try {
      const rows = this.db
        .prepare("SELECT * FROM invites ORDER BY created_at DESC")
        .all() as InviteRecord[];
      const now = Date.now();
      return rows.map((row) => {
        let valid = !row.revoked;
        if (valid && row.expires_at) {
          const expiresAtMs = Date.parse(row.expires_at);
          if (Number.isFinite(expiresAtMs) && now > expiresAtMs) {
            valid = false;
          }
        }
        if (valid && row.max_uses != null && row.used_count >= row.max_uses) {
          valid = false;
        }
        return {
          id: row.id,
          code: row.code,
          role: row.role,
          expires_at: row.expires_at,
          max_uses: row.max_uses,
          used_count: row.used_count,
          created_by: row.created_by,
          created_at: row.created_at,
          revoked: Boolean(row.revoked),
          valid,
        };
      });
    } catch (err) {
      log.warn(`invite list failed: ${String(err)}`);
      return [];
    }
  }

  /** Revoke an invite by code. */
  revokeInvite(code: string): { revoked: boolean } {
    if (!this.db) {
      throw new Error("Invite store not initialized");
    }
    const trimmed = code.trim();
    if (!trimmed) {
      throw new Error("Invite code is required");
    }
    try {
      const result = this.db
        .prepare("UPDATE invites SET revoked = 1 WHERE code = ? AND revoked = 0")
        .run(trimmed);
      const changes =
        typeof result === "object" && result !== null
          ? ((result as Record<string, unknown>).changes as number)
          : 0;
      if (changes > 0) {
        log.info(`invite revoked: code=${trimmed.slice(0, 8)}…`);
      }
      return { revoked: changes > 0 };
    } catch (err) {
      log.warn(`invite revoke failed: ${String(err)}`);
      return { revoked: false };
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

  static getInstance(): InviteStore {
    if (!instance) {
      instance = new InviteStore();
    }
    return instance;
  }

  static init(): InviteStore {
    if (!instance) {
      instance = new InviteStore();
    }
    instance.init();
    return instance;
  }

  static destroy(): void {
    instance?.close();
    instance = null;
  }
}
