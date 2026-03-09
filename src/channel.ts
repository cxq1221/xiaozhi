import type { ChannelPlugin } from "openclaw/plugin-sdk";
import { xiaozhiOnboardingAdapter } from "./onboarding.js";

const XiaozhiConfigSchema = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean" },
      xiaozhiServerUrl: { type: "string", pattern: "^https?://" },
      deviceId: { type: "string", minLength: 1 },
      timeout: { type: "integer", minimum: 1, maximum: 300 },
    },
  },
} as const;

export const xiaozhiPlugin: ChannelPlugin = {
  id: "xiaozhi",
  meta: {
    id: "xiaozhi",
    label: "小智",
    selectionLabel: "小智 ESP32",
    detailLabel: "小智",
    docsPath: "/channels/xiaozhi",
    docsLabel: "xiaozhi",
    blurb: "小智 ESP32 语音助手",
    systemImage: "person.wave.2",
    selectionDocsPrefix: "",
    selectionDocsOmitLabel: false,
    selectionExtras: [],
  },
  reload: { configPrefixes: ["channels.xiaozhi"] },
  configSchema: XiaozhiConfigSchema,
  config: {
    listAccountIds: () => ["default"],
    resolveAccount: (cfg) => ({
      accountId: "default",
      name: "xiaozhi",
      enabled: cfg.channels?.xiaozhi?.enabled ?? false,
      config: {
        xiaozhiServerUrl: cfg.channels?.xiaozhi?.xiaozhiServerUrl ?? "http://localhost:8003",
        deviceId: cfg.channels?.xiaozhi?.deviceId ?? "b0:a6:04:55:0f:d0",
        timeout: cfg.channels?.xiaozhi?.timeout ?? 30,
      },
    }),
    defaultAccountId: () => "default",
    setAccountEnabled: () => ({ changed: false }),
    deleteAccount: () => ({ changed: false }),
    isConfigured: (account) => Boolean(account.config.xiaozhiServerUrl),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.config.xiaozhiServerUrl),
    }),
  },
  setup: {
    resolveAccountId: () => "default",
    applyAccountConfig: ({ cfg }) => ({
      ...cfg,
      channels: {
        ...cfg.channels,
        xiaozhi: {
          ...cfg.channels?.xiaozhi,
          enabled: true,
        },
      },
    }),
  },
  onboarding: xiaozhiOnboardingAdapter,
  capabilities: {
    chatTypes: ["direct"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: false,
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text) => [text],
    chunkerMode: "text",
    textChunkLimit: 1000,
    sendText: async ({ to, text }) => {
      // 暂不实现反向发送
      return { channel: "xiaozhi", ok: false };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const { monitorXiaozhiProvider } = await import("./monitor.js");
      const { xiaozhiServerUrl, deviceId, timeout } = ctx.account.config;

      ctx.log?.info(
        `[xiaozhi] starting provider (url=${xiaozhiServerUrl}, deviceId=${deviceId}, timeout=${timeout}s)`,
      );

      return monitorXiaozhiProvider({
        config: ctx.cfg as any,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        serverUrl: xiaozhiServerUrl,
        deviceId,
        timeoutSeconds: timeout,
        accountId: ctx.accountId,
      });
    },
  },
};
