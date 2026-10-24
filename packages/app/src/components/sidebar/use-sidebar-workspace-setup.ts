import { useCallback, useMemo } from "react";
import { FOCUSED_PANE_PLACEMENT, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { shouldShowWorkspaceSetup, useWorkspaceSetupStore } from "@/stores/workspace-setup-store";
import { normalizeWorkspaceTabTarget } from "@/workspace-tabs/identity";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

/**
 * The workspace header's "Show setup" item, rebuilt for the sidebar.
 *
 * The header reads this from the screen it lives in — `workspace-screen.tsx` owns the tab store
 * and the setup snapshot there. The sidebar has no screen, so it reads the same two stores
 * directly. Keeping it here means the sidebar menu gains the item without the header or the
 * screen changing at all.
 */
export function useSidebarWorkspaceSetup(serverId?: string, workspaceId?: string) {
  const persistenceKey = useMemo(
    () =>
      serverId && workspaceId ? buildWorkspaceTabPersistenceKey({ serverId, workspaceId }) : null,
    [serverId, workspaceId],
  );
  const snapshot = useWorkspaceSetupStore((state) =>
    persistenceKey ? (state.snapshots[persistenceKey] ?? null) : null,
  );
  const openTab = useWorkspaceLayoutStore((state) => state.openTab);

  const openSetupTab = useCallback(() => {
    if (!workspaceId || !persistenceKey) return;
    const target = normalizeWorkspaceTabTarget({ kind: "setup", workspaceId });
    if (!target) return;
    openTab({
      workspaceKey: persistenceKey,
      target,
      intent: "reveal",
      placement: FOCUSED_PANE_PLACEMENT,
    });
  }, [openTab, persistenceKey, workspaceId]);

  return { showWorkspaceSetup: shouldShowWorkspaceSetup(snapshot), openSetupTab };
}
