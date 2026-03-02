import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { formatErrorMessage, sleep } from "openclaw/plugin-sdk";
import { getXiaozhiRuntime } from "./runtime.js";

export type MonitorXiaozhiOpts = {
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  serverUrl: string;
  deviceId: string;
  timeoutSeconds?: number;
  accountId?: string;
};

export async function monitorXiaozhiProvider(opts: MonitorXiaozhiOpts): Promise<void> {
  const cfg = opts.config;
  if (!cfg) {
    throw new Error("Config is required for Xiaozhi monitor");
  }

  const core = getXiaozhiRuntime();
  const log = opts.runtime?.log ?? console.log;
  const error = opts.runtime?.error ?? console.error;

  const timeoutSeconds = opts.timeoutSeconds ?? 30;
  let lastUpdateId = 0;

  log?.(
    `[xiaozhi] monitor starting (serverUrl=${opts.serverUrl}, deviceId=${opts.deviceId}, timeout=${timeoutSeconds}s)`,
  );

  while (!opts.abortSignal?.aborted) {
    try {
      const url =
        `${opts.serverUrl}/xiaozhi/updates` +
        `?device_id=${encodeURIComponent(opts.deviceId)}` +
        `&offset=${lastUpdateId}&timeout=${timeoutSeconds}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), (timeoutSeconds + 5) * 1000);

      const resp = await fetch(url, {
        method: "GET",
        signal: controller.signal as any,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        error?.(`[xiaozhi] HTTP ${resp.status} while polling updates from ${opts.serverUrl}`);
        await sleep(3000);
        continue;
      }

      const data = (await resp.json()) as { ok: boolean; result: any[] };
      if (!data.ok || !Array.isArray(data.result)) {
        continue;
      }

      for (const update of data.result) {
        const id = update.id as number;
        const rawText = (update.text as string | undefined) ?? "";
        const text = rawText.trim();
        const devId = (update.device_id as string | undefined) || opts.deviceId;

        if (!text) {
          continue;
        }

        if (typeof id === "number" && id > lastUpdateId) {
          lastUpdateId = id;
        }

        log?.(`[xiaozhi] received message (id=${id}, deviceId=${devId}): ${text}`);

        await handleXiaozhiMessage({
          cfg,
          coreRuntime: core,
          runtime: opts.runtime,
          serverUrl: opts.serverUrl,
          deviceId: devId,
          body: text,
          accountId: opts.accountId,
        });
      }
    } catch (err) {
      if (opts.abortSignal?.aborted) {
        break;
      }
      error?.(`[xiaozhi] monitor error: ${formatErrorMessage(err)}`);
      await sleep(3000);
    }
  }

  log?.("[xiaozhi] monitor stopped");
}

async function handleXiaozhiMessage(params: {
  cfg: ClawdbotConfig;
  coreRuntime: ReturnType<typeof getXiaozhiRuntime>;
  runtime?: RuntimeEnv;
  serverUrl: string;
  deviceId: string;
  body: string;
  accountId?: string;
}) {
  const { cfg, coreRuntime, runtime, serverUrl, deviceId, body, accountId } = params;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  // 1. 路由到对应的 agent / 会话
  const route = coreRuntime.channel.routing.resolveAgentRoute({
    cfg,
    channel: "xiaozhi",
    accountId,
    peer: {
      kind: "direct",
      id: deviceId,
    },
  });

  // 2. 构造最小可用的消息上下文
  const ctxPayload = coreRuntime.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: body,
    RawBody: body,
    CommandBody: body,
    From: deviceId,
    To: route.sessionKey,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    Provider: "xiaozhi" as const,
    Surface: "xiaozhi" as const,
    Timestamp: Date.now(),
    CommandAuthorized: true,
    OriginatingChannel: "xiaozhi" as const,
    OriginatingTo: deviceId,
  });

  log?.(
    `[xiaozhi] dispatching to agent (session=${route.sessionKey}, accountId=${route.accountId})`,
  );

  // 3. 创建回复 dispatcher：将 Agent 的回复 POST 回 xiaozhi-server（设备播报/展示）
  const { dispatcher, replyOptions, markDispatchIdle } =
    coreRuntime.channel.reply.createReplyDispatcherWithTyping({
      humanDelay: coreRuntime.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
      deliver: async (payload) => {
        const text = payload.text?.trim() ?? "";
        if (!text) return;
        log?.(`[xiaozhi] final reply to ${deviceId}: ${text.slice(0, 200)}`);
        try {
          const url = `${serverUrl.replace(/\/$/, "")}/xiaozhi/reply`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_id: deviceId, text }),
          });
          if (!res.ok) {
            error?.(
              `[xiaozhi] reply POST ${res.status} to ${url}: ${await res.text().catch(() => "")}`,
            );
          }
        } catch (err) {
          error?.(`[xiaozhi] reply delivery failed: ${String(err)}`);
        }
      },
      onError: (err, info) => {
        error?.(`[xiaozhi] ${info.kind} reply failed: ${String(err)}`);
      },
    });

  // 4. 调用核心的自动回复管线，让 Agent 跑一整轮
  await coreRuntime.channel.reply.dispatchReplyFromConfig({
    ctx: ctxPayload,
    cfg,
    dispatcher,
    replyOptions,
  });

  markDispatchIdle();
}
