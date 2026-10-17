import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check, ImagePlus, X } from "lucide-react-native";
import type { AttachmentMetadata } from "@/attachments/types";
import { persistAttachmentFromBlob } from "@/attachments/service";
import { persistAttachmentFromDataUrl } from "@/attachments/service";
import { persistAttachmentFromFileUri } from "@/attachments/service";
import { retainAttachmentForGarbageCollection } from "@/attachments/gc-retention";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import { pickAndPersistImages } from "@/composer/actions";
import { normalizeNativePastedImages, type NativePastedFile } from "@/composer/native-pasted-image";
import { useImageAttachmentPicker } from "@/hooks/use-image-attachment-picker";
import { isWeb } from "@/constants/platform";
import {
  collectImageFilesFromClipboardData,
  filesToImageAttachments,
} from "@/utils/image-attachments-from-files";
import type { Theme } from "@/styles/theme";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedImagePlus = withUnistyles(ImagePlus, mutedIconMapping);
const ThemedCheck = withUnistyles(Check, mutedIconMapping);
const ThemedX = withUnistyles(X, mutedIconMapping);

/** The same persisters the composer uses, so memo images live in the one attachment store. */
const memoImagePersister = {
  persistFromBlob: persistAttachmentFromBlob,
  persistFromDataUrl: persistAttachmentFromDataUrl,
  persistFromFileUri: persistAttachmentFromFileUri,
};

/**
 * Text plus images for a new memo.
 *
 * Images enter the draft as `kind: "image"` attachment metadata — the same shape the composer
 * uses — so preview, removal and garbage-collection retention are the existing ones. Bytes stay
 * in the attachment store while the draft is open; only the submit path encodes them to the
 * inline base64 the daemon stores.
 */
