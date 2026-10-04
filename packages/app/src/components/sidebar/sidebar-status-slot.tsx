import { View, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CircleAlert, Folder, FolderGit2, Monitor } from "lucide-react-native";
import type { Theme } from "@/styles/theme";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";
import { getStatusDotColor } from "@/utils/status-dot-color";
import {
  STATUS_INDICATOR_ALERT_SIZE,
  STATUS_INDICATOR_DOT_SIZE,
  STATUS_INDICATOR_FILLED_DOT_SIZE,
} from "@/utils/status-indicator-geometry";
import { shouldRenderSyncedStatusLoader } from "@/utils/status-loader";
import { StatusRing } from "@/components/status-ring";

const needsInputColorMapping = (theme: Theme) => ({
  color: theme.colors.surface0,
  fill: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
});

const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedMonitor = withUnistyles(Monitor);
const ThemedFolder = withUnistyles(Folder);
const ThemedFolderGit2 = withUnistyles(FolderGit2);

const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** The row's own identity glyph, which only a workspace row has. */
export type SidebarStatusSlotKind = SidebarWorkspaceEntry["workspaceKind"];

/**
 * The leading status slot every sidebar row hangs its state in. Workspace rows and the agent
 * rows nested under them read the same states, so both render this one component — a second
 * copy of the mapping is how the two drifts apart.
 *
 * `kind` names the row's own identity glyph, which only a workspace row has: it tells local
 * checkouts from worktrees. An agent row has none, so a failed agent then shows the bare red dot
 * instead of a folder with a red dot hung off its corner.
 */
export function SidebarStatusSlot({
  bucket,
  kind,
  loading = false,
  reserveIdleSpace = true,
  testID,
}: {
  bucket: SidebarStateBucket | null | undefined;
  /** The row's own identity glyph. Omitted on agent rows, which have none. */
  kind?: SidebarStatusSlotKind;
  loading?: boolean;
  reserveIdleSpace?: boolean;
  testID: string;
}) {
  // Busy is the only status that moves, and it is the ring rather than a dot for the same
  // reason it is a dot elsewhere: every status in the sidebar sits in this one slot, so busy
  // has to fill it without displacing anything. A row starting up and a row working are both
  // busy, so they share the ring and differ only in testID.
  if (loading) {
    return (
      <View style={styles.slot} testID={`${testID}-loading`}>
        <StatusRing />
      </View>
    );
  }

  if (shouldRenderSyncedStatusLoader({ bucket })) {
    return (
      <View style={styles.slot} testID={`${testID}-running`}>
        <StatusRing />
      </View>
    );
  }

  if (bucket === "needs_input") {
    return (
      <View style={styles.slot} testID={`${testID}-needs_input`}>
        <ThemedCircleAlert size={STATUS_INDICATOR_ALERT_SIZE} uniProps={needsInputColorMapping} />
      </View>
    );
  }

  if (bucket === "attention") {
    return (
      <View style={styles.slot} testID={`${testID}-attention`}>
        <View style={styles.standaloneStatusDot} />
      </View>
    );
  }

  if (bucket === "done") {
    // An idle row still gets a dot rather than an empty slot. Nested rows are marked as
    // workspaces by indentation alone, and with nothing in the leading slot the rail has no
    // edge to read against — a workspace carrying its own glyph starts looking like a project
    // header. The dot is muted to half opacity so it holds the rail without reporting status.
    return reserveIdleSpace ? (
      <View style={styles.slot} testID={`${testID}-done`}>
        <View style={styles.idleStatusDot} />
      </View>
    ) : null;
  }

  // A tab can outlive the agent it names — a workspace restored from disk lists its tabs
  // before the session has hydrated them. The slot still holds its width so the titles in
  // that gap don't jump sideways once the agent arrives, but it claims no state it doesn't
  // have yet.
  if (!bucket) {
    return <View style={styles.slot} testID={`${testID}-unknown`} />;
  }

  const dotColorStyle = getStatusDotColorStyle(bucket);
  return (
    <View style={styles.slot} testID={`${testID}-${bucket}`}>
      {renderKindIcon(kind)}
      {dotColorStyle ? <StatusDotOverlay dotColorStyle={dotColorStyle} /> : null}
    </View>
  );
}

function renderKindIcon(kind: SidebarStatusSlotKind | undefined) {
  // checkout and directory both predate the workspace kinds that named them, and neither has a
  // glyph of its own — they fall through to the plain folder.
  if (kind === "local_checkout")
    return <ThemedMonitor size={14} uniProps={foregroundMutedColorMapping} />;
  if (kind === "worktree")
    return <ThemedFolderGit2 size={14} uniProps={foregroundMutedColorMapping} />;
  if (kind === "checkout" || kind === "directory")
    return <ThemedFolder size={14} uniProps={foregroundMutedColorMapping} />;
  return null;
}

function StatusDotOverlay({ dotColorStyle }: { dotColorStyle: ViewStyle }) {
  return <View style={[styles.statusDotOverlay, dotColorStyle]} />;
}

function getStatusDotColorStyle(bucket: SidebarStateBucket | null | undefined) {
  if (bucket === "needs_input") return styles.statusDotNeedsInput;
  if (bucket === "failed") return styles.statusDotFailed;
  if (bucket === "running") return styles.statusDotRunning;
  if (bucket === "attention") return styles.statusDotAttention;
  return null;
}

const styles = StyleSheet.create((theme) => ({
  slot: {
    position: "relative",
    width: theme.iconSize.md,
    height: 20,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotOverlay: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: STATUS_INDICATOR_DOT_SIZE,
    height: STATUS_INDICATOR_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  standaloneStatusDot: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "attention" }) ?? undefined,
  },
  idleStatusDot: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foregroundExtraMuted,
    opacity: 0.3,
  },
  statusDotNeedsInput: {
    backgroundColor: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
  statusDotFailed: {
    backgroundColor: getStatusDotColor({ theme, bucket: "failed" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
  statusDotRunning: {
    backgroundColor: getStatusDotColor({ theme, bucket: "running" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
  statusDotAttention: {
    backgroundColor: getStatusDotColor({ theme, bucket: "attention" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
}));
