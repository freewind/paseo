import { router, type Href } from "expo-router";
import { navigateToLastWorkspace } from "@/stores/navigation-active-workspace-store";
import { buildOpenProjectRoute } from "@/utils/host-routes";

export interface BackToChatDependencies {
  canGoBack: () => boolean;
  back: () => void;
  navigateToLastWorkspace: () => boolean;
  replace: (href: Href) => void;
}

const defaultDependencies: BackToChatDependencies = {
  canGoBack: () => router.canGoBack(),
  back: () => router.back(),
  navigateToLastWorkspace,
  replace: (href) => router.replace(href),
};

export function backToChat(deps: BackToChatDependencies = defaultDependencies): void {
  if (deps.canGoBack()) {
    deps.back();
    return;
  }

  if (deps.navigateToLastWorkspace()) {
    return;
  }

  deps.replace(buildOpenProjectRoute());
}