export function AgentMemoComposer({
  onSubmit,
  onCancel,
  canAttachImages,
}: {
  onSubmit: (text: string, images: readonly AttachmentMetadata[]) => Promise<void>;
  onCancel: () => void;
  /** Host capability: a daemon without it would store the memo and drop the image. */
  canAttachImages: boolean;
}) {
  const { t } = useTranslation();
  const { pickImages } = useImageAttachmentPicker();
  const [text, setText] = useState("");
  const [images, setImages] = useState<AttachmentMetadata[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<EditingTextInputHandle | null>(null);
  // Attachment ids are retained for as long as they sit in this draft: the draft is component
  // state, not a stored draft, so nothing else tells the collector these bytes are in use.
  const retentionRef = useRef(new Map<string, () => void>());

  const retainImage = useCallback((attachment: AttachmentMetadata) => {
    if (retentionRef.current.has(attachment.id)) return;
    retentionRef.current.set(attachment.id, retainAttachmentForGarbageCollection(attachment.id));
  }, []);

  const releaseImage = useCallback((attachmentId: string) => {
    retentionRef.current.get(attachmentId)?.();
    retentionRef.current.delete(attachmentId);
  }, []);

  useEffect(() => {
    const retention = retentionRef.current;
    return () => {
      for (const release of retention.values()) {
        release();
      }
      retention.clear();
    };
  }, []);

  const addImages = useCallback(
    (next: readonly AttachmentMetadata[]) => {
      if (next.length === 0) return;
      for (const attachment of next) {
        retainImage(attachment);
      }
      setImages((current) => [...current, ...next]);
    },
    [retainImage],
  );

  const handleRemoveImage = useCallback(
    (attachmentId: string) => {
      releaseImage(attachmentId);
      setImages((current) => current.filter((entry) => entry.id !== attachmentId));
    },
    [releaseImage],
  );

  const handlePickImage = useCallback(() => {
    void pickAndPersistImages({ pickImages, persister: memoImagePersister })
      .then(addImages)
      .catch((error) => {
        console.error("[AgentMemos] Failed to pick memo image:", error);
      });
  }, [addImages, pickImages]);

  // Native clipboard paste arrives through the input; web needs the DOM paste event, which the
  // shared EditingTextInput deliberately does not forward.
  const handleNativePaste = useCallback(
    (files: readonly NativePastedFile[]) => {
      void (async () => {
        try {
          const picked = normalizeNativePastedImages(files);
          addImages(
            await pickAndPersistImages({
              pickImages: async () => picked,
              persister: memoImagePersister,
            }),
          );
        } catch (error) {
          console.error("[AgentMemos] Failed to paste memo image:", error);
        }
      })();
    },
    [addImages],
  );

  useEffect(() => {
    if (!isWeb || !canAttachImages) return;
    const element = inputRef.current?.getNativeRef();
    if (!(element instanceof HTMLElement)) return;
    const handlePaste = (event: ClipboardEvent) => {
      const files = collectImageFilesFromClipboardData(event.clipboardData);
      if (files.length === 0) return;
      // Only swallow the default paste when the clipboard carries no text. Preventing it
      // unconditionally is what drops the text of a screenshot-plus-text copy.
      const hasText = (event.clipboardData?.getData("text/plain") ?? "").trim().length > 0;
      if (!hasText) {
        event.preventDefault();
      }
      void filesToImageAttachments(files)
        .then(addImages)
        .catch((error) => {
          console.error("[AgentMemos] Failed to paste memo image:", error);
        });
    };
    element.addEventListener("paste", handlePaste);
    return () => {
      element.removeEventListener("paste", handlePaste);
    };
  }, [addImages, canAttachImages]);

  const trimmedText = text.trim();
  const canSubmit = trimmedText.length > 0 && !isSubmitting;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    void (async () => {
      try {
        await onSubmit(trimmedText, images);
        for (const attachment of images) {
          releaseImage(attachment.id);
        }
        inputRef.current?.reset();
        setText("");
        setImages([]);
      } catch (error) {
        console.error("[AgentMemos] Failed to add memo:", error);
      } finally {
        setIsSubmitting(false);
      }
    })();
  }, [canSubmit, images, onSubmit, releaseImage, trimmedText]);

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <EditingTextInput
          ref={inputRef}
          initialValue=""
          onChangeText={setText}
          onSubmitEditing={submit}
          placeholder={t("agentMemos.placeholder")}
          autoFocus
          multiline={false}
          onPasteImages={canAttachImages && !isWeb ? handleNativePaste : undefined}
          style={styles.input}
          testID="agent-memo-input"
        />
        {canAttachImages ? (
          <Pressable
            onPress={handlePickImage}
            accessibilityRole="button"
            accessibilityLabel={t("agentMemos.attachImage")}
            testID="agent-memo-attach-image"
            style={styles.iconButton}
            hitSlop={6}
          >
            <ThemedImagePlus size={14} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t("agentMemos.add")}
          testID="agent-memo-submit"
          style={styles.iconButton}
          hitSlop={6}
        >
          <ThemedCheck size={14} />
        </Pressable>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t("common.actions.close")}
          testID="agent-memo-cancel"
          style={styles.iconButton}
          hitSlop={6}
        >
          <ThemedX size={14} />
        </Pressable>
      </View>
      {images.length > 0 ? (
        <View style={styles.imageRow}>
          {images.map((attachment) => (
            <MemoDraftImage
              key={attachment.id}
              attachment={attachment}
              onRemove={handleRemoveImage}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MemoDraftImage({
  attachment,
  onRemove,
}: {
  attachment: AttachmentMetadata;
  onRemove: (attachmentId: string) => void;
}) {
  const { t } = useTranslation();
  const url = useAttachmentPreviewUrl(attachment);
  const source = useMemo(() => (url ? { uri: url } : null), [url]);
  const handleRemove = useCallback(() => onRemove(attachment.id), [attachment.id, onRemove]);
  return (
    <View style={styles.thumbnail}>
      {source ? <Image source={source} style={styles.thumbnailImage} /> : null}
      <Pressable
        onPress={handleRemove}
        accessibilityRole="button"
        accessibilityLabel={t("composer.attachments.removeImage")}
        testID={`agent-memo-draft-image-remove-${attachment.id}`}
        style={styles.thumbnailRemove}
        hitSlop={6}
      >
        <ThemedX size={12} />
      </Pressable>
    </View>
  );
}

const THUMBNAIL_SIZE = 32;

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  input: {
    flex: 1,
    minWidth: 160,
  },
  iconButton: {
    padding: theme.spacing[1],
  },
  imageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: theme.borderRadius.sm,
    overflow: "hidden",
    backgroundColor: theme.colors.surface2,
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  thumbnailRemove: {
    position: "absolute",
    top: 0,
    right: 0,
    padding: 2,
    backgroundColor: theme.colors.surface1,
    borderBottomLeftRadius: theme.borderRadius.sm,
  },
}));
