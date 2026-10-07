import { describe, expect, it } from "vitest";
import type { DaemonServerInfo } from "@/stores/session-store";
import { hostSupportsFeature, selectHostFeature } from "./host-features";

const enabled: DaemonServerInfo = {
  serverId: "server-1",
  hostname: "host",
  version: "1",
  features: { assistantMessageCompletion: true },
};

describe("assistant message completion host capability", () => {
  it("requires the daemon to explicitly advertise completion metadata", () => {
    expect(hostSupportsFeature(enabled, "assistantMessageCompletion")).toBe(true);
    expect(
      hostSupportsFeature({ ...enabled, features: undefined }, "assistantMessageCompletion"),
    ).toBe(false);
    expect(hostSupportsFeature(null, "assistantMessageCompletion")).toBe(false);
  });

  it("selects the capability from the target host rather than another host", () => {
    expect(
      selectHostFeature(
        { sessions: { "server-1": { serverInfo: enabled }, "server-2": { serverInfo: null } } },
        "server-1",
        "assistantMessageCompletion",
      ),
    ).toBe(true);
    expect(
      selectHostFeature(
        { sessions: { "server-1": { serverInfo: enabled }, "server-2": { serverInfo: null } } },
        "server-2",
        "assistantMessageCompletion",
      ),
    ).toBe(false);
  });
});
