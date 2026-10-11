/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { routerPushMock } = vi.hoisted(() => ({ routerPushMock: vi.fn() }));

vi.mock("expo-router", () => ({ useRouter: () => ({ push: routerPushMock }) }));
vi.mock("@/hooks/use-daemon-config", () => ({ useDaemonConfig: () => ({ config: null }) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  withUnistyles: (Component: React.ComponentType<Record<string, unknown>>) => Component,
}));
vi.mock("@/components/terminal-profile-icon", () => ({ TerminalProfileIcon: () => null }));
vi.mock("@/components/ui/icon-button-chrome", () => ({
  extraMutedIconColorMapping: () => ({}),
  iconButtonChromeGlyphSize: () => 16,
  iconButtonChromeStyle: () => ({}),
}));
vi.mock("@/components/ui/dropdown-menu", () => {
  const Item = ({
    children,
    testID,
    onSelect,
  }: React.PropsWithChildren<{
    testID?: string;
    onSelect?: () => void;
  }>) => (
    <button type="button" data-testid={testID} onClick={onSelect}>
      {children}
    </button>
  );
  return {
    DropdownMenu: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: React.PropsWithChildren<{ testID?: string }>) => (
      <div>{children}</div>
    ),
    DropdownMenuItem: Item,
    DropdownMenuLabel: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuSubTrigger: Item,
    DropdownMenuTrigger: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
      <button type="button" data-testid={testID}>
        {children}
      </button>
    ),
    useDropdownMenuClose: () => vi.fn(),
  };
});
vi.mock("@/workspace-labels/picker", () => ({
  useWorkspaceLabelMenuPages: () => [],
  WORKSPACE_LABEL_PAGE_ID: "workspaceLabels",
}));
vi.mock("@/workspace/open-in-file-manager/menu-item", () => ({
  OpenInFileManagerMenuItem: ({ path, testID }: { path?: string | null; testID: string }) => (
    <button type="button" data-testid={testID} data-path={path ?? ""} />
  ),
}));

import {
  WorkspaceHeaderMenuDesktop,
  WorkspaceHeaderMenuMobile,
  type WorkspaceHeaderWorkspaceActions,
} from "@/screens/workspace/workspace-header-menu";

const workspaceActions: WorkspaceHeaderWorkspaceActions = {
  currentBranchName: "feature/menu",
  showWorkspaceSetup: true,
  importAgentDisabled: false,
  copyPathDisabled: false,
  onOpenImportSheet: vi.fn(),
  onCopyWorkspacePath: vi.fn(),
  onCopyBranchName: vi.fn(),
  onOpenSetupTab: vi.fn(),
  workspaceKey: "server-a:workspace-b",
  workspaceTarget: { serverId: "server-a", workspaceId: "workspace-b", labels: [] },
  workspaceDirectory: "/repo/workspace-b",
  onCreateAgent: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkspaceHeaderMenu", () => {
  it("renders shared workspace actions once and uses the target workspace directory", () => {
    const { rerender } = render(<WorkspaceHeaderMenuDesktop {...workspaceActions} />);
    const desktopIds = Array.from(
      document.querySelectorAll("[data-testid^='workspace-menu-']"),
    ).map((element) => element.getAttribute("data-testid"));
    expect(desktopIds).toContain("workspace-menu-new-agent-server-a:workspace-b");
    expect(desktopIds).toContain("workspace-menu-labels-server-a:workspace-b");
    expect(desktopIds).toContain("workspace-menu-open-folder-server-a:workspace-b");
    expect(
      screen
        .getByTestId("workspace-menu-open-folder-server-a:workspace-b")
        .getAttribute("data-path"),
    ).toBe("/repo/workspace-b");
    expect(screen.queryByTestId("workspace-header-new-browser")).toBeNull();
    expect(screen.queryByTestId("workspace-header-new-terminal")).toBeNull();

    rerender(
      <WorkspaceHeaderMenuMobile
        {...workspaceActions}
        normalizedServerId="server-a"
        showCreateBrowserTab
        createTerminalDisabled={false}
        onCreateTerminal={vi.fn()}
        onCreateTerminalWithProfile={vi.fn()}
        onCreateBrowser={vi.fn()}
      />,
    );
    const mobileIds = Array.from(document.querySelectorAll("[data-testid^='workspace-menu-']")).map(
      (element) => element.getAttribute("data-testid"),
    );
    expect(mobileIds).toEqual(desktopIds);
    expect(screen.getAllByTestId("workspace-menu-new-agent-server-a:workspace-b")).toHaveLength(1);
    expect(screen.getByTestId("workspace-header-new-browser")).toBeTruthy();
    expect(screen.getByTestId("workspace-header-new-terminal")).toBeTruthy();
    expect(screen.getByTestId("workspace-header-edit-terminal-profiles")).toBeTruthy();
  });
});
