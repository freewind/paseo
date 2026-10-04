import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Split } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ICON_SIZE, type Theme } from "@/styles/theme";

export type AssistantForkTarget = "tab" | "workspace";

/**
 * How the fork is made. A `context` fork copies curated history into a fresh
 * session; a `session` fork branches the provider's own session, so the copy
 * carries every tool call and result and keeps the provider's prompt cache warm.
 */
export type AssistantForkMode = "context" | "session";

export interface AssistantForkChoice {
  mode: AssistantForkMode;
  target: AssistantForkTarget;
}

interface AssistantForkMenuProps {
  onFork: (choice: AssistantForkChoice) => Promise<void> | void;
  /** Session forks need a host that can branch a provider session. */
  supportsSessionFork: boolean;
  testID?: string;
}

const CONTEXT_TAB: AssistantForkChoice = { mode: "context", target: "tab" };
const CONTEXT_WORKSPACE: AssistantForkChoice = { mode: "context", target: "workspace" };

const ThemedSplit = withUnistyles(Split);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export const AssistantForkMenu = memo(function AssistantForkMenu({
  onFork,
  supportsSessionFork,
  testID = "assistant-fork-menu",
}: AssistantForkMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState<AssistantForkChoice | null>(null);
  const isLocked = pending !== null;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && pending !== null) return;
      setIsOpen(next);
    },
    [pending],
  );

  const handleSelect = useCallback(
    (choice: AssistantForkChoice) => async () => {
      if (isLocked) return;
      setPending(choice);
      try {
        await onFork(choice);
      } finally {
        setPending(null);
        setIsOpen(false);
      }
    },
    [isLocked, onFork],
  );

  const statusFor = useCallback(
    (choice: AssistantForkChoice) => {
      if (pending?.mode !== choice.mode || pending.target !== choice.target) return undefined;
      return "pending" as const;
    },
    [pending],
  );

  const triggerStyle = useCallback(
    () => [styles.trigger, isLocked ? styles.triggerDisabled : null],
    [isLocked],
  );

  const tooltipContent = useMemo(
    () => (
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{t("message.actions.forkMenu")}</Text>
      </TooltipContent>
    ),
    [t],
  );

  const forkIcon = useMemo(
    () => <ThemedSplit size={ICON_SIZE.sm} uniProps={foregroundColorMapping} />,
    [],
  );

  // A session fork is a different operation, not a different destination, so it
  // reads as its own labelled group rather than four undifferentiated rows.
  const sessionItems = supportsSessionFork
    ? ([
        { mode: "session", target: "tab" },
        { mode: "session", target: "workspace" },
      ] as const satisfies AssistantForkChoice[])
    : [];

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild>
          <View style={styles.triggerSlot} collapsable={false}>
            <DropdownMenuTrigger
              accessibilityLabel={t("message.actions.forkMenu")}
              accessibilityRole="button"
              disabled={isLocked}
              style={triggerStyle}
              testID={`${testID}-trigger`}
            >
              {({ hovered, open }) => (
                <ThemedSplit
                  size={ICON_SIZE.sm}
                  uniProps={hovered || open ? foregroundColorMapping : foregroundMutedColorMapping}
                />
              )}
            </DropdownMenuTrigger>
          </View>
        </TooltipTrigger>
        {tooltipContent}
      </Tooltip>
      <DropdownMenuContent align="start" minWidth={240} side="bottom" testID={`${testID}-content`}>
        {supportsSessionFork ? (
          <>
            <DropdownMenuLabel>{t("message.actions.forkSessionGroup")}</DropdownMenuLabel>
            {sessionItems.map((choice) => (
              <DropdownMenuItem
                key={choice.target}
                closeOnSelect={false}
                disabled={isLocked && statusFor(choice) === undefined}
                leading={forkIcon}
                onSelect={handleSelect(choice)}
                status={statusFor(choice)}
                testID={`${testID}-session-${choice.target}`}
              >
                {choice.target === "tab"
                  ? t("message.actions.forkSessionInNewTab")
                  : t("message.actions.forkSessionInNewWorkspace")}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          closeOnSelect={false}
          leading={forkIcon}
          disabled={isLocked && statusFor(CONTEXT_TAB) === undefined}
          onSelect={handleSelect(CONTEXT_TAB)}
          status={statusFor(CONTEXT_TAB)}
          testID={`${testID}-new-tab`}
        >
          {t("message.actions.forkInNewTab")}
        </DropdownMenuItem>
        <DropdownMenuItem
          closeOnSelect={false}
          leading={forkIcon}
          disabled={isLocked && statusFor(CONTEXT_WORKSPACE) === undefined}
          onSelect={handleSelect(CONTEXT_WORKSPACE)}
          status={statusFor(CONTEXT_WORKSPACE)}
          testID={`${testID}-new-workspace`}
        >
          {t("message.actions.forkInNewWorkspace")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

const styles = StyleSheet.create((theme) => ({
  trigger: {
    padding: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  triggerDisabled: {
    opacity: theme.opacity[50],
  },
  triggerSlot: {
    alignSelf: "center",
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
