import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check, ImagePlus, X } from "lucide-react-native";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { PressHighlight } from "@/components/ui/press-highlight";
import type { AttachmentMetadata } from "@/attachments/types";
import type { ImageAttachment } from "@getpaseo/protocol/messages";
import { persistAttachmentFromBlob } from "@/attachments/service";
import { persistAttachmentFromDataUrl } from "@/attachments/service";
import { persistAttachmentFromFileUri } from "@/attachments/service";
import { retainAttachmentForGarbageCollection } from "@/attachments/gc-retention";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import { useToast } from "@/contexts/toast-context";
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
/** `placeholderTextColor` 是 prop 不是 style，和图标一样走主题映射。 */
const MemoTextInput = withUnistyles(EditingTextInput, (theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
}));

/** 与 composer 用同一组持久化函数，备忘图片就住在同一个附件存储里。 */
const memoImagePersister = {
  persistFromBlob: persistAttachmentFromBlob,
  persistFromDataUrl: persistAttachmentFromDataUrl,
  persistFromFileUri: persistAttachmentFromFileUri,
};

/**
 * 一条备忘的文字加图片。
 *
 * 图片以 `kind: "image"` 的附件元数据进入草稿，与 composer 形状一致，
 * 所以预览、删除、GC 保留期都直接沿用现有实现。草稿打开期间字节留在
 * 附件存储里，只有提交路径才把它们编码成 daemon 存的内联 base64。

 *
 * 编辑既有备忘时，用它的文字和已存图片初始化草稿。已存图片是随备忘保存的内联
 * base64，不在附件存储里，所以直接从 data URL 预览；没删掉就原样交回。

 */
