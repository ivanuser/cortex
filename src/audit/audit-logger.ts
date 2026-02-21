/**
 * Audit Logger — Phase 1 Security Foundation
 *
 * Singleton service for writing, querying, and pruning audit log events.
 * Uses node:sqlite (DatabaseSync) following the same pattern as memory/manager.ts.
 */
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { requireNodeSqlite } from "../memory/sqlite.js";

const log = createSubsystemLogger("audit");

// ─── Types ───────────────────────────────────────

export type AuditActorType = "operator" | "node" | "device" | "system" | "webchat" | "unknown";

export interface AuditEvent {
  actor_type: AuditActorType;
  actor_id?: string;
  action: string;
  resource?: string;
  details?: string;
  ip?: string;
  result?: "success" | "failure" | "denied";
}

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  resource: string | null;
  details: string | null;
  ip: string | null;
  result: string;
  created_at: number;
}

export interface AuditQueryFilters {
  action?: string;
  actor?: string;
  since?: number; // unix epoch seconds
  until?: number; // unix epoch seconds
  result?: string;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  total: number;
  byAction: Record<string, number>;
  byActor: Record<string, number>;
  failures: number;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
}

// ─── Schema ──────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  details TEXT,
  ip TEXT,
  result TEXT NOT NULL DEFAULT 'success',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
