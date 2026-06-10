import { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { GameSession, genId, getSessions, saveSession, deleteSession } from "../lib/store";

export default function Home() {
  const router = useRouter();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [newName, setNewName] = useState("");

  const loadSessions = useCallback(async () => {
    const data = await getSessions();
    setSessions(data);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const createSession = async () => {
    const name = newName.trim() || `记分局 ${sessions.length + 1}`;
    const session: GameSession = {
      id: genId(),
      name,
      createdAt: new Date().toISOString(),
      members: [],
      rounds: [],
    };
    await saveSession(session);
    setNewName("");
    router.push(`/session/${session.id}`);
  };

  const confirmDelete = (session: GameSession) => {
    if (session.locked) {
      Alert.alert("已锁定", "这个记分局已锁定，不能删除。");
      return;
    }
    Alert.alert("删除记分局", `确定删除"${session.name}"吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSession(session.id);
            loadSessions();
          } catch (error) {
            Alert.alert("删除失败", error instanceof Error ? error.message : "请稍后再试");
          }
        },
      },
    ]);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="记分局名称（可选）"
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={createSession}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.createBtn} onPress={createSession}>
          <Text style={styles.createBtnText}>新建</Text>
        </TouchableOpacity>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>暂无记分局</Text>
          <Text style={styles.emptyHint}>点击上方"新建"开始记分</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/session/${item.id}`)}
              onLongPress={() => confirmDelete(item)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  {item.locked && <Text style={styles.lockBadge}>已锁定</Text>}
                </View>
                <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.cardInfo}>
                  {item.members.length} 人 · {item.rounds.length} 轮
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  inputRow: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  createBtn: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  createBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  cardName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
    flexShrink: 1,
  },
  lockBadge: {
    fontSize: 12,
    color: "#8E8E93",
    backgroundColor: "#F2F2F7",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  cardDate: {
    fontSize: 13,
    color: "#8E8E93",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardInfo: {
    fontSize: 14,
    color: "#8E8E93",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 18,
    color: "#8E8E93",
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: 14,
    color: "#C7C7CC",
  },
});
