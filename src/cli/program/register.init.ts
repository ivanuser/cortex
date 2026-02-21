import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { colorize, theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";

export function registerInitCommand(program: Command) {
  const init = program
    .command("init")
    .description("Initialize Cortex as a gateway or node")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["cortex init gateway", "Set up a new Cortex gateway with UI and agent runtime."],
          [
            "cortex init node --gateway wss://my-gateway.com",
            "Join an existing gateway as a node.",
          ],
          [
            "cortex init node --gateway 192.168.1.242 --port 18789",
            "Join a LAN gateway as a node.",
          ],
        ])}\n`,
    );

  init
    .command("gateway")
    .description("Initialize a new Cortex gateway (agent runtime + web UI)")
    .option("--port <port>", "Gateway port (default: 18789)")
    .option("--token <token>", "Set gateway auth token")
    .option("--workspace <dir>", "Agent workspace directory")
    .option("--non-interactive", "Skip prompts, use defaults", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const runtime = defaultRuntime;

        runtime.log("");
        runtime.log(colorize("cyan", "🦞 Cortex Gateway Setup"));
        runtime.log(colorize("dim", "━".repeat(40)));
        runtime.log("");

        // Step 1: Run setup (creates config + workspace)
        const { setupCommand } = await import("../../commands/setup.js");
        await setupCommand({ workspace: opts.workspace as string | undefined }, runtime);

        // Step 2: Install gateway service
        runtime.log("");
        runtime.log(colorize("cyan", "Installing gateway service..."));
        const { runDaemonInstall } = await import("../daemon-cli/runners.js");
        await runDaemonInstall({
          port: opts.port,
          token: opts.token,
          force: false,
          json: false,
        });

        // Step 3: Start the gateway
        runtime.log("");
        runtime.log(colorize("cyan", "Starting gateway..."));
        const { runDaemonStart } = await import("../daemon-cli/runners.js");
        await runDaemonStart({ json: false });

        // Step 4: Summary
        runtime.log("");
        runtime.log(colorize("cyan", "━".repeat(40)));
        runtime.log(colorize("cyan", "✓ Cortex gateway is running!"));
        runtime.log("");
        runtime.log(`  ${colorize("dim", "Web UI:")}     http://localhost:${opts.port ?? "18789"}`);
        runtime.log(`  ${colorize("dim", "Status:")}     cortex gateway status`);
        runtime.log(`  ${colorize("dim", "Add nodes:")} cortex init node --gateway <this-machine>`);
        runtime.log("");
      });
    });

  init
    .command("node")
    .description("Join an existing Cortex gateway as a headless node")
    .option("--gateway <url>", "Gateway URL (e.g. wss://my-gateway.com or 192.168.1.242)")
    .option("--port <port>", "Gateway port (default: 18789, ignored if gateway is a full URL)")
    .option("--tls", "Use TLS for the gateway connection", false)
    .option("--tls-fingerprint <sha256>", "Expected TLS certificate fingerprint")
    .option("--display-name <name>", "Node display name (default: hostname)")
    .option("--non-interactive", "Skip prompts", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const runtime = defaultRuntime;
        const os = await import("node:os");
        const readline = await import("node:readline");

        runtime.log("");
        runtime.log(colorize("cyan", "🦞 Cortex Node Setup"));
        runtime.log(colorize("dim", "━".repeat(40)));
        runtime.log("");

        let gatewayHost = opts.gateway as string | undefined;
        let gatewayPort = opts.port ? Number(opts.port) : 18789;
        let useTls = Boolean(opts.tls) || Boolean(opts.tlsFingerprint);
        let displayName = (opts.displayName as string | undefined) ?? os.hostname();

        // Interactive prompts if not provided
        if (!gatewayHost && !opts.nonInteractive) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const ask = (q: string): Promise<string> =>
            new Promise((resolve) => rl.question(q, resolve));

          gatewayHost = await ask(`${colorize("cyan", "?")} Gateway URL or IP: `);
          if (!gatewayHost.trim()) {
            runtime.error("Gateway URL is required.");
            rl.close();
            runtime.exit(1);
            return;
          }

          const portStr = await ask(
            `${colorize("cyan", "?")} Gateway port ${colorize("dim", "(18789)")}: `,
          );
          if (portStr.trim()) {
            gatewayPort = Number(portStr.trim());
          }

          const nameStr = await ask(
            `${colorize("cyan", "?")} Node display name ${colorize("dim", `(${displayName})`)}: `,
          );
          if (nameStr.trim()) {
            displayName = nameStr.trim();
          }

          rl.close();
        }

        if (!gatewayHost) {
          runtime.error("Gateway URL is required. Use --gateway <url>");
          runtime.exit(1);
          return;
        }

        // Parse URL if full URL provided
        if (gatewayHost.startsWith("wss://") || gatewayHost.startsWith("ws://")) {
          try {
            const parsed = new URL(gatewayHost);
            useTls = parsed.protocol === "wss:";
            gatewayHost = parsed.hostname;
            if (parsed.port) {
              gatewayPort = Number(parsed.port);
            } else {
              gatewayPort = useTls ? 443 : 18789;
            }
          } catch {
            // Use as-is
          }
        } else if (gatewayHost.startsWith("https://") || gatewayHost.startsWith("http://")) {
          try {
            const parsed = new URL(gatewayHost);
            useTls = parsed.protocol === "https:";
            gatewayHost = parsed.hostname;
            if (parsed.port) {
              gatewayPort = Number(parsed.port);
            } else {
              gatewayPort = useTls ? 443 : 18789;
            }
          } catch {
            // Use as-is
          }
        }

        runtime.log(
          `  ${colorize("dim", "Gateway:")}  ${gatewayHost}:${gatewayPort}${useTls ? " (TLS)" : ""}`,
        );
        runtime.log(`  ${colorize("dim", "Name:")}     ${displayName}`);
        runtime.log("");

        // Step 1: Install node service
        runtime.log(colorize("cyan", "Installing node service..."));
        const { runNodeDaemonInstall } = await import("../node-cli/daemon.js");
        await runNodeDaemonInstall({
          host: gatewayHost,
          port: String(gatewayPort),
          tls: useTls,
          tlsFingerprint: opts.tlsFingerprint,
          displayName,
          force: false,
          json: false,
        });

        // Step 2: Summary
        runtime.log("");
        runtime.log(colorize("cyan", "━".repeat(40)));
        runtime.log(colorize("cyan", "✓ Node service installed and started!"));
        runtime.log("");
        runtime.log(
          `  The node will appear as ${colorize("cyan", `"${displayName}"`)} on your gateway.`,
        );
        runtime.log(
          `  ${colorize("dim", "Approve it with:")} cortex nodes approve (on the gateway machine)`,
        );
        runtime.log(`  ${colorize("dim", "Node status:")}     cortex node status`);
        runtime.log(
          `  ${colorize("dim", "Node logs:")}       journalctl --user -u openclaw-node -f`,
        );
        runtime.log("");
      });
    });
}
