import { describe, expect, it, vi } from "vitest";
import { xiaozhiOnboardingAdapter } from "./onboarding.js";

describe("xiaozhi onboarding adapter", () => {
  it("reports unconfigured status when required fields missing", async () => {
    const result = await xiaozhiOnboardingAdapter.getStatus({
      cfg: { channels: { xiaozhi: { enabled: true } } } as never,
    });
    expect(result.configured).toBe(false);
    expect(result.selectionHint).toBe("needs setup");
  });

  it("configures xiaozhi channel via prompts", async () => {
    const note = vi.fn(async () => {});
    const text = vi
      .fn()
      .mockResolvedValueOnce("http://127.0.0.1:8003")
      .mockResolvedValueOnce("esp32_001")
      .mockResolvedValueOnce("45");
    const result = await xiaozhiOnboardingAdapter.configure({
      cfg: {},
      prompter: { note, text } as never,
    });

    expect(result.accountId).toBe("default");
    expect(result.cfg.channels?.xiaozhi).toEqual({
      enabled: true,
      xiaozhiServerUrl: "http://127.0.0.1:8003",
      deviceId: "esp32_001",
      timeout: 45,
    });
  });

  it("disables channel without deleting existing config", () => {
    const result = xiaozhiOnboardingAdapter.disable({
      channels: {
        xiaozhi: {
          enabled: true,
          xiaozhiServerUrl: "http://localhost:8003",
          deviceId: "b0:a6:04:55:0f:d0",
          timeout: 30,
        },
      },
    } as never);
    expect(result.channels?.xiaozhi).toMatchObject({
      enabled: false,
      xiaozhiServerUrl: "http://localhost:8003",
      deviceId: "b0:a6:04:55:0f:d0",
      timeout: 30,
    });
  });
});
