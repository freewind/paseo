import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { QuickReply } from "@getpaseo/protocol/messages";
import { ScrollView } from "@/components/ui/scroll-view";
import { QuickRepliesBar } from "@/quick-replies/quick-replies-bar";

/** 普通 Agent 与草稿共用的常用回复右栏内容。 */
export function QuickRepliesRightRail({
  replies,
  onSelect,
  onEdit,
}: {
  replies: QuickReply[];
  onSelect: (text: string) => void;
  onEdit: () => void;
}) {
  return (
    <View style={styles.section}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator>
        <QuickRepliesBar replies={replies} onSelect={onSelect} onEdit={onEdit} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    flex: 1,
    minHeight: 0,
    paddingTop: theme.spacing[3],
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
}));
