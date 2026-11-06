import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import {
  AdaptiveModalSheet,
  AdaptiveTextInput,
  type SheetHeader,
} from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { settingsStyles } from "@/styles/settings";
import type { HostConnection } from "@/types/host-connection";

/**
 * 编辑一条非 relay 连接：直连改主机/端口/TLS，远程 SSH 改主机与两个端口。连接 id 保持
 * 不变，因此首选关系与历史都还在；要新 id 用「复制连接」。
 */
export function ConnectionEditSheet({
  connection,
  onClose,
  onSave,
}: {
  connection: HostConnection;
  onClose: () => void;
  onSave: (connection: HostConnection) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => draftFromConnection(connection));
  const header = useMemo<SheetHeader>(
    () => ({ title: t("settings.host.connections.editTitle") }),
    [t],
  );
  const setField = useCallback((field: keyof ConnectionDraft, value: string | boolean) => {
    setDraft((current) => ({ ...current, [field]: value }));
  }, []);
  const setHostField = useCallback((value: string) => setField("host", value), [setField]);
  const setPortField = useCallback((value: string) => setField("port", value), [setField]);
  const setSshPortField = useCallback((value: string) => setField("sshPort", value), [setField]);
  const setUseTlsField = useCallback((value: boolean) => setField("useTls", value), [setField]);

  const canSave = (() => {
    if (!draft.host.trim()) return false;
    if (draft.port && !isValidPortText(draft.port)) return false;
    if (connection.type === "remoteSsh") {
      if (draft.sshPort && !isValidPortText(draft.sshPort)) return false;
    }
    return true;
  })();

  const handleSave = useCallback(() => {
    if (!canSave) return;
    if (connection.type === "directTcp") {
      onSave({
        ...connection,
        endpoint: `${draft.host.trim()}:${normalizePortText(draft.port)}`,
        useTls: draft.useTls,
      });
      return;
    }
    if (connection.type === "remoteSsh") {
      onSave({
        ...connection,
        host: draft.host.trim(),
        ...(draft.sshPort ? { sshPort: Number(draft.sshPort) } : {}),
        ...(draft.port ? { daemonPort: Number(draft.port) } : {}),
      });
    }
  }, [canSave, connection, draft, onSave]);

  return (
    <AdaptiveModalSheet header={header} visible onClose={onClose} testID="connection-edit-modal">
      <View style={styles.editForm}>
        <AdaptiveTextInput
          initialValue={draft.host}
          onChangeText={setHostField}
          placeholder={t("settings.host.connections.editHost")}
          testID="connection-edit-host"
        />
        <AdaptiveTextInput
          initialValue={draft.port}
          onChangeText={setPortField}
          placeholder={t("settings.host.connections.editPort")}
          keyboardType="number-pad"
          testID="connection-edit-port"
        />
        {connection.type === "remoteSsh" ? (
          <AdaptiveTextInput
            initialValue={draft.sshPort}
            onChangeText={setSshPortField}
            placeholder={t("settings.host.connections.editSshPort")}
            keyboardType="number-pad"
            testID="connection-edit-ssh-port"
          />
        ) : null}
        {connection.type === "directTcp" ? (
          <View style={styles.editCheckboxRow}>
            <Text style={settingsStyles.rowTitle}>{t("settings.host.connections.editUseTls")}</Text>
            <Switch
              value={draft.useTls}
              onValueChange={setUseTlsField}
              testID="connection-edit-use-tls"
            />
          </View>
        ) : null}
        <View style={styles.confirmActions}>
          <Button variant="secondary" size="sm" style={styles.flexOne} onPress={onClose}>
            {t("common.actions.cancel")}
          </Button>
          <Button
            size="sm"
            style={styles.flexOne}
            onPress={handleSave}
            disabled={!canSave}
            testID="connection-edit-save"
          >
            {t("settings.host.connections.saveAction")}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

interface ConnectionDraft {
  host: string;
  port: string;
  sshPort: string;
  useTls: boolean;
}

const NO_SSH_PORT = "";
/** 端口留空时按 daemon 默认端口写回，和新建连接时的默认一致。 */
const DEFAULT_DAEMON_PORT_TEXT = "6767";

function draftFromConnection(connection: HostConnection): ConnectionDraft {
  if (connection.type === "directTcp") {
    const [host = "", port = ""] = connection.endpoint.split(":");
    return { host, port, sshPort: NO_SSH_PORT, useTls: connection.useTls ?? false };
  }
  if (connection.type === "remoteSsh") {
    return {
      host: connection.host,
      port: connection.daemonPort != null ? String(connection.daemonPort) : "",
      sshPort: connection.sshPort != null ? String(connection.sshPort) : "",
      useTls: false,
    };
  }
  return { host: "", port: "", sshPort: NO_SSH_PORT, useTls: false };
}

function isValidPortText(value: string): boolean {
  if (!value) return true;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

function normalizePortText(value: string): string {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535
    ? String(port)
    : DEFAULT_DAEMON_PORT_TEXT;
}

const styles = StyleSheet.create((theme) => ({
  editForm: {
    gap: 12,
    padding: 16,
  },
  editCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  confirmActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  flexOne: { flex: 1 },
}));
