import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { xiaozhiPlugin } from "./src/channel.js";
import { setXiaozhiRuntime } from "./src/runtime.js";

const plugin = {
  id: "xiaozhi",
  name: "Xiaozhi",
  description: "小智 ESP32 语音助手集成",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setXiaozhiRuntime(api.runtime);
    api.registerChannel({ plugin: xiaozhiPlugin as ChannelPlugin });
  },
};

export default plugin;
