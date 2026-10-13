import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SessionHistory } from '@codex-remote/protocol';
import { Button, useUI, useThemedStyles, type Palette } from './ui';
import type { RemoteClient } from './client';

const statuses = { waiting: '等待响应', generating: '生成中', tool: '工具执行中', confirmation: '等待确认', completed: '已完成', stopped: '已停止', failed: '失败' };
const goalStatuses = { active: '进行中', paused: '已暂停', blocked: '受阻', usageLimited: '用量受限', budgetLimited: '预算已用尽', complete: '已完成' };
export function ChatControls({ history, mode, onMode, client, deviceId, disabled, sending, onRefresh }: {
  history: SessionHistory; mode: 'default' | 'plan'; onMode: (mode: 'default' | 'plan') => void;
  client: RemoteClient | null; deviceId: string; disabled: boolean; sending: boolean; onRefresh: () => void;
}) {
  const { common } = useUI();
  const styles = useThemedStyles(createStyles);
  const [panel, setPanel] = useState<'functions' | 'metrics' | null>(null);
  const [objective, setObjective] = useState('');
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setObjective(history.goal?.objective ?? '');
    setBudget(history.goal?.tokenBudget?.toString() ?? '');
  }, [history.session.id, history.goal?.objective, history.goal?.tokenBudget]);
  useEffect(() => {
    if (!history.activeTurnId) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [history.activeTurnId]);
  const metrics = history.metrics;
  const usage = metrics?.usage;
  const cacheHitRate = usage && Number.isFinite(usage.inputTokens) && usage.inputTokens > 0
    && Number.isFinite(usage.cachedInputTokens) && usage.cachedInputTokens >= 0 && usage.cachedInputTokens <= usage.inputTokens
    ? `${Math.round(1000 * usage.cachedInputTokens / usage.inputTokens) / 10}%` : '暂无数据';
  const elapsed = metrics ? Math.max(0, ((metrics.endedAt ?? Math.max(now, Date.now())) - metrics.startedAt) / 1000) : null;
  const remaining = metrics?.contextWindow && metrics.contextUsed !== null
    ? Math.max(0, Math.min(100, 100 * (1 - metrics.contextUsed / metrics.contextWindow))) : null;
  const speed = metrics?.firstOutputAt && metrics.lastOutputAt
    ? metrics.assistantCharacters / Math.max(1, (metrics.lastOutputAt - metrics.firstOutputAt) / 1000) : null;
  const label = sending ? '等待响应' : history.requests.length ? '等待确认' : metrics
    ? statuses[metrics.status] : history.activeTurnId ? '运行中' : '就绪';
  async function goal(action: 'save' | 'active' | 'paused' | 'complete' | 'clear') {
    if (!client || disabled || busy) return;
    setBusy(true); setError('');
    try {
      if (action === 'save' && budget && (!/^\d+$/.test(budget) || Number(budget) <= 0)) throw new Error('预算请输入正整数 token 数');
      await client.request(action === 'clear' ? 'sessions/goal/clear' : 'sessions/goal/set', {
        threadId: history.session.id,
        ...(action === 'save' ? { objective: objective.trim(), ...(history.capabilities?.goalBudget ? { tokenBudget: budget ? Number(budget) : null } : {}),
          ...(!history.goal ? { status: 'active' } : {}) } : action === 'clear' ? {} : { status: action }),
      }, deviceId);
      onRefresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <View style={styles.modeRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="功能与模式" onPress={() => setPanel('functions')} style={styles.modeButton}><Text style={styles.modeText}>功能 · {mode === 'plan' ? '计划 Plan' : '普通执行'}{history.goal ? ' · Goal' : ''}</Text></Pressable>
      {mode === 'plan' && !history.activeTurnId && <Button label="进入执行" subtle disabled={disabled} onPress={() => onMode('default')} style={styles.execute} />}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="运行指标详情" onPress={() => setPanel('metrics')} style={styles.status} testID="run-status">
      <Text style={styles.statusText}>{label}{elapsed !== null ? ` · ${Math.floor(elapsed)}s` : ''} · {remaining !== null ? `上下文剩余 ${Math.round(remaining)}%` : '上下文暂无数据'} · 缓存命中率 {cacheHitRate}{speed !== null ? ` · 约 ${Math.round(speed)} 字符/秒` : ''}</Text>
    </Pressable>
    <Modal transparent visible={panel !== null} animationType="slide" onRequestClose={() => setPanel(null)}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => setPanel(null)} />
        <View style={styles.panel} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
            <Text style={styles.title}>{panel === 'functions' ? '功能与模式' : '本轮运行指标'}</Text>
            {panel === 'functions' ? <>
              <Button label="普通执行" subtle disabled={disabled || busy || !!history.activeTurnId} onPress={() => { onMode('default'); setPanel(null); }} />
              <Text style={styles.hint}>直接处理任务。切换模式保留草稿与附件，不发送消息。</Text>
              <Button label="计划模式 Plan" subtle disabled={disabled || busy || !!history.activeTurnId || !history.capabilities?.plan} onPress={() => { onMode('plan'); setPanel(null); }} />
              <Text style={styles.hint}>{history.capabilities?.plan ? '调用 Codex 原生计划模式；形成计划后，点击进入执行，再发送你的执行指令。' : history.capabilities?.planReason ?? '当前电脑未提供计划模式能力，请刷新会话。'}</Text>
              <Text style={styles.title}>目标模式 Goal{history.goal ? ` · ${goalStatuses[history.goal.status]}` : ''}</Text>
              {history.capabilities?.goal ? <>
                <Text style={styles.hint}>目标创建后，Codex 可持续工作到目标完成；暂停、继续和结束均同步到电脑。</Text>
                <TextInput accessibilityLabel="目标内容" multiline placeholder="填写希望完成的目标" value={objective} onChangeText={setObjective} style={[common.field, { minHeight: 80 }]} />
                {history.capabilities.goalBudget && <TextInput accessibilityLabel="目标 token 预算" placeholder="可选 token 预算（留空不设限）" keyboardType="number-pad" value={budget} onChangeText={setBudget} style={common.field} />}
                {history.goal && <Text style={styles.hint}>已用 {history.goal.tokensUsed} token · 耗时 {history.goal.timeUsedSeconds}s{history.goal.tokenBudget !== null ? ` · 预算 ${history.goal.tokenBudget}` : ''}</Text>}
                <Button label={history.goal ? '保存目标修改' : '创建目标'} disabled={disabled || busy || !objective.trim()} onPress={() => void goal('save')} />
                {history.goal && <>
                  <View style={styles.actions}>
                    <Button label="暂停目标" subtle disabled={disabled || busy || history.goal.status !== 'active'} onPress={() => void goal('paused')} />
                    <Button label="继续目标" subtle disabled={disabled || busy || !['paused', 'blocked'].includes(history.goal.status)} onPress={() => void goal('active')} />
                    <Button label="结束目标" subtle disabled={disabled || busy || history.goal.status === 'complete'} onPress={() => void goal('complete')} />
                  </View>
                  <Button label="清除目标" subtle disabled={disabled || busy} onPress={() => void goal('clear')} />
                </>}
              </> : <Text style={styles.hint}>{history.capabilities?.goalReason ?? '当前电脑未提供 Goal 能力，请刷新会话。'}</Text>}
              {!!error && <Text style={common.error}>{error}</Text>}
            </> : <>
              <Text style={styles.detail}>状态：{label} · 耗时 {elapsed === null ? '暂无数据' : `${Math.floor(elapsed)} 秒`}</Text>
              <Text style={styles.detail}>上下文：{metrics?.contextUsed ?? '暂无数据'} / {metrics?.contextWindow ?? '暂无数据'} token</Text>
              <Text style={styles.hint}>以上按最近一次模型请求的上下文占用估算，压缩后更新；不是会话累计 token 消耗。</Text>
              <Text style={styles.detail}>助手输出：{speed === null ? '暂无数据' : `约 ${Math.round(speed)} 字符/秒`}</Text>
              <Text style={styles.hint}>按本轮首个至最后一个助手文本片段计算平均速度，不统计工具日志；没有实时 token 计数时不显示 token/s。</Text>
              <Text style={styles.detail}>本轮输入：{metrics?.usage?.inputTokens ?? '暂无数据'} token</Text>
              <Text style={styles.detail}>本轮输出：{metrics?.usage?.outputTokens ?? '暂无数据'} token</Text>
              <Text style={styles.detail}>缓存命中：{metrics?.usage?.cachedInputTokens ?? '暂无数据'} token</Text>
              <Text style={styles.detail}>缓存命中率：{cacheHitRate}</Text>
              <Text style={styles.hint}>按本轮缓存输入 token ÷ 本轮总输入 token 计算；没有输入用量时显示暂无数据。</Text>
              <Text style={styles.hint}>未收到可核对的本轮累计用量起点时显示暂无数据。结束后保留最终数值。</Text>
            </>}
            <Button label={panel === 'functions' ? '关闭功能面板' : '关闭指标详情'} subtle onPress={() => setPanel(null)} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 6 },
  modeText: { fontSize: 12, color: palette.secondary, fontWeight: '500' },
  execute: { minHeight: 38, paddingVertical: 7, paddingHorizontal: 10 },
  status: { paddingHorizontal: 6, paddingVertical: 5, minHeight: 30 },
  statusText: { fontSize: 10, lineHeight: 16, color: palette.muted },
  overlay: { flex: 1, backgroundColor: '#0005', justifyContent: 'flex-end' },
  panel: { maxHeight: '85%', width: '100%', maxWidth: 760, alignSelf: 'center', padding: 22, paddingBottom: 32, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: palette.background },
  title: { fontSize: 17, fontWeight: '600', color: palette.ink, marginTop: 5 },
  hint: { fontSize: 12, lineHeight: 20, color: palette.muted },
  detail: { fontSize: 14, lineHeight: 23, color: palette.secondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
});
