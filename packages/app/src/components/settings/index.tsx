import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  SettingsRowProps,
  SettingsSwitchProps,
  SettingsSelectProps,
  SettingsInputProps,
  SettingsActionProps,
} from "@getpaseo/plugin/client/ui";
import type { EditingTextInputHandle } from "@/components/ui/text-input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FormTextInput } from "@/components/ui/form-field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isDev } from "@/constants/platform";
import { settingsStyles } from "@/styles/settings";
import { ControlSizeProvider } from "@/components/ui/control-size";
import { HighlightedText } from "@/components/ui/highlighted-text";
import {
  settingsAllIndexedLabels,
  settingsHighlightRanges,
} from "@/screens/settings/settings-search-index";
import { useSettingsSearchQuery } from "@/stores/settings-search-store";
import type { SettingsSectionSlug } from "@/utils/host-routes";
import { useSettingsRowLayout } from "./row-density";
export { SettingsGroup } from "./headings/settings-group";
export { SettingsSection } from "./headings/settings-section";
export { SettingsCollapsibleRow } from "./collapsible-row";
export { SettingsDetailRow } from "./detail-row";
export { SettingsInfoTip } from "./headings/settings-info-tip";

const SettingsSearchSectionContext = createContext<SettingsSectionSlug | null>(null);

/**
 * 声明其下设置行所属的分区。搜索索引与分区组件是两份手工维护的清单，这层 Context 让
 * 每一行在 dev 下核对自己在不在索引里。
 */
export function SettingsSearchSectionProvider({
  section,
  children,
}: {
  section: SettingsSectionSlug;
  children: ReactNode;
}) {
  return (
    <SettingsSearchSectionContext.Provider value={section}>
      {children}
    </SettingsSearchSectionContext.Provider>
  );
}

const reportedMissingLabels = new Set<string>();

/**
 * 行文案来自运行时数据的分区（文件名、插件名）：索引本来就不收这类行，校验跳过。
 */
const runtimeLabelledSections: ReadonlySet<SettingsSectionSlug> = new Set(["files"]);

/**
 * 漏登记的行搜不到，typecheck 也发现不了。dev 下每行报一次，把「想起来去补索引」变成
 * 「打开这个分区就看见」。只覆盖走 SettingsRow 的行；直接用 settingsStyles.row 手写的
 * 行没有统一入口，不在校验范围内。
 */
function useSettingsIndexRegistration(label: string): void {
  const section = useContext(SettingsSearchSectionContext);
  useEffect(() => {
    if (!isDev || !section) return;
    if (runtimeLabelledSections.has(section)) return;
    if (settingsAllIndexedLabels().has(label)) return;
    const reportedKey = `${section}\u0000${label}`;
    if (reportedMissingLabels.has(reportedKey)) return;
    reportedMissingLabels.add(reportedKey);
    console.error(
      `[settings-search] "${label}" 未登记到 ${section} 分区的索引，搜索找不到这一行。把它的 i18n key 加进 SETTINGS_SEARCH_INDEX。`,
    );
  }, [section, label]);
}

/** What app screens can add to a plugin-facing row: an accessory beside the label, such as an info tip. */
interface AppRowExtras {
  labelAccessory?: ReactNode;
}

interface AppSettingsRowProps extends Omit<SettingsRowProps, "hint">, AppRowExtras {
  hint?: ReactNode;
}

