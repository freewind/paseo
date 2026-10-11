import { describe, expect, it, vi } from "vitest";

vi.mock("expo-router", () => ({
  router: {
    back: vi.fn(),
    canGoBack: vi.fn(),
    replace: vi.fn(),
  },
}));
vi.mock("@/stores/navigation-active-workspace-store", () => ({
  navigateToLastWorkspace: vi.fn(),
}));

import { backToChat, type BackToChatDependencies } from "./back-to-chat";
import { buildOpenProjectRoute } from "./host-routes";

function createDependencies(overrides: Partial<BackToChatDependencies> = {}) {
  return {
    canGoBack: vi.fn(() => false),
    back: vi.fn(),
    navigateToLastWorkspace: vi.fn(() => false),
    replace: vi.fn(),
    ...overrides,
  } satisfies BackToChatDependencies;
}

describe("backToChat", () => {
  it("goes back in the navigation stack without navigating to a workspace", () => {
    const deps = createDependencies({ canGoBack: vi.fn(() => true) });

    backToChat(deps);

    expect(deps.back).toHaveBeenCalledOnce();
    expect(deps.navigateToLastWorkspace).not.toHaveBeenCalled();
    expect(deps.replace).not.toHaveBeenCalled();
  });

  it("navigates to the last workspace when there is no stack entry", () => {
    const deps = createDependencies({ navigateToLastWorkspace: vi.fn(() => true) });

    backToChat(deps);

    expect(deps.back).not.toHaveBeenCalled();
    expect(deps.navigateToLastWorkspace).toHaveBeenCalledOnce();
    expect(deps.replace).not.toHaveBeenCalled();
  });

  it("replaces with open project when no stack entry or last workspace exists", () => {
    const deps = createDependencies();

    backToChat(deps);

    expect(deps.back).not.toHaveBeenCalled();
    expect(deps.navigateToLastWorkspace).toHaveBeenCalledOnce();
    expect(deps.replace).toHaveBeenCalledExactlyOnceWith(buildOpenProjectRoute());
  });
});