`;

// ─── Singleton ───────────────────────────────────

let instance: AuditLogger | null = null;

export class AuditLogger {
  private db: DatabaseSync | null = null;
  private readonly dbPath: string;
  private readonly retentionDays: number;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(opts?: { dbPath?: string; retentionDays?: number }) {
    const stateDir = resolveStateDir(process.env);
    this.dbPath = opts?.dbPath ?? path.join(stateDir, "audit.db");
    this.retentionDays = opts?.retentionDays ?? 90;
  }

  /** Initialize the database and schema. Safe to call multiple times. */
  init(): void {
    if (this.initialized) {
      return;
    }
    try {
      // Ensure parent directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Use node:sqlite following same pattern as memory/sqlite.ts
      const { DatabaseSync: SqliteDatabase } = requireNodeSqlite();
      this.db = new SqliteDatabase(this.dbPath);
      this.db.exec(SCHEMA_SQL);
      this.initialized = true;

      // Start auto-prune every 6 hours
      this.pruneTimer = setInterval(
        () => {
          try {
            this.prune(this.retentionDays);
          } catch (err) {
            log.warn(`auto-prune failed: ${String(err)}`);
          }
        },
        6 * 60 * 60 * 1000,
      );
      // Don't block shutdown
      if (this.pruneTimer?.unref) {
        this.pruneTimer.unref();
      }

      // Run initial prune
      try {
        this.prune(this.retentionDays);
      } catch {
        // ignore initial prune failures
      }

      log.info(`audit log initialized at ${this.dbPath}`);
    } catch (err) {
      log.warn(`audit logger failed to initialize: ${String(err)}`);
      this.initialized = false;
    }
  }

  /** Log an audit event. Non-blocking, never throws. */
  log(event: AuditEvent): void {
    try {
      if (!this.db) {
        return;
      }
      const stmt = this.db.prepare(
        `INSERT INTO audit_log (actor_type, actor_id, action, resource, details, ip, result)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      stmt.run(
        event.actor_type,
        event.actor_id ?? null,
        event.action,
        event.resource ?? null,
        event.details ?? null,
        event.ip ?? null,
        event.result ?? "success",
      );
    } catch (err) {
      // Never crash the gateway
      log.warn(`audit log write failed: ${String(err)}`);
    }
  }

  /** Query audit entries with filters. */
  query(filters: AuditQueryFilters = {}): AuditLogEntry[] {
    if (!this.db) {
      return [];
    }
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters.action) {
        conditions.push("action = ?");
        params.push(filters.action);
      }
      if (filters.actor) {
        conditions.push("actor_id = ?");
        params.push(filters.actor);
      }
      if (filters.since != null) {
        conditions.push("created_at >= ?");
        params.push(filters.since);
      }
      if (filters.until != null) {
        conditions.push("created_at <= ?");
        params.push(filters.until);
      }
      if (filters.result) {
        conditions.push("result = ?");
        params.push(filters.result);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = Math.min(filters.limit ?? 100, 1000);
      const offset = filters.offset ?? 0;

      const sql = `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as AuditLogEntry[];
    } catch (err) {
      log.warn(`audit query failed: ${String(err)}`);
      return [];
    }
  }

  /** Get summary statistics. */
  stats(): AuditStats {
    if (!this.db) {
      return {
        total: 0,
        byAction: {},
        byActor: {},
        failures: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
      };
    }
    try {
      const totalRow = this.db.prepare("SELECT COUNT(*) as cnt FROM audit_log").get() as {
        cnt: number;
      };
      const failureRow = this.db
        .prepare("SELECT COUNT(*) as cnt FROM audit_log WHERE result != 'success'")
        .get() as { cnt: number };

      const actionRows = this.db
        .prepare(
          "SELECT action, COUNT(*) as cnt FROM audit_log GROUP BY action ORDER BY cnt DESC LIMIT 50",
        )
        .all() as Array<{ action: string; cnt: number }>;

      const actorRows = this.db
        .prepare(
          "SELECT actor_id, COUNT(*) as cnt FROM audit_log WHERE actor_id IS NOT NULL GROUP BY actor_id ORDER BY cnt DESC LIMIT 50",
        )
        .all() as Array<{ actor_id: string; cnt: number }>;

      const oldestRow = this.db
        .prepare("SELECT timestamp FROM audit_log ORDER BY created_at ASC LIMIT 1")
        .get() as { timestamp: string } | undefined;

      const newestRow = this.db
        .prepare("SELECT timestamp FROM audit_log ORDER BY created_at DESC LIMIT 1")
        .get() as { timestamp: string } | undefined;

      const byAction: Record<string, number> = {};
      for (const row of actionRows) {
        byAction[row.action] = row.cnt;
      }

      const byActor: Record<string, number> = {};
      for (const row of actorRows) {
        byActor[row.actor_id] = row.cnt;
      }

      return {
        total: totalRow.cnt,
        byAction,
        byActor,
        failures: failureRow.cnt,
        oldestTimestamp: oldestRow?.timestamp ?? null,
        newestTimestamp: newestRow?.timestamp ?? null,
      };
    } catch (err) {
      log.warn(`audit stats failed: ${String(err)}`);
      return {
        total: 0,
        byAction: {},
        byActor: {},
        failures: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
      };
    }
  }

  /** Delete entries older than the given number of days. Returns count deleted. */
  prune(olderThanDays: number): number {
    if (!this.db) {
      return 0;
    }
    try {
      const cutoff = Math.floor(Date.now() / 1000) - olderThanDays * 86400;
      const result = this.db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(cutoff);
      const deleted = (result as unknown as { changes: number }).changes ?? 0;
      if (deleted > 0) {
        log.info(`pruned ${deleted} audit entries older than ${olderThanDays} days`);
      }
      return deleted;
    } catch (err) {
      log.warn(`audit prune failed: ${String(err)}`);
      return 0;
    }
  }

  /** Graceful shutdown. */
  close(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    try {
      this.db?.close();
    } catch {
      // ignore
    }
    this.db = null;
    this.initialized = false;
  }

  /** Get singleton instance. */
  static getInstance(): AuditLogger {
    if (!instance) {
      instance = new AuditLogger();
    }
    return instance;
  }

  /** Initialize singleton. Call at gateway startup. */
  static init(opts?: { retentionDays?: number }): AuditLogger {
    if (!instance) {
      instance = new AuditLogger(opts);
    }
    instance.init();
    return instance;
  }

  /** Destroy singleton (for testing). */
  static destroy(): void {
    instance?.close();
    instance = null;
  }
}
