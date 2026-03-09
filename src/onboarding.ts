import type { ChannelOnboardingAdapter, ClawdbotConfig, WizardPrompter } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, formatDocsLink } from "openclaw/plugin-sdk";

const channel = "xiaozhi" as const;

function applyXiaozhiConfig(
  cfg: ClawdbotConfig,
  values: {
    xiaozhiServerUrl: string;
    deviceId: string;
    timeout: number;
  },
): ClawdbotConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      xiaozhi: {
        ...cfg.channels?.xiaozhi,
        enabled: true,
        xiaozhiServerUrl: values.xiaozhiServerUrl,
        deviceId: values.deviceId,
        timeout: values.timeout,
      },
    },
  };
}

function parseTimeout(raw: string, fallback = 30): number {
  const parsed = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 300) {
    return fallback;
  }
  return parsed;
}

export const xiaozhiOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const xiaozhiCfg = cfg.channels?.xiaozhi;
    const configured = Boolean(
      xiaozhiCfg?.enabled &&
      typeof xiaozhiCfg?.xiaozhiServerUrl === "string" &&
      xiaozhiCfg.xiaozhiServerUrl.trim() &&
      typeof xiaozhiCfg?.deviceId === "string" &&
      xiaozhiCfg.deviceId.trim(),
    );

    const statusLines = configured
      ? [
          `Xiaozhi: configured (${String(xiaozhiCfg?.xiaozhiServerUrl).trim()})`,
          `Device: ${String(xiaozhiCfg?.deviceId).trim()}`,
        ]
      : ["Xiaozhi: needs server URL + device ID"];

    return {
      channel,
      configured,
      statusLines,
      selectionHint: configured ? "configured" : "needs setup",
      quickstartScore: configured ? 2 : 0,
    };
  },
  configure: async ({ cfg, prompter }) => {
    const current = cfg.channels?.xiaozhi;
    await prompter.note(
      [
        "Configure Xiaozhi ESP32 channel.",
        "OpenClaw polls xiaozhi-server updates and pushes replies back.",
        `Docs: ${formatDocsLink("/channels/xiaozhi", "xiaozhi")}`,
      ].join("\n"),
      "Xiaozhi setup",
    );

    const xiaozhiServerUrl = String(
      await prompter.text({
        message: "Xiaozhi server URL",
        placeholder: "http://localhost:8003",
        initialValue: current?.xiaozhiServerUrl ?? "http://localhost:8003",
        validate: (value) => {
          const trimmed = String(value ?? "").trim();
          if (!trimmed) return "Required";
          if (!/^https?:\/\//.test(trimmed)) return "Must start with http:// or https://";
          return undefined;
        },
      }),
    ).trim();

    const deviceId = String(
      await prompter.text({
        message: "Device ID",
        placeholder: "b0:a6:04:55:0f:d0",
        initialValue: current?.deviceId ?? "b0:a6:04:55:0f:d0",
        validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
      }),
    ).trim();

    const timeoutRaw = String(
      await prompter.text({
        message: "Polling timeout (seconds)",
        placeholder: "30",
        initialValue: String(current?.timeout ?? 30),
        validate: (value) => {
          const parsed = Number.parseInt(String(value ?? "").trim(), 10);
          if (Number.isNaN(parsed) || parsed < 1 || parsed > 300) {
            return "Use an integer between 1 and 300";
          }
          return undefined;
        },
      }),
    );

    const next = applyXiaozhiConfig(cfg, {
      xiaozhiServerUrl,
      deviceId,
      timeout: parseTimeout(timeoutRaw, 30),
    });
    return { cfg: next, accountId: DEFAULT_ACCOUNT_ID };
  },
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      xiaozhi: {
        ...cfg.channels?.xiaozhi,
        enabled: false,
      },
    },
  }),
};
