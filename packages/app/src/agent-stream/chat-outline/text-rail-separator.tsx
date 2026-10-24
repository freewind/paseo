import type { ReactElement } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** 中间带序号，想找第几条就指着它说；用细线不用边框，免得每行看起来像个盒子。 */
export function ChatOutlineTextSeparator({
  index,
  seq,
}: {
  index: number;
  seq: number;
}): ReactElement {
  return (
    <View style={styles.separator} testID={`chat-outline-text-divider-${seq}`}>
      <View style={styles.line} />
      <Text style={styles.ordinal}>{`(${index + 1})`}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  separator: {
    flexDirection: "row",
    alignItems: "center",
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  ordinal: {
    paddingHorizontal: theme.spacing[2],
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
}));
