import { StyleSheet } from "react-native";

export const colors = {
  background: "#080808",
  surface: "#151318",
  elevated: "#211c24",
  border: "#39313d",
  text: "#fff8f6",
  muted: "#b5aeb6",
  accent: "#e21b50",
  gold: "#ffc979",
  danger: "#ff786f",
  success: "#7dd6a7",
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 22, gap: 16, flexGrow: 1 },
  brand: { color: colors.text, fontSize: 13, fontWeight: "800", letterSpacing: 2 },
  eyebrow: { color: colors.gold, fontSize: 11, fontWeight: "800", letterSpacing: 2, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 30, fontWeight: "800", lineHeight: 36 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 },
  input: { backgroundColor: colors.elevated, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  button: { alignItems: "center", justifyContent: "center", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 13, backgroundColor: colors.accent, minHeight: 48 },
  buttonSecondary: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.text, fontWeight: "800", fontSize: 15 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  error: { color: colors.danger, fontSize: 14 },
  success: { color: colors.success, fontSize: 14 },
});
