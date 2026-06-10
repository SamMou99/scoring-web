import { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  GameSession,
  Member,
  genId,
  saveSession,
  subscribeToSession,
  calculateRoundScores,
  getTotalScores,
} from "../../lib/store";

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<GameSession | null>(null);
  const [memberName, setMemberName] = useState("");
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [baseScore, setBaseScore] = useState("10");
  const [dealerId, setDealerId] = useState("");
  const [winnerIds, setWinnerIds] = useState<string[]>([]);
  const [loserIds, setLoserIds] = useState<string[]>([]);
  const [roundNote, setRoundNote] = useState("");
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = subscribeToSession(id, (s) => {
      if (!s) {
        router.back();
        return;
      }
      setSession(s);
    });
    return unsub;
  }, [id, router]);

  const persist = async (updated: GameSession) => {
    setSession(updated);
    await saveSession(updated);
  };

  if (!session) return <View style={styles.container} />;

  const onlineMembers = session.members.filter((m) => m.online);

  const addMember = async () => {
    const name = memberName.trim();
    if (!name) return;
    const member: Member = { id: genId(), name, online: true };
    await persist({ ...session, members: [...session.members, member] });
    setMemberName("");
  };

  const removeMember = async (mid: string) => {
    await persist({
      ...session,
      members: session.members.filter((m) => m.id !== mid),
    });
  };

  const toggleOnline = async (mid: string) => {
    await persist({
      ...session,
      members: session.members.map((m) =>
        m.id === mid ? { ...m, online: !m.online } : m
      ),
    });
  };

  const openRoundModal = (round?: { baseScore: number; dealerId: string; winnerIds: string[]; loserIds: string[]; note?: string }) => {
    if (onlineMembers.length < 2) {
      Alert.alert("提示", "至少需要2名在线成员");
      return;
    }
    if (round) {
      setBaseScore(String(round.baseScore));
      setDealerId(round.dealerId);
      setWinnerIds([...round.winnerIds]);
      setLoserIds([...round.loserIds]);
      setRoundNote(round.note || "");
      setEditingRoundId(null);
    } else {
      setBaseScore("10");
      setDealerId("");
      setWinnerIds([]);
      setLoserIds([]);
      setRoundNote("");
      setEditingRoundId(null);
    }
    setShowRoundModal(true);
  };

  const toggleWinner = (mid: string) => {
    setWinnerIds((prev) =>
      prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]
    );
    setLoserIds((prev) => prev.filter((x) => x !== mid));
  };

  const toggleLoser = (mid: string) => {
    setLoserIds((prev) =>
      prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]
    );
    setWinnerIds((prev) => prev.filter((x) => x !== mid));
  };

  const openEditRoundModal = (round: typeof session.rounds[number]) => {
    setEditingRoundId(round.id);
    setBaseScore(String(round.baseScore));
    setDealerId(round.dealerId);
    setWinnerIds([...round.winnerIds]);
    setLoserIds([...round.loserIds]);
    setRoundNote(round.note || "");
    setShowRoundModal(true);
  };

  const confirmRound = async () => {
    const score = parseInt(baseScore, 10);
    if (isNaN(score) || score < 1 || score > 100) {
      Alert.alert("提示", "基础分需在1-100之间");
      return;
    }
    if (!dealerId) {
      Alert.alert("提示", "请选择庄家");
      return;
    }
    if (winnerIds.length === 0 && loserIds.length === 0) {
      Alert.alert("提示", "请至少选择一名赢家或输家");
      return;
    }
    const onlineIds = onlineMembers.map((m) => m.id);
    const scores = calculateRoundScores(onlineIds, dealerId, winnerIds, loserIds, score);

    const finalWinnerIds = [...winnerIds];
    const finalLoserIds = [...loserIds];
    if (scores[dealerId] > 0) {
      finalWinnerIds.push(dealerId);
    } else if (scores[dealerId] < 0) {
      finalLoserIds.push(dealerId);
    }

    if (editingRoundId) {
      const updatedRounds = session.rounds.map((r) =>
        r.id === editingRoundId
          ? { ...r, baseScore: score, dealerId, winnerIds: finalWinnerIds, loserIds: finalLoserIds, note: roundNote.trim(), scores }
          : r
      );
      await persist({ ...session, rounds: updatedRounds });
    } else {
      const round = {
        id: genId(),
        baseScore: score,
        dealerId,
        winnerIds: finalWinnerIds,
        loserIds: finalLoserIds,
        note: roundNote.trim(),
        scores,
        createdAt: new Date().toISOString(),
      };
      await persist({ ...session, rounds: [...session.rounds, round] });
    }
    setShowRoundModal(false);
    setEditingRoundId(null);
    setRoundNote("");
  };

  const deleteLastRound = async () => {
    if (session.rounds.length === 0) return;
    Alert.alert("撤销轮次", "确定撤销最后一轮？", [
      { text: "取消", style: "cancel" },
      {
        text: "撤销",
        style: "destructive",
        onPress: async () => {
          await persist({
            ...session,
            rounds: session.rounds.slice(0, -1),
          });
        },
      },
    ]);
  };

  const totals = getTotalScores(session);
  const getMemberName = (mid: string) =>
    session.members.find((m) => m.id === mid)?.name || "未知";

  const getRoundWinnersAndLosers = (round: typeof session.rounds[number]) => {
    const dealerScore = round.scores[round.dealerId] || 0;
    const winners = [...round.winnerIds];
    const losers = [...round.loserIds];
    if (dealerScore > 0) {
      winners.push(round.dealerId);
    } else if (dealerScore < 0) {
      losers.push(round.dealerId);
    }
    return { winners, losers, dealerScore };
  };



  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const nonDealerOnline = onlineMembers.filter((m) => m.id !== dealerId);

  const generateReportHtml = () => {
    const t = getTotalScores(session);
    const getName = (mid: string) =>
      session.members.find((m) => m.id === mid)?.name || "未知";

    const totalRows = [...session.members]
      .sort((a, b) => (t[b.id] || 0) - (t[a.id] || 0))
      .map((m) => {
        const score = t[m.id] || 0;
        const color = score > 0 ? "#34C759" : score < 0 ? "#FF3B30" : "#8E8E93";
        const sign = score > 0 ? "+" : "";
        return `<tr><td>${m.name}</td><td style="color:${color};font-weight:700;font-size:16px">${sign}${score}</td></tr>`;
      })
      .join("");

    const roundRows = session.rounds
      .map((round, i) => {
        const dealerScore = round.scores[round.dealerId] || 0;
        const dealerTag = dealerScore > 0 ? "赢" : dealerScore < 0 ? "输" : "平";
        const scoreEntries = Object.entries(round.scores)
          .filter(([, v]) => v !== 0)
          .sort(([, a], [, b]) => b - a)
          .map(([mid, score]) => {
            const isDealer = mid === round.dealerId;
            const tag = isDealer
              ? `<span style="font-size:10px;color:#fff;padding:1px 6px;border-radius:3px;font-weight:600;background:#FF9500">庄</span>`
              : round.winnerIds.includes(mid)
                ? `<span style="font-size:10px;color:#fff;padding:1px 6px;border-radius:3px;font-weight:600;background:#34C759">赢</span>`
                : `<span style="font-size:10px;color:#fff;padding:1px 6px;border-radius:3px;font-weight:600;background:#FF3B30">输</span>`;
            const color = score > 0 ? "#34C759" : score < 0 ? "#FF3B30" : "#8E8E93";
            const sign = score > 0 ? "+" : "";
            return `<tr><td>${getName(mid)} ${tag}</td><td style="color:${color};font-weight:600">${sign}${score}</td></tr>`;
          })
          .join("");
        const noteRow = round.note
          ? `<tr><td colspan="2" style="color:#8E8E93;font-style:italic;font-size:12px">备注: ${round.note}</td></tr>`
          : "";
        return `<div style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-weight:700;font-size:15px">第${i + 1}轮</span><span style="font-size:12px;color:#8E8E93">底分${round.baseScore} | 庄:${getName(round.dealerId)}(${dealerTag}) | ${new Date(round.createdAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</span></div><table style="width:100%;border-collapse:collapse">${scoreEntries}${noteRow}</table></div>`;
      })
      .join("");

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${session.name} - 成绩单</title><style>body{font-family:-apple-system,"PingFang SC",sans-serif;padding:24px;color:#1C1C1E;max-width:600px;margin:0 auto}h1{font-size:22px;text-align:center;margin-bottom:4px}.subtitle{text-align:center;color:#8E8E93;font-size:13px;margin-bottom:20px}h2{font-size:17px;color:#1C1C1E;margin-top:24px;border-bottom:2px solid #007AFF;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:6px 12px;border-bottom:1px solid #E5E5EA;font-size:14px}td:last-child{text-align:right}</style></head><body><h1>${session.name}</h1><div class="subtitle">${new Date(session.createdAt).toLocaleString("zh-CN")} | 共${session.rounds.length}轮 | ${session.members.length}人</div><h2>总分排行</h2><table><tbody>${totalRows}</tbody></table><h2>轮次明细</h2>${roundRows}</body></html>`;
  };

  const exportHtml = () => {
    const html = generateReportHtml();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.name || "成绩单"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.createdAt}>
          创建于 {new Date(session.createdAt).toLocaleString("zh-CN")}
        </Text>

        <View style={styles.shareRow}>
          <View style={styles.shareCodeBox}>
            <Text style={styles.shareLabel}>局号</Text>
            <Text style={styles.shareCode}>{session.id}</Text>
          </View>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={() => Alert.alert("局号", session.id)}
          >
            <Text style={styles.copyBtnText}>复制</Text>
          </TouchableOpacity>
        </View>

        {/* Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>成员管理</Text>
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              placeholder="输入名字"
              value={memberName}
              onChangeText={setMemberName}
              onSubmitEditing={addMember}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.addBtn} onPress={addMember}>
              <Text style={styles.addBtnText}>加入</Text>
            </TouchableOpacity>
          </View>
          {session.members.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <TouchableOpacity
                style={styles.memberRowLeft}
                onPress={() => toggleOnline(m.id)}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: m.online ? "#34C759" : "#C7C7CC" },
                  ]}
                />
                <Text style={[styles.memberName, !m.online && styles.offlineName]}>
                  {m.name}
                </Text>
                <Text style={styles.onlineLabel}>
                  {m.online ? "在线" : "离线"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeMember(m.id)}>
                <Text style={styles.removeBtn}>移除</Text>
              </TouchableOpacity>
            </View>
          ))}
          {session.members.length === 0 && (
            <Text style={styles.hint}>暂无成员，添加成员开始记分</Text>
          )}
        </View>

        {/* Scoreboard */}
        {session.rounds.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>总分排行</Text>
            {[...session.members]
              .sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0))
              .map((m) => (
                <View key={m.id} style={styles.scoreRow}>
                  <Text style={styles.scoreName}>{m.name}</Text>
                  <Text
                    style={[
                      styles.scoreValue,
                      {
                        color:
                          (totals[m.id] || 0) > 0
                            ? "#34C759"
                            : (totals[m.id] || 0) < 0
                              ? "#FF3B30"
                              : "#8E8E93",
                      },
                    ]}
                  >
                    {totals[m.id] > 0 ? "+" : ""}
                    {totals[m.id] || 0}
                  </Text>
                </View>
              ))}
          </View>
        )}

        {/* New Round & Export */}
        {onlineMembers.length >= 2 && (
          <View style={styles.roundActions}>
            <TouchableOpacity style={styles.newRoundBtn} onPress={() => openRoundModal()}>
              <Text style={styles.newRoundBtnText}>+ 新建轮次</Text>
            </TouchableOpacity>
            {session.rounds.length > 0 && (
              <TouchableOpacity style={styles.undoBtn} onPress={deleteLastRound}>
                <Text style={styles.undoBtnText}>撤销上一轮</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {session.rounds.length > 0 && (
          <TouchableOpacity style={styles.exportBtn} onPress={() => setShowReport(true)}>
            <Text style={styles.exportBtnText}>查看成绩单</Text>
          </TouchableOpacity>
        )}

        {/* Round History */}
        {session.rounds.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              轮次记录（共{session.rounds.length}轮）
            </Text>
            {[...session.rounds].reverse().map((round, idx) => {
              const rNum = session.rounds.length - idx;
              const isExpanded = expandedRound === round.id;
              return (
                <TouchableOpacity
                  key={round.id}
                  style={styles.roundCard}
                  onPress={() =>
                    setExpandedRound(isExpanded ? null : round.id)
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.roundHeader}>
                    <Text style={styles.roundNum}>第{rNum}轮</Text>
                    <View style={styles.roundHeaderRight}>
                      <Text style={styles.roundBase}>底分 {round.baseScore}</Text>
                      <Text style={styles.roundDealer}>
                        庄: {getMemberName(round.dealerId)}
                      </Text>
                      <Text style={styles.roundTime}>{formatTime(round.createdAt)}</Text>
                    </View>
                  </View>
                  {!isExpanded && (() => {
                    const { winners, losers } = getRoundWinnersAndLosers(round);
                    return (
                      <View style={styles.roundSummary}>
                        {winners.length > 0 && (
                          <Text style={styles.roundWinners}>
                            赢: {winners.map(getMemberName).join("、")}
                          </Text>
                        )}
                        {losers.length > 0 && (
                          <Text style={styles.roundLosers}>
                            输: {losers.map(getMemberName).join("、")}
                          </Text>
                        )}
                        {!!round.note && (
                          <Text style={styles.roundNote} numberOfLines={1}>
                            {round.note}
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                  {isExpanded && (
                    <View style={styles.roundDetail}>
                      <TouchableOpacity
                        style={styles.editRoundBtn}
                        onPress={() => openEditRoundModal(round)}
                      >
                        <Text style={styles.editRoundBtnText}>编辑此轮</Text>
                      </TouchableOpacity>
                      {Object.entries(round.scores)
                        .filter(([, v]) => v !== 0)
                        .sort(([, a], [, b]) => b - a)
                        .map(([mid, score]) => (
                          <View key={mid} style={styles.roundScoreRow}>
                            <Text style={styles.roundScoreName}>
                              {getMemberName(mid)}
                              {mid === round.dealerId ? " (庄" + ((round.scores[mid] || 0) > 0 ? "赢)" : (round.scores[mid] || 0) < 0 ? "输)" : ")") : ""}
                              {mid !== round.dealerId && round.winnerIds.includes(mid) ? " 赢" : ""}
                              {mid !== round.dealerId && round.loserIds.includes(mid) ? " 输" : ""}
                            </Text>
                            <Text
                              style={[
                                styles.roundScoreVal,
                                {
                                  color:
                                    score > 0
                                      ? "#34C759"
                                      : score < 0
                                        ? "#FF3B30"
                                        : "#8E8E93",
                                },
                              ]}
                            >
                              {score > 0 ? "+" : ""}
                              {score}
                            </Text>
                          </View>
                        ))}
                      {!!round.note && (
                        <Text style={styles.roundNoteExpanded}>{round.note}</Text>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Report Card Modal */}
      <Modal visible={showReport} animationType="slide">
        <View style={styles.reportContainer}>
          <View style={styles.reportHeader}>
            <TouchableOpacity onPress={() => setShowReport(false)}>
              <Text style={styles.reportClose}>关闭</Text>
            </TouchableOpacity>
            <Text style={styles.reportHeaderTitle}>成绩单</Text>
            <TouchableOpacity onPress={exportHtml}>
              <Text style={styles.reportExportBtn}>导出HTML</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.reportBody}>
            <Text style={styles.reportTitle}>{session.name}</Text>
            <Text style={styles.reportSubtitle}>
              {new Date(session.createdAt).toLocaleString("zh-CN")} | 共{session.rounds.length}轮 | {session.members.length}人
            </Text>

            <View style={styles.reportDivider} />
            <Text style={styles.reportSectionTitle}>总分排行</Text>
            {[...session.members]
              .sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0))
              .map((m) => {
                const score = totals[m.id] || 0;
                return (
                  <View key={m.id} style={styles.reportScoreRow}>
                    <Text style={styles.reportScoreName}>{m.name}</Text>
                    <Text
                      style={[
                        styles.reportScoreVal,
                        { color: score > 0 ? "#34C759" : score < 0 ? "#FF3B30" : "#8E8E93" },
                      ]}
                    >
                      {score > 0 ? "+" : ""}{score}
                    </Text>
                  </View>
                );
              })}

            <View style={styles.reportDivider} />
            <Text style={styles.reportSectionTitle}>轮次明细</Text>
            {session.rounds.map((round, i) => {
              const dealerScore = round.scores[round.dealerId] || 0;
              const dealerTag = dealerScore > 0 ? "赢" : dealerScore < 0 ? "输" : "平";
              return (
                <View key={round.id} style={styles.reportRound}>
                  <View style={styles.reportRoundHeader}>
                    <Text style={styles.reportRoundNum}>第{i + 1}轮</Text>
                    <Text style={styles.reportRoundMeta}>
                      底分{round.baseScore} | 庄:{getMemberName(round.dealerId)}({dealerTag}) | {formatTime(round.createdAt)}
                    </Text>
                  </View>
                  {Object.entries(round.scores)
                    .filter(([, v]) => v !== 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([mid, score]) => (
                      <View key={mid} style={styles.reportRoundScoreRow}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Text style={styles.reportRoundScoreName}>{getMemberName(mid)}</Text>
                          {mid === round.dealerId && <Text style={styles.reportTagDealer}>庄</Text>}
                          {mid !== round.dealerId && round.winnerIds.includes(mid) && <Text style={styles.reportTagWin}>赢</Text>}
                          {mid !== round.dealerId && round.loserIds.includes(mid) && <Text style={styles.reportTagLose}>输</Text>}
                        </View>
                        <Text style={[styles.reportRoundScoreVal, { color: score > 0 ? "#34C759" : score < 0 ? "#FF3B30" : "#8E8E93" }]}>
                          {score > 0 ? "+" : ""}{score}
                        </Text>
                      </View>
                    ))}
                  {!!round.note && (
                    <Text style={styles.reportNote}>备注: {round.note}</Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* New Round Modal */}
      <Modal visible={showRoundModal} animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowRoundModal(false)}>
              <Text style={styles.modalCancel}>取消</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingRoundId ? "编辑轮次" : "新建轮次"}</Text>
            <TouchableOpacity onPress={confirmRound}>
              <Text style={styles.modalConfirm}>确认</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            {/* Base Score */}
            <Text style={styles.fieldLabel}>基础分（1-100）</Text>
            <TextInput
              style={styles.scoreInput}
              keyboardType="number-pad"
              value={baseScore}
              onChangeText={setBaseScore}
              maxLength={3}
              returnKeyType="done"
            />
            <View style={styles.presets}>
              {[1, 5, 10, 20, 50, 100].map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.presetBtn,
                    baseScore === String(v) && styles.presetBtnActive,
                  ]}
                  onPress={() => setBaseScore(String(v))}
                >
                  <Text
                    style={[
                      styles.presetText,
                      baseScore === String(v) && styles.presetTextActive,
                    ]}
                  >
                    {v}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Dealer */}
            <Text style={styles.fieldLabel}>
              选择庄家（在线: {onlineMembers.length}人）
            </Text>
            {onlineMembers.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={styles.pickRow}
                onPress={() => {
                  setDealerId(m.id === dealerId ? "" : m.id);
                  setWinnerIds((prev) => prev.filter((x) => x !== m.id));
                  setLoserIds((prev) => prev.filter((x) => x !== m.id));
                }}
              >
                <View
                  style={[
                    styles.radioOuter,
                    dealerId === m.id && styles.radioOuterActive,
                  ]}
                >
                  {dealerId === m.id && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.pickName}>{m.name}</Text>
                {dealerId === m.id && (
                  <Text style={styles.dealerTag}>庄</Text>
                )}
              </TouchableOpacity>
            ))}

            {/* Winners & Losers */}
            {dealerId ? (
              <>
                <Text style={styles.fieldLabel}>选择赢家</Text>
                {nonDealerOnline.filter((m) => !loserIds.includes(m.id)).map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.pickRow}
                    onPress={() => toggleWinner(m.id)}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        winnerIds.includes(m.id) && styles.checkboxActive,
                      ]}
                    >
                      {winnerIds.includes(m.id) && (
                        <Text style={styles.checkmark}>✓</Text>
                      )}
                    </View>
                    <Text style={styles.pickName}>{m.name}</Text>
                    {winnerIds.includes(m.id) && (
                      <Text style={styles.winTag}>赢</Text>
                    )}
                  </TouchableOpacity>
                ))}

                <Text style={styles.fieldLabel}>选择输家</Text>
                {nonDealerOnline.filter((m) => !winnerIds.includes(m.id)).map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.pickRow}
                    onPress={() => toggleLoser(m.id)}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        loserIds.includes(m.id) && styles.checkboxLoseActive,
                      ]}
                    >
                      {loserIds.includes(m.id) && (
                        <Text style={styles.checkmark}>✓</Text>
                      )}
                    </View>
                    <Text style={styles.pickName}>{m.name}</Text>
                    {loserIds.includes(m.id) && (
                      <Text style={styles.loseTag}>输</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <Text style={styles.hint}>请先选择庄家</Text>
            )}

            <Text style={styles.fieldLabel}>备注（可选）</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="写点什么..."
              value={roundNote}
              onChangeText={setRoundNote}
              multiline
              maxLength={200}
              returnKeyType="done"
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  scroll: {
    padding: 16,
  },
  createdAt: {
    fontSize: 13,
    color: "#8E8E93",
    marginBottom: 8,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  shareCodeBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  shareLabel: {
    fontSize: 12,
    color: "#8E8E93",
    fontWeight: "600",
  },
  shareCode: {
    fontSize: 13,
    color: "#1C1C1E",
    fontWeight: "500",
    flex: 1,
  },
  copyBtn: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  copyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 10,
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  addInput: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  addBtn: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  addBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5EA",
  },
  memberRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  memberName: {
    fontSize: 15,
    color: "#1C1C1E",
  },
  offlineName: {
    color: "#C7C7CC",
  },
  onlineLabel: {
    fontSize: 12,
    color: "#8E8E93",
  },
  removeBtn: {
    fontSize: 13,
    color: "#FF3B30",
    paddingLeft: 8,
  },
  hint: {
    fontSize: 14,
    color: "#C7C7CC",
    textAlign: "center",
    paddingVertical: 8,
  },
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5EA",
  },
  scoreName: {
    fontSize: 15,
    color: "#1C1C1E",
  },
  scoreValue: {
    fontSize: 17,
    fontWeight: "700",
  },
  roundActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  newRoundBtn: {
    flex: 1,
    backgroundColor: "#007AFF",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  newRoundBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  undoBtn: {
    backgroundColor: "#FF9500",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  undoBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  exportBtn: {
    backgroundColor: "#5856D6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 14,
  },
  exportBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  roundCard: {
    backgroundColor: "#F9F9F9",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  roundHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roundNum: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  roundHeaderRight: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  roundBase: {
    fontSize: 13,
    color: "#007AFF",
    fontWeight: "600",
  },
  roundDealer: {
    fontSize: 13,
    color: "#FF9500",
  },
  roundTime: {
    fontSize: 12,
    color: "#C7C7CC",
  },
  roundSummary: {
    marginTop: 6,
  },
  roundWinners: {
    fontSize: 13,
    color: "#34C759",
  },
  roundLosers: {
    fontSize: 13,
    color: "#FF3B30",
  },
  roundDetail: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5EA",
    paddingTop: 6,
  },
  editRoundBtn: {
    backgroundColor: "#007AFF",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "flex-end",
    marginBottom: 8,
  },
  editRoundBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  roundScoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  roundScoreName: {
    fontSize: 13,
    color: "#666",
  },
  roundScoreVal: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Modal styles
  modal: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5EA",
  },
  modalCancel: {
    fontSize: 16,
    color: "#007AFF",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  modalConfirm: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "600",
    backgroundColor: "#007AFF",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    overflow: "hidden",
  },
  modalBody: {
    padding: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginTop: 14,
    marginBottom: 8,
  },
  scoreInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  presets: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  presetBtn: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  presetBtnActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  presetText: {
    fontSize: 15,
    color: "#1C1C1E",
    fontWeight: "500",
  },
  presetTextActive: {
    color: "#fff",
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5EA",
    backgroundColor: "#fff",
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#C7C7CC",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: {
    borderColor: "#FF9500",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FF9500",
  },
  pickName: {
    fontSize: 15,
    color: "#1C1C1E",
    flex: 1,
  },
  dealerTag: {
    fontSize: 12,
    color: "#fff",
    backgroundColor: "#FF9500",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: "600",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#C7C7CC",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: "#34C759",
    borderColor: "#34C759",
  },
  checkboxLoseActive: {
    backgroundColor: "#FF3B30",
    borderColor: "#FF3B30",
  },
  checkmark: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  winTag: {
    fontSize: 12,
    color: "#fff",
    backgroundColor: "#34C759",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: "600",
  },
  loseTag: {
    fontSize: 12,
    color: "#fff",
    backgroundColor: "#FF3B30",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: "600",
  },
  noteInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    minHeight: 60,
    textAlignVertical: "top",
  },
  roundNote: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 4,
    fontStyle: "italic",
  },
  roundNoteExpanded: {
    fontSize: 13,
    color: "#8E8E93",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5EA",
    fontStyle: "italic",
  },

  reportContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5EA",
  },
  reportClose: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "600",
  },
  reportHeaderTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  reportExportBtn: {
    fontSize: 14,
    color: "#5856D6",
    fontWeight: "600",
  },
  reportBody: {
    padding: 20,
    paddingBottom: 40,
  },
  reportTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  reportSubtitle: {
    fontSize: 13,
    textAlign: "center",
    color: "#8E8E93",
    marginBottom: 20,
  },
  reportDivider: {
    height: 2,
    backgroundColor: "#007AFF",
    marginBottom: 16,
  },
  reportSectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 10,
  },
  reportScoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5EA",
  },
  reportScoreName: {
    fontSize: 15,
    color: "#1C1C1E",
  },
  reportScoreVal: {
    fontSize: 16,
    fontWeight: "700",
  },
  reportRound: {
    marginBottom: 16,
    backgroundColor: "#F9F9F9",
    borderRadius: 8,
    padding: 12,
  },
  reportRoundHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  reportRoundNum: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  reportRoundMeta: {
    fontSize: 12,
    color: "#8E8E93",
  },
  reportRoundScoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5EA",
  },
  reportRoundScoreName: {
    fontSize: 14,
    color: "#1C1C1E",
  },
  reportRoundScoreVal: {
    fontSize: 14,
    fontWeight: "600",
  },
  reportTagDealer: {
    fontSize: 10,
    color: "#fff",
    backgroundColor: "#FF9500",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    fontWeight: "600",
    overflow: "hidden",
  },
  reportTagWin: {
    fontSize: 10,
    color: "#fff",
    backgroundColor: "#34C759",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    fontWeight: "600",
    overflow: "hidden",
  },
  reportTagLose: {
    fontSize: 10,
    color: "#fff",
    backgroundColor: "#FF3B30",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    fontWeight: "600",
    overflow: "hidden",
  },
  reportNote: {
    fontSize: 12,
    color: "#8E8E93",
    fontStyle: "italic",
    marginTop: 6,
  },
});
