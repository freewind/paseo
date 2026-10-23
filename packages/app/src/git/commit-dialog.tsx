import { useCallback, useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { DiffStat } from "@/components/diff-stat";
import { EditingTextInput } from "@/components/ui/text-input";
import { ScrollView } from "@/components/ui/scroll-view";
import { useToast } from "@/contexts/toast-context";
import { useCommitDialogController } from "./use-commit-dialog-controller";
import type { CommitDialogRequest } from "./commit-dialog-store";
import type { CommitDraftFile } from "./commit-dialog-model";

export interface CommitDialogProps {
  request: CommitDialogRequest;
  onClose: () => void;
}

/**
 * Previews the commit the daemon is about to make: the generated message, the files it will
 * include, and the totals. Nothing is committed until the button at the bottom is pressed.
 */
export function CommitDialog({ request, onClose }: CommitDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();

  const handleSubmitted = useCallback(() => {
    toast.show(t("workspace.git.actions.commit.success"), { variant: "success" });
    onClose();
  }, [onClose, t, toast]);

  const { snapshot, setMessage, retry, submit } = useCommitDialogController({
    ...request,
    onSubmitted: handleSubmitted,
  });

  const isSubmitting = snapshot.submit.status === "pending";

  const handleCancel = useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  const header = useMemo<SheetHeader>(
    () => ({ title: t("workspace.git.commitDialog.title") }),
    [t],
  );

  return (
    <AdaptiveModalSheet visible onClose={handleCancel} header={header} testID="commit-dialog">
      <View style={styles.body}>
        {snapshot.load.status === "loading" ? (
          <View style={styles.centered} testID="commit-dialog-loading">
            <ActivityIndicator />
          </View>
        ) : null}

        {snapshot.load.status === "error" ? (
          <View style={styles.centered}>
            <Text style={styles.errorText} testID="commit-dialog-load-error">
              {snapshot.load.message}
            </Text>
            <Button variant="secondary" size="sm" onPress={retry} testID="commit-dialog-retry">
              {t("workspace.git.commitDialog.retry")}
            </Button>
          </View>
        ) : null}

        {snapshot.load.status === "ready" ? (
          <>
            <View style={styles.summary}>
              <Text style={styles.summaryTitle} testID="commit-dialog-summary">
                {t("workspace.git.commitDialog.files", { count: snapshot.files.length })}
              </Text>
              <DiffStat additions={snapshot.additions} deletions={snapshot.deletions} />
            </View>
            <ScrollView style={styles.fileList} contentContainerStyle={styles.fileListContent}>
              {snapshot.files.map((file) => (
                <CommitDialogFileRow key={file.path} file={file} />
              ))}
            </ScrollView>
            <EditingTextInput
              initialValue={snapshot.initialMessage}
              onChangeText={setMessage}
              multiline
              editable={!isSubmitting}
              style={styles.messageInput}
              testID="commit-dialog-message"
            />
            {snapshot.submit.status === "error" ? (
              <Text style={styles.errorText} testID="commit-dialog-submit-error">
                {snapshot.submit.message}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                style={styles.actionButton}
                onPress={handleCancel}
                disabled={isSubmitting}
                testID="commit-dialog-cancel"
              >
                {t("common.actions.cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                style={styles.actionButton}
                onPress={submit}
                disabled={!snapshot.canSubmit}
                testID="commit-dialog-submit"
              >
                {isSubmitting
                  ? t("workspace.git.commitDialog.committing")
                  : t("workspace.git.commitDialog.submit")}
              </Button>
            </View>
          </>
        ) : null}
      </View>
    </AdaptiveModalSheet>
  );
}

function CommitDialogFileRow({ file }: { file: CommitDraftFile }) {
  return (
    <View style={styles.fileRow} testID={`commit-dialog-file-${file.path}`}>
      <Text style={styles.filePath} numberOfLines={1}>
        {file.path}
      </Text>
      <DiffStat additions={file.additions} deletions={file.deletions} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  centered: {
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[6],
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  summaryTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  fileList: {
    maxHeight: 220,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  fileListContent: {
    paddingVertical: theme.spacing[1],
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  filePath: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  messageInput: {
    minHeight: 88,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    textAlignVertical: "top",
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  actionButton: {
    flex: 1,
  },
}));
