/**
 * CLI: Invite link management (create, list, revoke)
 * Supports both local (direct SQLite) and remote (gateway RPC) modes.
 */
import type { Command } from "commander";
import { buildGatewayConnectionDetails, callGateway } from "../gateway/call.js";
import { isLoopbackHost } from "../gateway/net.js";
import { defaultRuntime } from "../runtime.js";
import { InviteStore } from "../security/invites.js";
import { ROLES } from "../security/roles.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import { withProgress } from "./progress.js";

type InviteOpts = {
  url?: string;
  token?: string;
  password?: string;
  timeout?: string;
  json?: boolean;
  role?: string;
  expires?: string;
  uses?: string;
  local?: boolean;
};

const inviteCallOpts = (cmd: Command, defaults?: { timeoutMs?: number }) =>
  cmd
    .option("--url <url>", "Gateway WebSocket URL")
    .option("--token <token>", "Gateway token (if required)")
    .option("--password <password>", "Gateway password")
    .option("--timeout <ms>", "Timeout in ms", String(defaults?.timeoutMs ?? 10_000))
    .option("--json", "Output JSON", false)
    .option("--local", "Use local SQLite directly (skip gateway RPC)", false);

function isLocal(opts: InviteOpts): boolean {
  if (opts.local) {
    return true;
  }
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

async function callGatewayCli(method: string, opts: InviteOpts, params?: unknown) {
  return withProgress(
    { label: `Invites ${method}`, indeterminate: true, enabled: opts.json !== true },
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

export function registerInviteCli(program: Command) {
  const invite = program
    .command("invite")
    .description("Manage invite links (create, list, revoke)");

  inviteCallOpts(
    invite
      .command("create")
      .description("Create a new invite link")
      .requiredOption("--role <role>", `Role for invited devices (${ROLES.join(", ")})`)
      .option("--expires <duration>", 'Expiry duration (e.g. "7d", "24h", "1h")')
      .option("--uses <count>", "Maximum number of uses")
      .action(async (opts: InviteOpts) => {
        const role = String(opts.role ?? "").trim();
        const expiresIn = opts.expires?.trim();
        const maxUses = opts.uses ? parseInt(opts.uses, 10) : undefined;

        if (!role) {
          defaultRuntime.error("--role is required");
          defaultRuntime.exit(1);
          return;
        }

        if (isLocal(opts)) {
          try {
            const store = InviteStore.init();
            const result = store.createInvite({ role, expiresIn, maxUses });
            if (opts.json) {
              defaultRuntime.log(JSON.stringify(result, null, 2));
            } else {
              defaultRuntime.log("");
              defaultRuntime.log(
                `${theme.success("✓ Invite created")} ${theme.muted(`(role: ${result.role})`)}`,
              );
              defaultRuntime.log("");
              defaultRuntime.log(`  ${theme.heading("Code:")}    ${theme.command(result.code)}`);
              defaultRuntime.log(`  ${theme.heading("Role:")}    ${result.role}`);
              if (result.expires_at) {
                defaultRuntime.log(`  ${theme.heading("Expires:")} ${result.expires_at}`);
              }
              if (result.max_uses != null) {
                defaultRuntime.log(`  ${theme.heading("Max uses:")} ${result.max_uses}`);
              }
              defaultRuntime.log("");
              defaultRuntime.log(
                theme.muted(
                  "Share this code with the person connecting. They can use it in the setup wizard or append ?invite=CODE to the UI URL.",
                ),
              );
            }
          } catch (err) {
            defaultRuntime.error(String(err));
            defaultRuntime.exit(1);
          }
        } else {
          try {
            const result = await callGatewayCli("invite.create", opts, {
              role,
              expiresIn,
              maxUses,
            });
            if (opts.json) {
              defaultRuntime.log(JSON.stringify(result, null, 2));
            } else {
              const r = result as {
                code?: string;
                role?: string;
                expires_at?: string;
                max_uses?: number;
              };
              defaultRuntime.log("");
              defaultRuntime.log(
                `${theme.success("✓ Invite created")} ${theme.muted(`(role: ${String(r.role ?? "")})`)}`,
              );
              defaultRuntime.log("");
              defaultRuntime.log(
                `  ${theme.heading("Code:")}    ${theme.command(String(r.code ?? ""))}`,
              );
              defaultRuntime.log(`  ${theme.heading("Role:")}    ${String(r.role ?? "")}`);
              if (r.expires_at) {
                defaultRuntime.log(`  ${theme.heading("Expires:")} ${String(r.expires_at)}`);
              }
              if (r.max_uses != null) {
                defaultRuntime.log(`  ${theme.heading("Max uses:")} ${r.max_uses}`);
              }
              defaultRuntime.log("");
              defaultRuntime.log(theme.muted("Share this code with the person connecting."));
            }
          } catch (err) {
            defaultRuntime.error(String(err));
            defaultRuntime.exit(1);
          }
        }
      }),
  );

  inviteCallOpts(
    invite
      .command("list")
      .description("List all invite links")
      .action(async (opts: InviteOpts) => {
        if (isLocal(opts)) {
          const store = InviteStore.init();
          const list = store.listInvites();
          if (opts.json) {
            defaultRuntime.log(JSON.stringify(list, null, 2));
            return;
          }
          if (list.length === 0) {
            defaultRuntime.log(theme.muted("No invite links found."));
            return;
          }
          const tableWidth = Math.max(60, (process.stdout.columns ?? 120) - 1);
          defaultRuntime.log(`${theme.heading("Invite Links")} ${theme.muted(`(${list.length})`)}`);
          defaultRuntime.log(
            renderTable({
              width: tableWidth,
              columns: [
                { key: "Code", header: "Code", minWidth: 12 },
                { key: "Role", header: "Role", minWidth: 10 },
                { key: "Uses", header: "Uses", minWidth: 8 },
                { key: "Expires", header: "Expires", minWidth: 12 },
                { key: "Status", header: "Status", minWidth: 8 },
              ],
              rows: list.map((inv) => ({
                Code: inv.code.slice(0, 12) + "…",
                Role: inv.role,
                Uses:
                  inv.max_uses != null
                    ? `${inv.used_count}/${inv.max_uses}`
                    : String(inv.used_count),
                Expires: inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "never",
                Status: inv.revoked ? "revoked" : inv.valid ? "active" : "expired",
              })),
            }).trimEnd(),
          );
        } else {
          try {
            const result = await callGatewayCli("invite.list", opts, {});
            const list = Array.isArray(result) ? result : [];
            if (opts.json) {
              defaultRuntime.log(JSON.stringify(list, null, 2));
              return;
            }
            if (list.length === 0) {
              defaultRuntime.log(theme.muted("No invite links found."));
              return;
            }
            const tableWidth = Math.max(60, (process.stdout.columns ?? 120) - 1);
            defaultRuntime.log(
              `${theme.heading("Invite Links")} ${theme.muted(`(${list.length})`)}`,
            );
            defaultRuntime.log(
              renderTable({
                width: tableWidth,
                columns: [
                  { key: "Code", header: "Code", minWidth: 12 },
                  { key: "Role", header: "Role", minWidth: 10 },
                  { key: "Uses", header: "Uses", minWidth: 8 },
                  { key: "Expires", header: "Expires", minWidth: 12 },
                  { key: "Status", header: "Status", minWidth: 8 },
                ],
                rows: list.map(
                  (inv: {
                    code?: string;
                    role?: string;
                    max_uses?: number;
                    used_count?: number;
                    expires_at?: string;
                    revoked?: boolean;
                    valid?: boolean;
                  }) => ({
                    Code: String(inv.code ?? "").slice(0, 12) + "…",
                    Role: String(inv.role ?? ""),
                    Uses:
                      inv.max_uses != null
                        ? `${inv.used_count ?? 0}/${inv.max_uses}`
                        : String(inv.used_count ?? 0),
                    Expires: inv.expires_at
                      ? new Date(inv.expires_at).toLocaleDateString()
                      : "never",
                    Status: inv.revoked ? "revoked" : inv.valid ? "active" : "expired",
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

  inviteCallOpts(
    invite
      .command("revoke")
      .description("Revoke an invite link by code")
      .argument("<code>", "Invite code to revoke")
      .action(async (code: string, opts: InviteOpts) => {
        const trimmed = code.trim();
        if (!trimmed) {
          defaultRuntime.error("Invite code is required");
          defaultRuntime.exit(1);
          return;
        }

        if (isLocal(opts)) {
          try {
            const store = InviteStore.init();
            const result = store.revokeInvite(trimmed);
            if (opts.json) {
              defaultRuntime.log(JSON.stringify(result, null, 2));
            } else if (result.revoked) {
              defaultRuntime.log(
                `${theme.warn("✓ Revoked")} invite ${theme.command(trimmed.slice(0, 12) + "…")}`,
              );
            } else {
              defaultRuntime.error(
                `Invite not found or already revoked: "${trimmed.slice(0, 12)}…"`,
              );
              defaultRuntime.exit(1);
            }
          } catch (err) {
            defaultRuntime.error(String(err));
            defaultRuntime.exit(1);
          }
        } else {
          try {
            const result = (await callGatewayCli("invite.revoke", opts, {
              code: trimmed,
            })) as { revoked?: boolean };
            if (opts.json) {
              defaultRuntime.log(JSON.stringify(result, null, 2));
            } else if (result.revoked) {
              defaultRuntime.log(
                `${theme.warn("✓ Revoked")} invite ${theme.command(trimmed.slice(0, 12) + "…")}`,
              );
            } else {
              defaultRuntime.error(
                `Invite not found or already revoked: "${trimmed.slice(0, 12)}…"`,
              );
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