export function SettingsCard({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={settingsStyles.card} testID={testID}>
      {Children.toArray(children).map((child, index) => (
        <View
          key={isValidElement(child) ? child.key : index}
          style={index ? settingsStyles.rowBorder : undefined}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

export function SettingsRow({
  label,
  labelAccessory,
  hint,
  error,
  children,
  testID,
}: AppSettingsRowProps) {
  useSettingsIndexRegistration(label);
  const compact = useIsCompactFormFactor();
  const layout = useSettingsRowLayout();
  const searchQuery = useSettingsSearchQuery();
  const rowStyle = useMemo(() => [layout.row, compact && styles.compactRow], [compact, layout]);
  const accessoryTitleStyle = useMemo(() => [layout.title, styles.accessoryLabel], [layout]);
  // 高亮只标屏幕上显示的这份文案。筛选时行文案还会额外按英文解析（见 settingsSectionsMatching），
  // 所以中文界面下用英文名（tts、vim）命中的行会进结果列表，却在这里标不出位置、不带高亮；
  // 这是被接受的取舍，不是渲染漏标。
  const labelRanges = useMemo(
    () => settingsHighlightRanges(searchQuery, label),
    [searchQuery, label],
  );
  return (
    <View style={rowStyle} testID={testID}>
      <View style={styles.label}>
        {labelAccessory ? (
          <View style={styles.labelRow}>
            <HighlightedText text={label} ranges={labelRanges} style={accessoryTitleStyle} />
            {labelAccessory}
          </View>
        ) : (
          <HighlightedText text={label} ranges={labelRanges} style={layout.title} />
        )}
        {typeof hint === "string" ? <Text style={layout.hint}>{hint}</Text> : hint}
        {error ? (
          <Text accessibilityRole="alert" style={settingsStyles.rowError}>
            {error}
          </Text>
        ) : null}
      </View>
      {children ? (
        <View style={styles.control}>
          <ControlSizeProvider size={layout.controlSize}>{children}</ControlSizeProvider>
        </View>
      ) : null}
    </View>
  );
}

export function SettingsSwitch({ value, onValueChange, disabled, ...row }: SettingsSwitchProps) {
  return (
    <SettingsRow {...row}>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={row.label}
      />
    </SettingsRow>
  );
}

function SettingsOption<Value extends string>({
  option,
  selected,
  onValueChange,
}: {
  option: { label: string; value: Value };
  selected: boolean;
  onValueChange(value: Value): void;
}) {
  const select = useCallback(() => onValueChange(option.value), [onValueChange, option.value]);
  return (
    <DropdownMenuItem selected={selected} onSelect={select}>
      {option.label}
    </DropdownMenuItem>
  );
}

export function SettingsSelect<Value extends string>({
  value,
  options,
  onValueChange,
  disabled,
  ...row
}: SettingsSelectProps<Value> & AppRowExtras) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;
  return (
    <SettingsRow {...row}>
      <DropdownMenu>
        <DropdownTrigger
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${row.label}: ${selectedLabel}`}
        >
          {selectedLabel}
        </DropdownTrigger>
        <DropdownMenuContent side="bottom" align="end" width={220}>
          {options.map((option) => (
            <SettingsOption
              key={option.value}
              option={option}
              selected={option.value === value}
              onValueChange={onValueChange}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SettingsRow>
  );
}

export function SettingsInput({
  initialValue,
  onChangeText,
  placeholder,
  disabled,
  secureTextEntry,
  ref,
  ...row
}: SettingsInputProps & AppRowExtras) {
  const compact = useIsCompactFormFactor();
  const input = useRef<EditingTextInputHandle>(null);
  useImperativeHandle(
    ref,
    () => ({
      focus: () => input.current?.focus(),
      blur: () => input.current?.blur(),
      getText: () => input.current?.getText() ?? "",
      replaceText: (text) => input.current?.replaceText(text),
    }),
    [],
  );
  return (
    <SettingsRow {...row}>
      <FormTextInput
        ref={input}
        initialValue={initialValue}
        onChangeText={onChangeText}
        placeholder={placeholder}
        editable={!disabled}
        secureTextEntry={secureTextEntry}
        accessibilityLabel={row.label}
        size={compact ? "md" : undefined}
        style={styles.input}
      />
    </SettingsRow>
  );
}

export function SettingsAction({ actionLabel, onPress, disabled, ...row }: SettingsActionProps) {
  return (
    <SettingsRow {...row}>
      <Button variant="outline" onPress={onPress} disabled={disabled}>
        {actionLabel}
      </Button>
    </SettingsRow>
  );
}

const styles = StyleSheet.create((theme) => ({
  compactRow: { flexWrap: "wrap", gap: theme.spacing[3] },
  label: { flexGrow: 1, flexShrink: 1, flexBasis: 160, marginRight: theme.spacing[3] },
  labelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  accessoryLabel: { flexShrink: 1, minWidth: 0 },
  control: { flexShrink: 1, maxWidth: "100%" },
  input: { minWidth: 180 },
}));
