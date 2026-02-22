/**
 * CLI: Token management (create, list, revoke)
 * Supports both local (direct SQLite) and remote (gateway RPC) modes.
 */
import type { Command } from "commander";
import { buildGatewayConnectionDetails, callGateway } from "../gateway/call.js";
import { isLoopbackHost } from "../gateway/net.js";
import { defaultRuntime } from "../runtime.js";
import { ROLES } from "../security/roles.js";
import { TokenStore } from "../security/tokens.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import { withProgress } from "./progress.js";

type TokenOpts = {
  url?: string;
  token?: string;
  password?: string;
  timeout?: string;
  json?: boolean;
  name?: string;
  role?: string;
  expires?: string;
  local?: boolean;
};

const tokenCallOpts = (cmd: Command, defaults?: { timeoutMs?: number }) =>
  cmd
    .option("--url <url>", "Gateway WebSocket URL")
    .option("--token <token>", "Gateway token (if required)")
    .option("--password <password>", "Gateway password")
    .option("--timeout <ms>", "Timeout in ms", String(defaults?.timeoutMs ?? 10_000))
    .option("--json", "Output JSON", false)
    .option("--local", "Use local SQLite directly (skip gateway RPC)", false);

function isLocal(opts: TokenOpts): boolean {
  if (opts.local) {
    return true;
  }
  // If no explicit URL and we're on loopback, prefer local
  if (opts.url) {
    return false;
  }
  try {
    const connection = buildGatewayConnectionDetails();
    return (
      connection.urlSource === "local loopback" && isLoopbackHost(new URL(connection.url).hostname)
    );
  } catch {
    return true;
  }
}

async function callGatewayCli(method: string, opts: TokenOpts, params?: unknown) {
  return withProgress(
    { label: `Tokens ${method}`, indeterminate: true, enabled: opts.json !== true },
    async () =>
      await callGateway({
        url: opts.url,
        token: opts.token,
        password: opts.password,
        method,
        params,
        timeoutMs: Number(opts.timeout ?? 10_000),
        clientName: GATEWAY_CLIENT_NAMES.CLI,
        mode: GATEWAY_CLIENT_MODES.CLI,
      }),
  );
}

