import { useCallback, useMemo, useRef, useState, type ReactElement } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { ChevronDown, Folder } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { Combobox, ComboboxItem, type ComboboxProps } from "@/components/ui/combobox";

const ThemedFolder = withUnistyles(Folder);
const ThemedChevronDown = withUnistyles(ChevronDown);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export const ALL_PROJECTS_OPTION_ID = "__all_projects__";

export interface ProjectFilterOption {
  /** The server-side `projectKey` this option filters by, or the all-projects sentinel. */
  id: string;
  label: string;
}

export interface ProjectFilterProps {
  options: ProjectFilterOption[];
  selectedProject: string;
  onSelectProject: (projectKey: string) => void;
  triggerTestID?: string;
  optionTestID?: (projectKey: string) => string;
}

/**
 * The "All projects / <project>" pill next to the host filter on the History screen: an anchored
 * Combobox over the projects the connected hosts expose. The selected value is a server-side
 * `projectKey` (or the all-projects sentinel), so the filter runs on the daemon, not in the list.
 */
export function ProjectFilter({
  options,
  selectedProject,
  onSelectProject,
  triggerTestID,
  optionTestID,
}: ProjectFilterProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<View>(null);

  const selectedLabel = useMemo(
    () => options.find((option) => option.id === selectedProject)?.label ?? options[0]?.label ?? "",
    [options, selectedProject],
  );

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleSelect = useCallback(
    (id: string) => {
      onSelectProject(id);
      setIsOpen(false);
    },
    [onSelectProject],
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
          {selectedProject === ALL_PROJECTS_OPTION_ID ? (
            <ThemedFolder size={14} uniProps={mutedColorMapping} />
          ) : (
            <ThemedFolder size={14} uniProps={mutedColorMapping} />
          )}
          <Text style={styles.triggerText} numberOfLines={1}>
            {selectedLabel}
          </Text>
          <ThemedChevronDown size={14} uniProps={mutedColorMapping} />
        </Pressable>
      </View>
      <Combobox
        options={comboboxOptions}
        value={selectedProject}
        onSelect={handleSelect}
        renderOption={renderOption}
        title="Filter by project"
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
  },
}));
