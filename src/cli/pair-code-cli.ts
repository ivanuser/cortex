/**
 * CLI: Generate a 6-digit pairing code
 */
import type { Command } from "commander";
import { buildGatewayConnectionDetails, callGateway } from "../gateway/call.js";
import { isLoopbackHost } from "../gateway/net.js";
import { defaultRuntime } from "../runtime.js";
import { generatePairingCode } from "../security/pairing-codes.js";
import { ROLES } from "../security/roles.js";
import { theme } from "../terminal/theme.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import { withProgress } from "./progress.js";

type PairCodeOpts = {
  url?: string;
  token?: string;
  password?: string;
  timeout?: string;
  json?: boolean;
  role?: string;
  local?: boolean;
};

function isLocal(opts: PairCodeOpts): boolean {
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

export function registerPairCodeCli(program: Command) {
  const _cmd = program
    .command("pair-code")
    .description("Generate a 6-digit pairing code for quick device setup")
    .option("--role <role>", `Role for the paired device (${ROLES.join(", ")})`, "operator")
    .option("--url <url>", "Gateway WebSocket URL")
    .option("--token <token>", "Gateway token (if required)")
    .option("--password <password>", "Gateway password")
    .option("--timeout <ms>", "Timeout in ms", "10000")
    .option("--json", "Output JSON", false)
    .option("--local", "Use local in-memory store directly (skip gateway RPC)", false)
    .action(async (opts: PairCodeOpts) => {
      const role = String(opts.role ?? "operator").trim();

      if (isLocal(opts)) {
        try {
          const result = generatePairingCode(role);
          if (opts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
          } else {
            const expiresInSec = Math.round(result.expiresIn / 1000);
            defaultRuntime.log("");
            defaultRuntime.log(theme.success("✓ Pairing code generated"));
            defaultRuntime.log("");
            defaultRuntime.log(`  ${theme.heading("Code:")}    ${theme.command(result.code)}`);
            defaultRuntime.log(`  ${theme.heading("Role:")}    ${result.role}`);
            defaultRuntime.log(`  ${theme.heading("Expires:")} ${expiresInSec} seconds`);
            defaultRuntime.log("");
            defaultRuntime.log(
              theme.muted("Enter this code in the setup wizard on the connecting device."),
            );
          }
        } catch (err) {
          defaultRuntime.error(String(err));
          defaultRuntime.exit(1);
        }
      } else {
        try {
          const result = await withProgress(
            { label: "Generating pairing code", indeterminate: true, enabled: opts.json !== true },
            async () =>
              await callGateway({
                url: opts.url,
                token: opts.token,
                password: opts.password,
                method: "pair.code.generate",
                params: { role },
                timeoutMs: Number(opts.timeout ?? 10_000),
                clientName: GATEWAY_CLIENT_NAMES.CLI,
                mode: GATEWAY_CLIENT_MODES.CLI,
              }),
          );
          if (opts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
          } else {
            const expiresInSec = Math.round((result.expiresIn ?? 300000) / 1000);
            defaultRuntime.log("");
            defaultRuntime.log(theme.success("✓ Pairing code generated"));
            defaultRuntime.log("");
            const codeStr = result.code != null ? (result.code as string) : "";
            const roleStr = result.role != null ? (result.role as string) : "operator";
            defaultRuntime.log(`  ${theme.heading("Code:")}    ${theme.command(codeStr)}`);
            defaultRuntime.log(`  ${theme.heading("Role:")}    ${roleStr}`);
            defaultRuntime.log(`  ${theme.heading("Expires:")} ${String(expiresInSec)} seconds`);
            defaultRuntime.log("");
            defaultRuntime.log(
              theme.muted("Enter this code in the setup wizard on the connecting device."),
            );
          }
        } catch (err) {
          defaultRuntime.error(String(err));
          defaultRuntime.exit(1);
        }
      }
    });
}
