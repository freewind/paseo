import { useCallback, useMemo, useRef, useState, type ReactElement } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { ChevronDown, Cpu } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { Combobox, ComboboxItem, type ComboboxProps } from "@/components/ui/combobox";

const ThemedCpu = withUnistyles(Cpu);
const ThemedChevronDown = withUnistyles(ChevronDown);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export const ALL_MODELS_OPTION_ID = "__all_models__";

export interface ModelFilterOption {
  /** The model id this option filters by, or the all-models sentinel. */
  id: string;
  label: string;
}

export interface ModelFilterProps {
  options: ModelFilterOption[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  triggerTestID?: string;
  optionTestID?: (modelId: string) => string;
}

/**
 * The "All models / <model>" pill next to the project and host filters on the History screen.
 *
 * Unlike those two, this one filters in the list rather than on the daemon: history has no model
 * filter, and the options are the models the loaded pages actually contain. A session whose model
 * has not been loaded yet therefore cannot be filtered on — it appears once its page arrives.
 */
export function ModelFilter({
  options,
  selectedModel,
  onSelectModel,
  triggerTestID,
  optionTestID,
}: ModelFilterProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<View>(null);

  const selectedLabel = useMemo(
    () => options.find((option) => option.id === selectedModel)?.label ?? options[0]?.label ?? "",
    [options, selectedModel],
  );

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleSelect = useCallback(
    (id: string) => {
      onSelectModel(id);
      setIsOpen(false);
    },
    [onSelectModel],
  );

  const triggerStyle = useCallback(
    ({ pressed, hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.trigger,
      Boolean(hovered) && styles.triggerHovered,
      pressed && styles.triggerPressed,
    ],
    [],
  );

  const comboboxOptions = useMemo(
    () => options.map((option) => ({ id: option.id, label: option.label })),
    [options],
  );

  const renderOption = useCallback(
    (input: Parameters<NonNullable<ComboboxProps["renderOption"]>>[0]) => (
      <ComboboxItem
        label={input.option.label}
        selected={input.selected}
        active={input.active}
        onPress={input.onPress}
        testID={optionTestID?.(input.option.id)}
      />
    ),
    [optionTestID],
  );

  return (
    <>
      <View ref={anchorRef} collapsable={false} style={styles.triggerWrap}>
        <Pressable
          onPress={handleOpen}
          style={triggerStyle}
          testID={triggerTestID}
          accessibilityRole="button"
          accessibilityLabel={`Filter: ${selectedLabel}`}
        >
          <ThemedCpu size={14} uniProps={mutedColorMapping} />
          <Text style={styles.triggerText} numberOfLines={1}>
            {selectedLabel}
          </Text>
          <ThemedChevronDown size={14} uniProps={mutedColorMapping} />
        </Pressable>
      </View>
      <Combobox
        options={comboboxOptions}
        value={selectedModel}
        onSelect={handleSelect}
        renderOption={renderOption}
        title="Filter by model"
        desktopPlacement="bottom-start"
        open={isOpen}
        onOpenChange={setIsOpen}
        anchorRef={anchorRef}
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  triggerWrap: {
    alignSelf: "flex-start",
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    alignSelf: "flex-start",
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  triggerPressed: {
    backgroundColor: theme.colors.surface3,
  },
  triggerText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    // Model ids run long; the pill keeps its neighbours place and the list shows the rest.
    maxWidth: 180,
  },
}));
