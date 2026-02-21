/**
 * Audit CLI — Phase 1 Security Foundation (#5)
 *
 * Commands:
 *   cortex audit log          — tail recent audit entries
 *   cortex audit stats        — summary statistics
 *   cortex audit prune        — manual cleanup
 */
import type { Command } from "commander";
import { colorize, theme } from "../terminal/theme.js";
import { callGatewayFromCli, addGatewayClientOptions, type GatewayRpcOpts } from "./gateway-rpc.js";

function parseSinceDuration(since: string): number | undefined {
  const match = since.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) {
    return undefined;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
  };
  const seconds = value * (multipliers[unit] ?? 1);
  return Math.floor(Date.now() / 1000) - seconds;
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString();
  } catch {
    return ts;
  }
}

function resultColor(result: string): string {
  if (result === "success") {
    return theme.success(result);
  }
  if (result === "denied") {
    return theme.warn(result);
  }
  return theme.error(result);
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

export function registerAuditCli(program: Command) {
  const audit = program
    .command("audit")
    .description("Security audit log (view, filter, and manage audit entries)");

  // ─── cortex audit log ────────────────────
  const logCmd = audit
    .command("log")
    .description("View recent audit log entries")
    .option("--action <action>", "Filter by action (e.g. config.apply)")
    .option("--actor <id>", "Filter by actor ID")
    .option("--since <duration>", "Time filter (e.g. 24h, 7d, 1w)")
    .option("--result <result>", "Filter by result (success, failure, denied)")
    .option("--limit <n>", "Max entries to return", "50")
    .option("--json", "Output as JSON");

  addGatewayClientOptions(logCmd);

  logCmd.action(
    async (
      opts: GatewayRpcOpts & {
        action?: string;
        actor?: string;
        since?: string;
        result?: string;
        limit?: string;
        json?: boolean;
      },
    ) => {
      try {
        const params: Record<string, unknown> = {};
        if (opts.action) {
          params.action = opts.action;
        }
        if (opts.actor) {
          params.actor = opts.actor;
        }
        if (opts.since) {
          const sinceEpoch = parseSinceDuration(opts.since);
          if (sinceEpoch == null) {
            console.error(`Invalid --since format: ${opts.since}. Use e.g. 24h, 7d, 1w`);
            process.exitCode = 1;
            return;
          }
          params.since = sinceEpoch;
        }
        if (opts.result) {
          params.result = opts.result;
        }
        if (opts.limit) {
          params.limit = parseInt(opts.limit, 10);
        }

        const result = await callGatewayFromCli("audit.query", opts, params);
        const data = result as {
          entries?: Array<{
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
          }>;
          count?: number;
        };

        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const entries = data.entries ?? [];
        if (entries.length === 0) {
          console.log(theme.muted("No audit entries found."));
          return;
        }

        // Pretty table output
        console.log(`\n${theme.muted("─".repeat(100))}`);
        console.log(
          `  ${theme.muted("Timestamp".padEnd(22))} ${theme.muted("Action".padEnd(24))} ${theme.muted("Actor".padEnd(20))} ${theme.muted("Result".padEnd(10))} ${theme.muted("IP")}`,
        );
        console.log(theme.muted("─".repeat(100)));

        for (const entry of entries) {
          const ts = formatTimestamp(entry.timestamp);
          const action = truncate(entry.action ?? "", 23);
          const actor = truncate(entry.actor_id ?? entry.actor_type ?? "—", 19);
          const entryResult = resultColor(entry.result ?? "");
          const ip = entry.ip ?? "—";
          console.log(
            `  ${ts.padEnd(22)} ${action.padEnd(24)} ${actor.padEnd(20)} ${entryResult.padEnd(10)} ${ip}`,
          );
        }

        console.log(theme.muted("─".repeat(100)));
        console.log(theme.muted(`  ${entries.length} entries shown\n`));
      } catch (err) {
        console.error(`Error: ${String(err)}`);
        process.exitCode = 1;
      }
    },
  );

  // ─── cortex audit stats ──────────────────
  const statsCmd = audit
    .command("stats")
    .description("Show audit log statistics")
    .option("--json", "Output as JSON");

  addGatewayClientOptions(statsCmd);

  statsCmd.action(async (opts: GatewayRpcOpts & { json?: boolean }) => {
    try {
      const result = await callGatewayFromCli("audit.stats", opts);
      const stats = result as {
        total?: number;
        byAction?: Record<string, number>;
        byActor?: Record<string, number>;
        failures?: number;
        oldestTimestamp?: string | null;
        newestTimestamp?: string | null;
      };

      if (opts.json) {
        console.log(JSON.stringify(stats, null, 2));
        return;
      }

      console.log(`\n  ${colorize("bold", "Audit Log Statistics")}`);
      console.log(theme.muted("  " + "─".repeat(40)));
      console.log(`  Total entries:   ${theme.accent(String(stats.total ?? 0))}`);
      console.log(
        `  Failures:        ${stats.failures ? theme.error(String(stats.failures)) : theme.success("0")}`,
      );
      if (stats.oldestTimestamp) {
        console.log(`  Oldest:          ${formatTimestamp(stats.oldestTimestamp)}`);
      }
      if (stats.newestTimestamp) {
        console.log(`  Newest:          ${formatTimestamp(stats.newestTimestamp)}`);
      }

      const byAction = stats.byAction ?? {};
      if (Object.keys(byAction).length > 0) {
        console.log(`\n  ${colorize("bold", "By Action:")}`);
        for (const [action, count] of Object.entries(byAction).slice(0, 15)) {
          console.log(`    ${action.padEnd(30)} ${theme.accent(String(count))}`);
        }
      }

      const byActor = stats.byActor ?? {};
      if (Object.keys(byActor).length > 0) {
        console.log(`\n  ${colorize("bold", "By Actor:")}`);
        for (const [actor, count] of Object.entries(byActor).slice(0, 10)) {
          console.log(`    ${truncate(actor, 30).padEnd(30)} ${theme.accent(String(count))}`);
        }
      }

      console.log("");
    } catch (err) {
      console.error(`Error: ${String(err)}`);
      process.exitCode = 1;
    }
  });

  // ─── cortex audit prune ──────────────────
  const pruneCmd = audit
    .command("prune")
    .description("Delete old audit log entries")
    .option("--older-than <days>", "Delete entries older than N days", "90");

  addGatewayClientOptions(pruneCmd);

  pruneCmd.action(async (opts: GatewayRpcOpts & { olderThan?: string }) => {
    try {
      const days = parseInt(opts.olderThan ?? "90", 10);
      if (isNaN(days) || days < 1) {
        console.error("--older-than must be a positive number of days");
        process.exitCode = 1;
        return;
      }

      const result = await callGatewayFromCli("audit.prune", opts, { olderThanDays: days });
      const data = result as { deleted?: number; olderThanDays?: number };

      console.log(
        `Pruned ${theme.accent(String(data.deleted ?? 0))} audit entries older than ${days} days.`,
      );
    } catch (err) {
      console.error(`Error: ${String(err)}`);
      process.exitCode = 1;
    }
  });
}