export function registerTokensCli(program: Command) {
  const tokens = program.command("tokens").description("Manage API tokens (create, list, revoke)");

  tokenCallOpts(
    tokens
      .command("create")
      .description("Create a new API token")
      .requiredOption("--name <name>", "Token name (descriptive label)")
      .requiredOption("--role <role>", `Token role (${ROLES.join(", ")})`)
      .option("--expires <duration>", 'Expiry duration (e.g. "30d", "24h") or ISO date')
      .action(async (opts: TokenOpts) => {
        const name = String(opts.name ?? "").trim();
        const role = String(opts.role ?? "").trim();
        const expires = opts.expires?.trim();

        if (!name) {
          defaultRuntime.error("--name is required");
          defaultRuntime.exit(1);
          return;
        }
        if (!role) {
          defaultRuntime.error("--role is required");
          defaultRuntime.exit(1);
          return;
        }

        if (isLocal(opts)) {
          const store = TokenStore.init();
          try {
            const result = store.create({ name, role, expires });
            if (opts.json) {
              defaultRuntime.log(JSON.stringify(result, null, 2));
            } else {
              defaultRuntime.log("");
              defaultRuntime.log(
                `${theme.success("✓ Token created")} ${theme.muted(`(${result.prefix}…)`)}`,
              );
              defaultRuntime.log("");
              defaultRuntime.log(`  ${theme.heading("Token:")}  ${theme.command(result.token)}`);
              defaultRuntime.log(`  ${theme.heading("Name:")}   ${result.name}`);
              defaultRuntime.log(`  ${theme.heading("Role:")}   ${result.role}`);
              if (result.expires_at) {
                defaultRuntime.log(`  ${theme.heading("Expires:")} ${result.expires_at}`);
              }
              defaultRuntime.log("");
              defaultRuntime.log(theme.warn("⚠ Save this token now — it cannot be shown again."));
            }
          } catch (err) {
            defaultRuntime.error(String(err));
            defaultRuntime.exit(1);
          }
        } else {
          try {
            const result = await callGatewayCli("tokens.create", opts, { name, role, expires });
            if (opts.json) {
              defaultRuntime.log(JSON.stringify(result, null, 2));
            } else {
              const r = result as {
                prefix?: string;
                token?: string;
                name?: string;
                role?: string;
                expires_at?: string;
              };
              defaultRuntime.log("");
              defaultRuntime.log(
                `${theme.success("✓ Token created")} ${theme.muted(`(${String(r.prefix ?? "")}…)`)}`,
              );
              defaultRuntime.log("");
              defaultRuntime.log(
                `  ${theme.heading("Token:")}  ${theme.command(String(r.token ?? ""))}`,
              );
              defaultRuntime.log(`  ${theme.heading("Name:")}   ${String(r.name ?? "")}`);
              defaultRuntime.log(`  ${theme.heading("Role:")}   ${String(r.role ?? "")}`);
              if (r.expires_at) {
                defaultRuntime.log(`  ${theme.heading("Expires:")} ${String(r.expires_at)}`);
              }
              defaultRuntime.log("");
              defaultRuntime.log(theme.warn("⚠ Save this token now — it cannot be shown again."));
            }
          } catch (err) {
            defaultRuntime.error(String(err));
            defaultRuntime.exit(1);
          }
        }
      }),
  );

  tokenCallOpts(
    tokens
      .command("list")
      .description("List all API tokens")
      .action(async (opts: TokenOpts) => {
        if (isLocal(opts)) {
          const store = TokenStore.init();
          const list = store.list();
          if (opts.json) {
            defaultRuntime.log(JSON.stringify(list, null, 2));
            return;
          }
          if (list.length === 0) {
            defaultRuntime.log(theme.muted("No API tokens found."));
            return;
          }
          const tableWidth = Math.max(60, (process.stdout.columns ?? 120) - 1);
          defaultRuntime.log(`${theme.heading("API Tokens")} ${theme.muted(`(${list.length})`)}`);
          defaultRuntime.log(
            renderTable({
              width: tableWidth,
              columns: [
                { key: "ID", header: "ID", minWidth: 4 },
                { key: "Name", header: "Name", minWidth: 10, flex: true },
                { key: "Role", header: "Role", minWidth: 10 },
                { key: "Expires", header: "Expires", minWidth: 12 },
                { key: "Status", header: "Status", minWidth: 8 },
                { key: "Last Used", header: "Last Used", minWidth: 14 },
              ],
              rows: list.map((t) => ({
                ID: String(t.id),
                Name: t.name,
                Role: t.role,
                Expires: t.expires_at ? new Date(t.expires_at).toLocaleDateString() : "never",
                Status: t.revoked ? "revoked" : "active",
                "Last Used": t.last_used_at
                  ? new Date(t.last_used_at).toLocaleDateString()
                  : "never",
              })),
            }).trimEnd(),
          );
        } else {
          try {
            const result = await callGatewayCli("tokens.list", opts, {});
            const list = Array.isArray(result) ? result : [];
            if (opts.json) {
              defaultRuntime.log(JSON.stringify(list, null, 2));
              return;
            }
            if (list.length === 0) {
              defaultRuntime.log(theme.muted("No API tokens found."));
              return;
            }
            const tableWidth = Math.max(60, (process.stdout.columns ?? 120) - 1);
            defaultRuntime.log(`${theme.heading("API Tokens")} ${theme.muted(`(${list.length})`)}`);
            defaultRuntime.log(
              renderTable({
                width: tableWidth,
                columns: [
                  { key: "ID", header: "ID", minWidth: 4 },
                  { key: "Name", header: "Name", minWidth: 10, flex: true },
                  { key: "Role", header: "Role", minWidth: 10 },
                  { key: "Expires", header: "Expires", minWidth: 12 },
                  { key: "Status", header: "Status", minWidth: 8 },
                ],
                rows: list.map(
                  (t: {
                    id?: number;
                    name?: string;
                    role?: string;
                    expires_at?: string;
                    revoked?: boolean;
                  }) => ({
                    ID: String(t.id ?? ""),
                    Name: String(t.name ?? ""),
                    Role: String(t.role ?? ""),
                    Expires: t.expires_at ? new Date(t.expires_at).toLocaleDateString() : "never",
                    Status: t.revoked ? "revoked" : "active",
                  }),
                ),
              }).trimEnd(),
            );
          } catch (err) {
            defaultRuntime.error(String(err));
            defaultRuntime.exit(1);
          }
        }
      }),
  );

  tokenCallOpts(
    tokens
      .command("revoke")
      .description("Revoke an API token by name, ID, or hash prefix")
      .argument("<identifier>", "Token name, numeric ID, or hash prefix")
      .action(async (identifier: string, opts: TokenOpts) => {
        const trimmed = identifier.trim();
        if (!trimmed) {
          defaultRuntime.error("Token identifier is required");
          defaultRuntime.exit(1);
          return;
        }

        if (isLocal(opts)) {
          const store = TokenStore.init();
          try {
            const result = store.revoke(trimmed);
            if (opts.json) {
              defaultRuntime.log(JSON.stringify(result, null, 2));
            } else if (result.revoked) {
              defaultRuntime.log(
                `${theme.warn("✓ Revoked")} ${theme.command(result.name ?? trimmed)}`,
              );
            } else if (result.name) {
              defaultRuntime.log(theme.muted(`Token "${result.name}" is already revoked.`));
            } else {
              defaultRuntime.error(`No token found matching "${trimmed}"`);
              defaultRuntime.exit(1);
            }
          } catch (err) {
            defaultRuntime.error(String(err));
            defaultRuntime.exit(1);
          }
        } else {
          try {
            const result = (await callGatewayCli("tokens.revoke", opts, {
              identifier: trimmed,
            })) as { revoked?: boolean; name?: string };
            if (opts.json) {
              defaultRuntime.log(JSON.stringify(result, null, 2));
            } else if (result.revoked) {
              defaultRuntime.log(
                `${theme.warn("✓ Revoked")} ${theme.command(String(result.name ?? trimmed))}`,
              );
            } else {
              defaultRuntime.error(`No token found matching "${trimmed}"`);
              defaultRuntime.exit(1);
            }
          } catch (err) {
            defaultRuntime.error(String(err));
            defaultRuntime.exit(1);
          }
        }
      }),
  );
}
