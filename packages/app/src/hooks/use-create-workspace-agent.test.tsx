/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compact: false,
  showMobileAgent: vi.fn(),
  navigateToWorkspace: vi.fn(),
  generateDraftId: vi.fn(() => "draft-test"),
}));

vi.mock("@/constants/layout", () => ({ useIsCompactFormFactor: () => mocks.compact }));
vi.mock("@/stores/panel-store", () => ({
  usePanelStore: (selector: (state: { showMobileAgent: () => void }) => unknown) =>
    selector({ showMobileAgent: mocks.showMobileAgent }),
}));
vi.mock("@/stores/navigation-active-workspace-store", () => ({
  navigateToWorkspace: mocks.navigateToWorkspace,
}));
vi.mock("@/stores/draft-keys", () => ({ generateDraftId: mocks.generateDraftId }));

import { useCreateWorkspaceAgent } from "@/hooks/use-create-workspace-agent";

function Harness({ serverId, workspaceId }: { serverId: string; workspaceId: string }) {
  const createAgent = useCreateWorkspaceAgent({ serverId, workspaceId });
  return (
    <button type="button" onClick={createAgent}>
      Create
    </button>
  );
}

describe("useCreateWorkspaceAgent", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    mocks.compact = false;
    mocks.showMobileAgent.mockClear();
    mocks.navigateToWorkspace.mockClear();
    mocks.generateDraftId.mockClear();
  });

  it("opens a unique draft in the selected workspace", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<Harness serverId="server-1" workspaceId="workspace-2" />));
    act(() => container?.querySelector("button")?.click());

    expect(mocks.navigateToWorkspace).toHaveBeenCalledWith({
      serverId: "server-1",
      workspaceId: "workspace-2",
      target: { kind: "draft", draftId: "draft-test" },
    });
    expect(mocks.generateDraftId).toHaveBeenCalledOnce();
    expect(mocks.showMobileAgent).not.toHaveBeenCalled();
  });

  it("opens the agent panel on compact layouts", () => {
    mocks.compact = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<Harness serverId="server-1" workspaceId="workspace-1" />));
    act(() => container?.querySelector("button")?.click());

    expect(mocks.showMobileAgent).toHaveBeenCalledOnce();
    expect(mocks.navigateToWorkspace).toHaveBeenCalledOnce();
  });
});
