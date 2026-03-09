# @openclaw/xiaozhi

OpenClaw 小智（Xiaozhi） ESP32 语音助手通道插件。

该插件将运行在 ESP32 上的 “xiaozhi-server” 与 OpenClaw 网关打通，把设备采集到的语音转文字消息转发给 OpenClaw 的 Agent，并把 Agent 的回复再推回 xiaozhi 设备进行播报或显示。

## Quickstart

```bash
# 1) 安装插件
openclaw plugins install @cxq1221/xiaozhi@0.0.4

# 2) 配置通道（手动配置）
openclaw config set channels.xiaozhi.enabled true --strict-json
openclaw config set channels.xiaozhi.xiaozhiServerUrl "http://localhost:8003"
openclaw config set channels.xiaozhi.deviceId "b0:a6:04:55:0f:d0"
openclaw config set channels.xiaozhi.timeout 30 --strict-json

# 通过交互命令行配置的话直接运行 openclaw config

# 3) 重启网关并检查
openclaw gateway restart
openclaw plugins info xiaozhi
```

说明：

- `xiaozhiServerUrl`：你的 xiaozhi-server 地址。
- `deviceId`：设备标识，需与 xiaozhi-server 侧一致。
- `timeout`：长轮询超时秒数（建议 30）。

---

## 功能简介

- **自定义通道 `xiaozhi`**
  - 在 OpenClaw 中注册名为 `xiaozhi` 的通道插件。
  - 在 UI / 配置中显示为「小智 / 小智 ESP32」。

- **长轮询接入 xiaozhi-server**
  - 轮询 `xiaozhi-server` 的 `/xiaozhi/updates` 接口拉取设备消息。
  - 自动维护 `lastUpdateId`，避免重复消费。

- **自动路由到 OpenClaw Agent**
  - 使用 OpenClaw 核心的 `channel.routing.resolveAgentRoute` 决定将消息路由到哪一个 Agent / 会话。
  - 利用 `channel.reply.*` 管线完成完整一轮自动回复。

- **将 Agent 回复回推到 xiaozhi-server**
  - 通过 POST `/xiaozhi/reply` 把最终回复文本推送给 xiaozhi-server。
  - 由 xiaozhi-server 再交给具体设备（例如 ESP32 + TTS）播报。

- **当前限制**
  - 仅支持 **direct** 聊天类型。
  - 不支持线程、媒体消息、反应表情、原生命令等高级能力。
  - `sendText`（从 OpenClaw 主动向设备推送）目前返回 `ok: false`，即还未实现主动推送通道。

---

## 代码结构

- `package.json`  
  插件包元数据，主入口为 `index.ts`。

- `openclaw.plugin.json`  
  OpenClaw 插件声明：
  - `id: "xiaozhi"`
  - 使用的通道列表：`["xiaozhi"]`
  - 当前未暴露额外插件级配置。

- `index.ts`  
  插件入口：
  - 注册插件 `id: "xiaozhi"`，名称 `Xiaozhi`。
  - 在 `register` 中保存 `runtime` 并注册 `xiaozhi` 通道。

- `src/runtime.ts`
  - 存储并导出全局的 `PluginRuntime` 实例，用于在监控循环中调用 OpenClaw 核心能力。

- `src/channel.ts`
  - 定义 `xiaozhiPlugin: ChannelPlugin`。
  - 描述通道元信息、配置解析逻辑、能力声明以及 `gateway.startAccount` 启动逻辑。

- `src/monitor.ts`
  - 核心轮询逻辑 `monitorXiaozhiProvider`。
  - 从 xiaozhi-server 拉取消息后调用 `handleXiaozhiMessage`：
    - 解析路由信息。
    - 构造 inbound 上下文。
    - 通过 `createReplyDispatcherWithTyping` + `dispatchReplyFromConfig` 走一整套自动回复管线。
    - 将最终回复 POST 回 xiaozhi-server。

---

## xiaozhi-server API 约定

插件对 xiaozhi-server 的期望接口非常简单，主要有两个：

### 1. 拉取更新：`GET /xiaozhi/updates`

请求格式（由插件自动发起）：

```text
GET {serverUrl}/xiaozhi/updates?device_id={deviceId}&offset={lastUpdateId}&timeout={timeoutSeconds}
```

- `device_id`：设备标识。
- `offset`：上一次处理到的更新 ID（初始为 `0`），服务端应返回 `id > offset` 的更新。
- `timeout`：长轮询超时秒数。

期望响应：

```json
{
  "ok": true,
  "result": [
    {
      "id": 1,
      "text": "用户说的话（已经是文本）",
      "device_id": "esp32_default"
    }
  ]
}
```

说明：

- `ok` 必须为 `true`。
- `result` 是数组，每个元素代表一条新消息。
- `id` 用于增量更新，插件会维护并在下次请求中通过 `offset` 带上。
- `text` 为传给 OpenClaw 的原始文本。

### 2. 下发回复：`POST /xiaozhi/reply`

当 OpenClaw Agent 生成最终回复后，插件会调用：

```text
POST {serverUrl}/xiaozhi/reply
Content-Type: application/json
```

请求体示例：

```json
{
  "device_id": "esp32_default",
  "text": "这是 OpenClaw 返回给用户的回复"
}
```

由 xiaozhi-server 再将该文本下发给对应的 ESP32 设备进行播报或展示。

---

## 运行机制简要说明

1. xiaozhi-server 收到设备上传的语音转文字消息，将其缓存为「更新」，并通过 `/xiaozhi/updates` 暴露。
2. 本插件通过 `monitorXiaozhiProvider` 长轮询拉取更新。
3. 每条更新会被转换为 OpenClaw 的 inbound 上下文，并通过标准的 channel routing / reply 管线交给对应 Agent。
4. Agent 的回复通过 `createReplyDispatcherWithTyping` 统一处理，最终文本通过 `/xiaozhi/reply` POST 回 xiaozhi-server。
5. xiaozhi-server 再将最终回复交给具体设备。

---

## 许可证

本项目采用 [MIT 许可证](LICENSE) 开源。

Copyright (c) 2026 OpenClaw
