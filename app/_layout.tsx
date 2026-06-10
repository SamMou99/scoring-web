import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerTintColor: "#007AFF" }}>
      <Stack.Screen name="index" options={{ title: "记分板" }} />
      <Stack.Screen
        name="session/[id]"
        options={{ title: "记分局", headerBackTitle: "返回" }}
      />
    </Stack>
  );
}