export function AgentMemoComposer({
  onSubmit,
  onCancel,
  canAttachImages,
  initialText = "",
  initialImages,
  submitLabel,
}: {
  onSubmit: (
    text: string,
    images: readonly AttachmentMetadata[],
    keptImages: readonly ImageAttachment[],
  ) => Promise<void>;
  onCancel: () => void;
  /** 宿主能力：没有它就只会存下备忘文字并丢掉图片。 */
  canAttachImages: boolean;
  /** 编辑时用原文字初始化；新建备忘从空开始。 */
  initialText?: string;
  /** 备忘已存的图片；用户没删就保留。 */
  initialImages?: readonly ImageAttachment[];
  /** 提交按钮文案：新建是添加，编辑是保存。 */
  submitLabel?: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { pickImages } = useImageAttachmentPicker();
  const [text, setText] = useState(initialText);
  const [images, setImages] = useState<AttachmentMetadata[]>([]);
  // 已存图片没有 id，草稿给每条套一个稳定 id 用于 key 与删除。
  const [keptImages, setKeptImages] = useState<KeptMemoImage[]>(() =>
    (initialImages ?? []).map((image, index) => ({ id: `stored-${index}`, image })),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<EditingTextInputHandle | null>(null);
  // 图片留在草稿里期间一直持有附件 id 的保留引用：草稿是组件状态，
  // 不是持久化草稿，没有别的地方告诉 GC 这些字节还在用。
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

  const handleRemoveKeptImage = useCallback((id: string) => {
    setKeptImages((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const handlePickImage = useCallback(() => {
    void pickAndPersistImages({ pickImages, persister: memoImagePersister })
      .then(addImages)
      .catch((error) => {
        console.error("[AgentMemos] Failed to pick memo image:", error);
      });
  }, [addImages, pickImages]);

  // 粘贴反馈：图片一落地就显示占位预览，持久化完成后换成真实缩略图；
  // 失败则移除占位并提示，而不是悄悄消失。

  const [pendingImages, setPendingImages] = useState<
    Array<{ id: string; previewUri: string | null }>
  >([]);
  const pasteSequenceRef = useRef(0);

  const resolvePending = useCallback((pendingId: string) => {
    setPendingImages((current) => current.filter((entry) => entry.id !== pendingId));
  }, []);

  const notifyPasteFailure = useCallback(() => {
    // 粘贴失败要可见，不能吞掉。
    toast.error(t("agentMemos.pasteFailed"));
  }, [t, toast]);

  // 原生粘贴从输入框进来；web 需要 DOM paste 事件，而共用的 EditingTextInput 有意不转发它。

  const handleNativePaste = useCallback(
    (files: readonly NativePastedFile[]) => {
      const pendingId = `paste-${++pasteSequenceRef.current}`;
      const previewUri = files[0]?.uri ?? null;
      setPendingImages((current) => [...current, { id: pendingId, previewUri }]);
      void (async () => {
        try {
          const picked = normalizeNativePastedImages(files);
          const next = await pickAndPersistImages({
            pickImages: async () => picked,
            persister: memoImagePersister,
          });
          resolvePending(pendingId);
          addImages(next);
        } catch (error) {
          resolvePending(pendingId);
          console.error("[AgentMemos] Failed to paste memo image:", error);
          notifyPasteFailure();
        }
      })();
    },
    [addImages, notifyPasteFailure, resolvePending],
  );

  useEffect(() => {
    if (!isWeb || !canAttachImages) return;
    const element = inputRef.current?.getNativeRef();
    if (!(element instanceof HTMLElement)) return;
    const handlePaste = (event: ClipboardEvent) => {
      const files = collectImageFilesFromClipboardData(event.clipboardData);
      if (files.length === 0) return;
      // 只有剪贴板没有文字时才吞掉默认粘贴；无条件 preventDefault 会丢掉「截图+文字」里的文字。

      const hasText = (event.clipboardData?.getData("text/plain") ?? "").trim().length > 0;
      if (!hasText) {
        event.preventDefault();
      }
      // 即时反馈：每个粘贴文件先显示预览，持久化后由真实缩略图替换占位。

      const pendingId = `paste-${++pasteSequenceRef.current}`;
      const previewUrls = files.map((entry) => {
        try {
          return URL.createObjectURL(entry.file);
        } catch {
          return null;
        }
      });
      const previewUri = previewUrls.find((url) => url !== null) ?? null;
      setPendingImages((current) => [...current, { id: pendingId, previewUri }]);
      void (async () => {
        try {
          const next = await filesToImageAttachments(files);
          for (const url of previewUrls) {
            if (url) URL.revokeObjectURL(url);
          }
          resolvePending(pendingId);
          addImages(next);
        } catch (error) {
          for (const url of previewUrls) {
            if (url) URL.revokeObjectURL(url);
          }
          resolvePending(pendingId);
          console.error("[AgentMemos] Failed to paste memo image:", error);
          notifyPasteFailure();
        }
      })();
    };
    element.addEventListener("paste", handlePaste);
    return () => {
      element.removeEventListener("paste", handlePaste);
    };
  }, [addImages, canAttachImages, notifyPasteFailure, resolvePending]);

  const trimmedText = text.trim();
  // 还在持久化的粘贴会让提交缺图，所以提交要等它完成。
  const canSubmit = trimmedText.length > 0 && !isSubmitting && pendingImages.length === 0;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    void (async () => {
      try {
        await onSubmit(
          trimmedText,
          images,
          keptImages.map((entry) => entry.image),
        );
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
  }, [canSubmit, images, keptImages, onSubmit, releaseImage, trimmedText]);

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <MemoTextInput
          ref={inputRef}
          initialValue={initialText}
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
          <ToolbarButton
            label={t("agentMemos.attachImage")}
            onPress={handlePickImage}
            testID="agent-memo-attach-image"
          >
            <ThemedImagePlus size={14} />
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          label={submitLabel ?? t("common.actions.add")}
          onPress={submit}
          disabled={!canSubmit}
          testID="agent-memo-submit"
        >
          <ThemedCheck size={14} />
        </ToolbarButton>
        <ToolbarButton
          label={t("common.actions.close")}
          onPress={onCancel}
          testID="agent-memo-cancel"
        >
          <ThemedX size={14} />
        </ToolbarButton>
      </View>
      {keptImages.length > 0 || images.length > 0 || pendingImages.length > 0 ? (
        <View style={styles.imageRow}>
          {pendingImages.map((entry) => (
            <PendingPasteImage key={entry.id} uri={entry.previewUri} />
          ))}
          {keptImages.map((entry) => (
            <MemoStoredImage
              key={entry.id}
              image={entry.image}
              id={entry.id}
              onRemove={handleRemoveKeptImage}
            />
          ))}
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

/** 已存备忘图片：内联 base64，从保留集合里移除即删除。 */
function MemoStoredImage({
  image,
  id,
  onRemove,
}: {
  image: ImageAttachment;
  id: string;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const source = useMemo(
    () => ({ uri: `data:${image.mimeType};base64,${image.data}` }),
    [image.data, image.mimeType],
  );
  const handleRemove = useCallback(() => onRemove(id), [id, onRemove]);
  return (
    <View style={styles.thumbnail}>
      <Image source={source} style={styles.thumbnailImage} />
      <PressHighlight
        onPress={handleRemove}
        accessibilityRole="button"
        accessibilityLabel={t("composer.attachments.removeImage")}
        testID={`agent-memo-kept-image-remove-${id}`}
        style={styles.thumbnailRemove}
        highlightStyle={styles.thumbnailRemoveHighlight}
        hitSlop={6}
      >
        <ThemedX size={12} />
      </PressHighlight>
    </View>
  );
}

/** 粘贴后尚未持久化的图片：只是本地预览，背后还没有附件。 */
function PendingPasteImage({ uri }: { uri: string | null }) {
  const source = useMemo(() => (uri ? { uri } : null), [uri]);
  return (
    <View style={styles.thumbnail} testID="agent-memo-pending-image">
      {source ? <Image source={source} style={styles.thumbnailImage} /> : null}
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
      <PressHighlight
        onPress={handleRemove}
        accessibilityRole="button"
        accessibilityLabel={t("composer.attachments.removeImage")}
        testID={`agent-memo-draft-image-remove-${attachment.id}`}
        style={styles.thumbnailRemove}
        highlightStyle={styles.thumbnailRemoveHighlight}
        hitSlop={6}
      >
        <ThemedX size={12} />
      </PressHighlight>
    </View>
  );
}

const THUMBNAIL_SIZE = 32;

/** 已存备忘图片，加上草稿本地 id 用于 key 与删除。 */
interface KeptMemoImage {
  id: string;
  image: ImageAttachment;
}

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
    // 这一行被弹层宽度限制，输入框必须让位：这里设最小宽度会把行挤出内容区、
    // 连输入框自己的边都会被裁掉。
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    // 不关掉的话浏览器会画自己的焦点环与表单颜色，跟随平台外观而不是应用主题。

    ...(isWeb
      ? ({ outlineStyle: "none", outlineWidth: 0, outlineColor: "transparent" } as object)
      : {}),
  },
  thumbnailRemoveHighlight: {
    backgroundColor: theme.colors.surface2,
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
    // 与 rail 同一条规则：边框取背景的反色，浅色或深色图片贴着相近表面时仍有边界。

    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.foreground,
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
