/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n as testI18n } from "@/i18n/i18next";

void testI18n;

const { closeMenuMock, mockTheme } = vi.hoisted(() => ({
  closeMenuMock: vi.fn(),
  mockTheme: {
    colors: { foregroundMuted: "#aaa" },
  },
}));

// In-file mocks instead of the test-stubs aliases so the suite also runs from the repo root
// config, which does not alias lucide-react-native or react-native-unistyles.
vi.mock("lucide-react-native", () => {
  const StubIcon = () => null;
  return {
    Archive: StubIcon,
    ArchiveRestore: StubIcon,
    Circle: StubIcon,
    CircleCheck: StubIcon,
    Copy: StubIcon,
    Import: StubIcon,
    Pencil: StubIcon,
    Pin: StubIcon,
    PinOff: StubIcon,
    Settings: StubIcon,
    SquarePen: StubIcon,
    Tag: StubIcon,
  };
});
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function" ? (factory as (theme: unknown) => unknown)(mockTheme) : factory,
  },
  withUnistyles:
    (Component: React.ComponentType<Record<string, unknown>>) =>
    ({
      uniProps,
      ...rest
    }: { uniProps?: (theme: unknown) => Record<string, unknown> } & Record<string, unknown>) => {
      const themed = uniProps ? uniProps(mockTheme) : {};
      return React.createElement(Component, { ...rest, ...themed });
    },
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({
    children,
    onSelect,
    testID,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    testID?: string;
    disabled?: boolean;
  }) => (
    <button type="button" data-testid={testID} disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuSubTrigger: ({
    children,
    testID,
  }: {
    children: React.ReactNode;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID}>
      {children}
    </button>
  ),
  useDropdownMenuClose: () => closeMenuMock,
}));
vi.mock("@/components/ui/context-menu", () => ({
  ContextMenuItem: ({
    children,
    onSelect,
    testID,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    testID?: string;
    disabled?: boolean;
  }) => (
    <button type="button" data-testid={testID} disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/shortcut", () => ({ Shortcut: () => null }));
vi.mock("@/workspace/open-in-file-manager/menu-item", () => ({
  OpenInFileManagerMenuItem: ({ testID }: { testID: string }) => (
    <button type="button" data-testid={testID} />
  ),
}));
// react-native-unistyles and lucide-react-native come from the test-stubs resolve.alias in
// vitest.config.ts; mocking them here would shadow the shared fixture (and drop StyleSheet).
// The picker keeps a module-scope JSX icon that the unit transform never reaches from here.
vi.mock("@/workspace-labels/picker", () => ({
  WORKSPACE_LABEL_PAGE_ID: "workspaceLabels",
}));
import { WorkspaceMenuActionItems } from "@/components/workspace-menu-action-items";

const target = { serverId: "server-a", workspaceId: "workspace-a", labels: ["bugs"] };
const targetB = { serverId: "server-a", workspaceId: "workspace-b", labels: ["bugs"] };

function menuProps(status: "done" | "attention" | "failed") {
  const actions = {
    create: vi.fn(),
    copyPath: vi.fn(),
    rename: vi.fn(),
    clear: vi.fn(),
    unread: vi.fn(),
    pin: vi.fn(),
    archive: vi.fn(),
    branch: vi.fn(),
  };
  const element = (
    <WorkspaceMenuActionItems
      surface="dropdown"
      workspaceKey="server-a:workspace-a"
      workspaceTarget={target}
      onCreateAgent={actions.create}
      onCopyPath={actions.copyPath}
      onCopyBranchName={actions.branch}
      onRename={actions.rename}
      onMarkAsRead={status === "attention" || status === "failed" ? actions.clear : undefined}
      onMarkAsUnread={status === "done" ? actions.unread : undefined}
      onTogglePin={actions.pin}
      onArchive={actions.archive}
      openInFileManagerPath="/repo/workspace-a"
    />
  );
  return { actions, element };
}

describe("WorkspaceMenuActionItems", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it("renders the same daily actions for dropdown and context surfaces", () => {
    const props = {
      workspaceKey: "server-a:workspace-a",
      workspaceTarget: target,
      onCreateAgent: vi.fn(),
      onCopyPath: vi.fn(),
      onCopyBranchName: vi.fn(),
      onRename: vi.fn(),
      onMarkAsRead: vi.fn(),
      onMarkAsUnread: vi.fn(),
      onTogglePin: vi.fn(),
      openInFileManagerPath: "/repo/workspace-a",
      onArchive: vi.fn(),
    };
    const { rerender } = render(<WorkspaceMenuActionItems surface="dropdown" {...props} />);
    const dropdownIds = Array.from(document.querySelectorAll("[data-testid]"))
      .map((node) => node.getAttribute("data-testid"))
      .filter((id) => id?.startsWith("workspace-menu-"));
    rerender(<WorkspaceMenuActionItems surface="context" {...props} />);
    const contextIds = Array.from(document.querySelectorAll("[data-testid]"))
      .map((node) => node.getAttribute("data-testid"))
      .filter((id) => id?.startsWith("workspace-menu-"));
    expect(contextIds).toEqual(dropdownIds);
    expect(contextIds).toContain("workspace-menu-new-agent-server-a:workspace-a");
    expect(contextIds).toContain("workspace-menu-mark-as-unread-server-a:workspace-a");
    expect(contextIds).toContain("workspace-menu-labels-server-a:workspace-a");
    expect(contextIds).toContain("workspace-menu-open-folder-server-a:workspace-a");
  });

  it("preserves caller-specific test IDs for existing workspace menu consumers", () => {
    render(
      <WorkspaceMenuActionItems
        surface="dropdown"
        testIDPrefix="sidebar-workspace-menu"
        workspaceKey="server-a:workspace-a"
        workspaceTarget={target}
        onCreateAgent={vi.fn()}
        onCopyPath={vi.fn()}
        onRename={vi.fn()}
        onMarkAsRead={vi.fn()}
        onMarkAsUnread={vi.fn()}
        onTogglePin={vi.fn()}
        openInFileManagerPath="/repo/workspace-a"
        onArchive={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("sidebar-workspace-menu-new-agent-server-a:workspace-a"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("sidebar-workspace-menu-mark-as-read-server-a:workspace-a"),
    ).toBeTruthy();
    expect(screen.getByTestId("sidebar-workspace-menu-labels-server-a:workspace-a")).toBeTruthy();
    expect(
      screen.getByTestId("sidebar-workspace-menu-open-folder-server-a:workspace-a"),
    ).toBeTruthy();
    expect(screen.getByTestId("sidebar-workspace-menu-archive-server-a:workspace-a")).toBeTruthy();
  });

  it("shows only the workspace attention action that matches its status", () => {
    const done = menuProps("done");
    const { rerender } = render(done.element);
    expect(screen.getByTestId("workspace-menu-mark-as-unread-server-a:workspace-a")).toBeTruthy();
    expect(screen.queryByTestId("workspace-menu-mark-as-read-server-a:workspace-a")).toBeNull();
    const attention = menuProps("attention");
    rerender(attention.element);
    expect(screen.getByTestId("workspace-menu-mark-as-read-server-a:workspace-a")).toBeTruthy();
    expect(screen.queryByTestId("workspace-menu-mark-as-unread-server-a:workspace-a")).toBeNull();
    fireEvent.click(screen.getByTestId("workspace-menu-mark-as-read-server-a:workspace-a"));
    expect(attention.actions.clear).toHaveBeenCalledOnce();
    const failed = menuProps("failed");
    rerender(failed.element);
    expect(screen.getByTestId("workspace-menu-mark-as-read-server-a:workspace-a")).toBeTruthy();
    expect(screen.queryByTestId("workspace-menu-mark-as-unread-server-a:workspace-a")).toBeNull();
  });

  it("preserves workspace-targeted callbacks and closes before rename, pin, and archive", () => {
    const actions = {
      rename: vi.fn(),
      pin: vi.fn(),
      archive: vi.fn(),
      copyPath: vi.fn(),
    };
    render(
      <WorkspaceMenuActionItems
        surface="dropdown"
        workspaceKey="server-a:workspace-b"
        workspaceTarget={targetB}
        onRename={actions.rename}
        onTogglePin={actions.pin}
        onArchive={actions.archive}
        onCopyPath={actions.copyPath}
      />,
    );
    fireEvent.click(screen.getByTestId("workspace-menu-rename-server-a:workspace-b"));
    expect(closeMenuMock).toHaveBeenCalledOnce();
    expect(actions.rename).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("workspace-menu-pin-server-a:workspace-b"));
    fireEvent.click(screen.getByTestId("workspace-menu-archive-server-a:workspace-b"));
    expect(actions.pin).toHaveBeenCalledOnce();
    expect(actions.archive).toHaveBeenCalledOnce();
    expect(actions.copyPath).not.toHaveBeenCalled();
  });
});
