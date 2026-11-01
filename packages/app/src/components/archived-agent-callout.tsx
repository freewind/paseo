import { useCallback, useState } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { FOOTER_HEIGHT } from "@/constants/layout";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { KeyboardTranslateView } from "@/keyboard/shift";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/styles/theme";
import { toErrorMessage } from "@/utils/error-messages";

interface ArchivedAgentCalloutProps {
  serverId: string;
  agentId: string;
}

function resolveCalloutError(input: CalloutViewInput): string | null {
  // 主机已经给出终态就只认它：成功时不能再把本地超时挂出来。
  if (input.phase === "failed") return input.restoreError;
  if (input.phase === "succeeded") return null;
  return input.localError;
}

interface CalloutViewInput {
  phase: "running" | "succeeded" | "failed" | null;
  restoreError: string | null;
  /** 主机能力集未知（还没连上）时为 null。 */
  hostSupportsRestoreState: boolean | null;
  isSubmitting: boolean;
  resultUnknown: boolean;
  localError: string | null;
}

/**
 * 恢复进度只认主机快照。本地失败或超时只说明“结果未知”，控件继续锁定，
 * 不鼓励用户再点一次。
 */
export function deriveCalloutView(input: CalloutViewInput): {
  isRestoring: boolean;
  hostOutdated: boolean;
  showResultUnknown: boolean;
  errorMessage: string | null;
} {
  const phaseUnknown = input.phase === null;
  return {
    isRestoring:
      input.isSubmitting || input.phase === "running" || (input.resultUnknown && phaseUnknown),
    hostOutdated: input.hostSupportsRestoreState === false,
    showResultUnknown: input.resultUnknown && phaseUnknown,
    errorMessage: resolveCalloutError(input),
  };
}

export function ArchivedAgentCallout({ serverId, agentId }: ArchivedAgentCalloutProps) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const agent = useSessionStore(
    (state) =>
      state.sessions[serverId]?.agents.get(agentId) ??
      state.sessions[serverId]?.agentDetails.get(agentId),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resultUnknown, setResultUnknown] = useState(false);

  const view = deriveCalloutView({
    phase: agent?.restoreState?.phase ?? null,
    restoreError: agent?.restoreState?.error ?? null,
    hostSupportsRestoreState:
      client === null
        ? null
        : client.getLastServerInfoMessage()?.features?.agentRestoreState === true,
    isSubmitting,
    resultUnknown,
    localError,
  });

  const handleUnarchive = useCallback(async () => {
    if (!client || !isConnected || view.isRestoring || view.hostOutdated) return;
    setIsSubmitting(true);
    setLocalError(null);
    setResultUnknown(false);
    try {
      await client.refreshAgent(agentId);
      // 终止状态由 agent 快照送达，不从这个响应读。
    } catch (error) {
      // 本地失败不代表主机没在恢复：保持控件锁定，等权威快照收尾。
      setResultUnknown(true);
      setLocalError(toErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [client, isConnected, view.isRestoring, view.hostOutdated, agentId]);

  return (
    <KeyboardTranslateView style={styles.container}>
      <View style={styles.inputAreaContainer}>
        <View style={styles.inputAreaContent}>
          <View style={styles.calloutStack}>
            <View style={styles.callout}>
              <Text style={styles.calloutText}>{t("agentPanel.archived.callout")}</Text>
              <Button
                size="sm"
                variant="secondary"
                onPress={handleUnarchive}
                disabled={!isConnected || view.isRestoring || view.hostOutdated}
              >
                {view.isRestoring
                  ? t("agentPanel.archived.restoring")
                  : t("agentPanel.archived.unarchive")}
              </Button>
            </View>
            {view.hostOutdated ? (
              <Text style={styles.errorText} testID="agent-unarchive-host-outdated">
                {t("agentPanel.archived.hostOutdated")}
              </Text>
            ) : null}
            {view.showResultUnknown ? (
              <Text style={styles.hintText} testID="agent-unarchive-unknown">
                {t("agentPanel.archived.resultUnknown")}
              </Text>
            ) : null}
            {view.errorMessage ? (
              <Text style={styles.errorText} testID="agent-unarchive-error">
                {view.errorMessage}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </KeyboardTranslateView>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    flexDirection: "column",
    position: "relative",
  },
  inputAreaContainer: {
    position: "relative",
    minHeight: FOOTER_HEIGHT,
    marginHorizontal: "auto",
    alignItems: "center",
    width: "100%",
    overflow: "visible",
    padding: theme.spacing[4],
  },
  inputAreaContent: {
    width: "100%",
    maxWidth: theme.contentMaxWidth,
  },
  callout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius["2xl"],
    paddingVertical: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
    paddingHorizontal: {
      xs: theme.spacing[4],
      md: theme.spacing[6],
    },
  },
  calloutStack: {
    gap: theme.spacing[2],
  },
  calloutText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  hintText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  errorText: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
})) as unknown as Record<string, object>;
