import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  MAX_FILE_BYTES,
  type ChatItem,
  type CodexRequest,
  type Project,
  type Session,
  type SessionHistory,
  type UploadedFile,
} from '@codex-remote/protocol';
import type { ClientState, RemoteClient } from './client';
import { readCache, saveCache } from './storage';
import { createSessionDraftStore, type SessionDraft } from './session-draft';
import { applySessionEvent, mergeChatItems } from './session-state';
import { Icon } from './icons';
import { Button, useUI, useThemedStyles, type Palette } from './ui';
import { MarkdownMessage } from './MarkdownMessage';
import { TurnSettingsPicker } from './TurnSettingsPicker';
import { Attachments } from './Attachments';
import { ChatControls } from './ChatControls';
import { findRecentImages, handleRecentImages, resolveRecentImage } from './recent-images';
import type { RecentImage } from './recent-image-state';
import {
  sameTurnOverrides,
  sessionTurnSettings,
  turnSettingsParams,
  type TurnOverrides,
} from './turn-settings';

function ExecutionItem({ item }: { item: ChatItem }) {
  const { palette } = useUI();
  const styles = useThemedStyles(createStyles);
  const [expanded, setExpanded] = useState(item.status === 'failed');
  const failed = item.status === 'failed' || item.status === 'declined';
  return (
    <View style={styles.execution}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`执行详情 ${item.text}`}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        style={styles.executionHeading}
      >
        <View style={[styles.executionDot, failed && { backgroundColor: palette.error }]} />
        <Text
          style={[
            styles.executionTitle,
            item.kind === 'command' && styles.mono,
            failed && { color: palette.error },
          ]}
          numberOfLines={expanded ? undefined : 2}
        >
          {item.kind === 'activity' && /思考/.test(item.text) ? `${item.status === 'inProgress' ? '思考中' : '思考完成'}${item.text === '正在思考…' ? '' : ` · ${item.text}`}` : item.text || '执行中…'}
        </Text>
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <Icon name="chevron" size={13} color={palette.muted} />
        </View>
      </Pressable>
      {expanded && (
        <View style={styles.executionBody}>
          {item.details ? (
            <Text selectable style={[styles.executionOutput, styles.mono]}>
              {item.details}
            </Text>
          ) : (
            <Text style={styles.executionOutput}>
              {item.status === 'inProgress' ? '正在执行…' : '已完成'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
function Message({ item }: { item: ChatItem }) {
  const { common } = useUI();
  const styles = useThemedStyles(createStyles);
  if (item.kind === 'command' || item.kind === 'file' || item.kind === 'activity')
    return <ExecutionItem item={item} />;
  if (!item.text && !item.attachments?.length) return null;
  if (item.kind === 'error')
    return (
      <Text selectable style={[common.error, { marginVertical: 14 }]}>
        {item.text}
      </Text>
    );
  return (
    <View
      style={[styles.message, item.kind === 'user' && styles.userMessage]}
      testID={item.kind === 'assistant' ? 'assistant-message' : 'user-message'}
    >
      {!!item.text &&
        (item.kind === 'assistant' ? (
          <MarkdownMessage text={item.text} />
        ) : (
          <Text selectable style={styles.messageText}>
            {item.text}
          </Text>
        ))}
      {!!item.attachments?.length && (
        <Text style={styles.attachedNames}>{item.attachments.join(' · ')}</Text>
      )}
    </View>
  );
}
function RequestPrompt({
  request,
  onRespond,
}: {
  request: CodexRequest;
  onRespond: (action: string, answers?: Record<string, string[]>) => Promise<void>;
}) {
  const { palette, common, scheme } = useUI();
  const styles = useThemedStyles(createStyles);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const p = request.params as any;
  const questions = p.questions as
    | { id: string; question: string; options?: { label: string; description: string }[] }[]
    | undefined;
  const input = request.method === 'item/tool/requestUserInput';
  const elicitation = request.method === 'mcpServer/elicitation/request';
  async function respond(action: string) {
    setBusy(true);
    setError('');
    try {
      await onRespond(action, answers);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.prompt}>
      <Text style={styles.promptTitle}>
        {input
          ? 'Codex 需要你的回复'
          : elicitation
            ? '此工具需要在电脑上完成授权'
            : 'Codex 需要你的许可'}
      </Text>
      {!!p.reason && <Text style={styles.promptDescription}>{p.reason}</Text>}
      {!!p.command && (
        <Text selectable style={[styles.promptCommand, styles.mono]}>
          {p.command}
        </Text>
      )}
      {!!p.networkApprovalContext && (
        <Text style={styles.promptDescription}>
          {p.networkApprovalContext.protocol} · {p.networkApprovalContext.host}
        </Text>
      )}
      {request.method === 'item/permissions/requestApproval' && (
        <Text selectable style={[styles.promptDescription, styles.mono]}>
          {JSON.stringify(p.permissions, null, 2)}
        </Text>
      )}
      {questions?.map((question) => (
        <View key={question.id} style={{ marginTop: 18 }}>
          <Text style={styles.promptDescription}>{question.question}</Text>
          {question.options?.map((option) => (
            <Pressable
              key={option.label}
              accessibilityRole="radio"
              accessibilityState={{ selected: answers[question.id]?.[0] === option.label }}
              accessibilityLabel={option.label}
              onPress={() =>
                setAnswers((previous) => ({ ...previous, [question.id]: [option.label] }))
              }
              style={[
                styles.answerOption,
                answers[question.id]?.[0] === option.label && { borderColor: palette.ink },
              ]}
            >
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionDescription}>{option.description}</Text>
            </Pressable>
          ))}
          <TextInput
            accessibilityLabel={`回答 ${question.question}`}
            placeholder="输入你的回复…"
            placeholderTextColor={palette.muted}
            keyboardAppearance={scheme}
            value={answers[question.id]?.[0] ?? ''}
            onChangeText={(text) =>
              setAnswers((previous) => ({ ...previous, [question.id]: [text] }))
            }
            style={common.field}
          />
        </View>
      ))}
      {!!error && <Text style={[common.error, { marginTop: 14 }]}>{error}</Text>}
      <View style={styles.promptActions}>
        {!elicitation && (
          <Button
            label={input ? '回复' : '允许本次'}
            onPress={() => respond('accept')}
            disabled={busy}
            style={{ paddingVertical: 11, minHeight: 40 }}
          />
        )}
        <Button
          label={input || elicitation ? '取消' : '拒绝'}
          onPress={() => respond(input || elicitation ? 'cancel' : 'decline')}
          disabled={busy}
          subtle
          style={{ paddingVertical: 11, minHeight: 40 }}
        />
      </View>
    </View>
  );
}
const drafts = createSessionDraftStore(
  { read: (key) => readCache<SessionDraft>(key), write: saveCache },
  Platform.OS !== 'web',
);
export function Chat({
  deviceId,
  session,
  client,
  clientState,
  server,
  onOpenSource,
}: {
  project: Project | null;
  deviceId: string;
  session: Session;
  client: RemoteClient | null;
  clientState: ClientState;
  server: string;
  onOpenSource: (session: Session) => void;
}) {
  const { palette, common, scheme } = useUI();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [history, setHistory] = useState<SessionHistory>({
    session,
    model: null,
    reasoningEffort: null,
    permissions: null,
    items: [],
    nextCursor: null,
    activeTurnId: null,
    requests: [],
    sequence: -1,
  });
  const [loading, setLoading] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedSettings, setSelectedSettings] = useState<TurnOverrides | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [recent, setRecent] = useState<RecentImage[]>([]);
  const attachmentBusy = useRef(false);
  const online = clientState.status === 'connected' && clientState.devices.some((d) => d.id === deviceId && d.online);
  const attempt = useRef<SessionDraft['attempt']>(null);
  const latestDraft = useRef<SessionDraft>({ text: '', files: [], settings: null, attempt: null });
  const draftLoaded = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  latestDraft.current = { text, files, settings: selectedSettings, attempt: attempt.current };
  useEffect(() => {
    if (!draftReady || !online || Platform.OS === 'web') return;
    let checking = false;
    let cancelled = false;
    const check = async () => {
      if (checking || attachmentBusy.current) return;
      checking = true;
      try {
        const images = await findRecentImages();
        const added = images.filter((image) => latestDraft.current.files.some((file) => file.name === image.filename));
        if (added.length) await handleRecentImages(added);
        if (!cancelled) setRecent(images.filter((image) => !added.includes(image)));
      }
      catch { /* Missing/limited permission leaves manual attachment selection available. */ }
      finally { checking = false; }
    };
    void check();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void check(); });
    return () => { cancelled = true; subscription.remove(); };
  }, [draftReady, online, session.id]);
  const loadingRef = useRef(false);
  const buffered = useRef<any[]>([]);
  const alive = useRef(true);
  const pinned = useRef(true);
  const geometry = useRef({ y: 0, height: 0 });
  const prepending = useRef<{ y: number; height: number } | null>(null);
  const cacheKey = `session:${server}:${deviceId}:${session.id}`;
  const draftKey = `draft:${server}:${deviceId}:${session.id}`;
  const persistDraft = useCallback(() => {
    clearTimeout(draftTimer.current);
    const draft = latestDraft.current;
    // Capture every field before the native storage call starts asynchronously.
    // The web store writes immediately, including when reload follows a tap.
    return drafts.write(draftKey, {
      text: draft.text,
      files: draft.files.map((file) => ({ ...file })),
      settings: draft.settings ? { ...draft.settings } : null,
      attempt: attempt.current ? { ...attempt.current } : null,
    });
  }, [draftKey]);
  useEffect(() => {
    alive.current = true;
    const flush = () => {
      if (draftLoaded.current) void persistDraft().catch(() => {});
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const subscription =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state !== 'active') flush();
          });
    if (Platform.OS === 'web') {
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', visibility);
    }
    return () => {
      alive.current = false;
      if (Platform.OS === 'web') {
        window.removeEventListener('pagehide', flush);
        document.removeEventListener('visibilitychange', visibility);
      }
      subscription?.remove();
      flush();
    };
  }, [persistDraft]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([readCache<SessionHistory>(cacheKey), drafts.read(draftKey)])
      .then(([cached, draft]) => {
        if (cancelled) return;
        if (cached)
          setHistory((previous) =>
            previous.sequence < 0
              ? { ...cached, sequence: -1, requests: [], activeTurnId: null }
              : previous,
          );
        if (draft) {
          setText(draft.text);
          setFiles(draft.files);
          setSelectedSettings(draft.settings);
          attempt.current = draft.attempt;
          latestDraft.current = draft;
        }
        draftLoaded.current = true;
        setDraftReady(true);
        if (!online) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('读取已保存草稿失败，请刷新重试。');
          draftLoaded.current = true;
          setDraftReady(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);
  useEffect(() => {
    if (!draftReady) return;
    draftTimer.current = setTimeout(() => {
      void persistDraft().catch(() => {
        if (alive.current) setError('草稿保存失败，请重试。');
      });
    }, 200);
    return () => clearTimeout(draftTimer.current);
  }, [persistDraft, draftReady, text, files, selectedSettings, sending]);
  const load = useCallback(async () => {
    if (!client || !online || !draftReady || loadingRef.current) return false;
    loadingRef.current = true;
    setLoading(true);
    buffered.current = [];
    setError('');
    try {
      let result = await client.request<SessionHistory>(
        'sessions/read',
        { threadId: session.id },
        deviceId,
      );
      if (!alive.current) return false;
      for (const event of buffered.current) result = applySessionEvent(result, event);
      setHistory(result);
      void saveCache(cacheKey, result).catch(() => {});
      if (attempt.current && result.items.some((item) => item.clientId === attempt.current?.key)) {
        const [sentText, sentFiles, , sentSettings] = JSON.parse(attempt.current.signature) as [
          string,
          string[],
          ReturnType<typeof turnSettingsParams>,
          TurnOverrides | null,
        ];
        const draft = latestDraft.current;
        // An acknowledged earlier send must not erase a newer draft typed
        // while reconnecting or while this snapshot was being loaded.
        if (
          draft.text.trim() === sentText &&
          JSON.stringify(draft.files.map((file) => file.id)) === JSON.stringify(sentFiles)
        ) {
          setText('');
          setFiles([]);
          latestDraft.current = { ...draft, text: '', files: [] };
        }
        if (sameTurnOverrides(draft.settings, sentSettings)) {
          setSelectedSettings(null);
          latestDraft.current.settings = null;
        }
        attempt.current = null;
        latestDraft.current.attempt = null;
        void persistDraft().catch(() => {});
      }
      return true;
    } catch (e) {
      if (alive.current) setError((e as Error).message);
      return false;
    } finally {
      loadingRef.current = false;
      buffered.current = [];
      if (alive.current) setLoading(false);
    }
  }, [client, online, draftReady, deviceId, session.id, cacheKey, persistDraft]);
  useEffect(() => {
    if (!client) return;
    const unsubscribe = client.onEvent((event) => {
      if (event.deviceId !== deviceId || event.params.threadId !== session.id) return;
      if (loadingRef.current) {
        buffered.current.push(event);
        return;
      }
      setHistory((previous) => applySessionEvent(previous, event));
    });
    void load();
    return unsubscribe;
  }, [client, load, deviceId, session.id]);
  useEffect(() => {
    if (history.sequence < 0) return;
    const timer = setTimeout(() => void saveCache(cacheKey, history).catch(() => {}), 500);
    return () => clearTimeout(timer);
  }, [history, cacheKey]);
  async function loadOlder() {
    if (!client || !history.nextCursor || olderLoading) return;
    setOlderLoading(true);
    setError('');
    pinned.current = false;
    try {
      const page = await client.request<SessionHistory>(
        'sessions/read',
        { threadId: session.id, cursor: history.nextCursor },
        deviceId,
      );
      prepending.current = { ...geometry.current };
      setHistory((previous) => ({
        ...previous,
        items: mergeChatItems(page.items, previous.items),
        nextCursor: page.nextCursor,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOlderLoading(false);
    }
  }
  async function pick() {
    if (!client || !draftReady || uploading || attachmentBusy.current) return;
    attachmentBusy.current = true;
    setError('');
    setUploading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      await uploadAssets(result.assets);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      attachmentBusy.current = false;
      if (alive.current) setUploading(false);
    }
  }
  async function uploadAssets(assets: { uri: string; name: string; size?: number; mimeType?: string; file?: File }[], onUploaded?: (index: number) => Promise<void>) {
    if (!client) return;
    if (latestDraft.current.files.length + assets.length > 6) throw new Error('一次最多添加 6 个附件');
    for (const [index, asset] of assets.entries()) {
        const mimeType = asset.mimeType ?? (/\.png$/i.test(asset.name) ? 'image/png' : /\.jpe?g$/i.test(asset.name) ? 'image/jpeg' : /\.webp$/i.test(asset.name) ? 'image/webp' : 'application/octet-stream');
        if ((asset.size ?? 0) > MAX_FILE_BYTES) throw new Error(`${asset.name} 超过 8 MB`);
        let data: string;
        if (Platform.OS === 'web' && asset.file)
          data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('读取附件失败'));
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.readAsDataURL(asset.file!);
          });
        else
          data = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        if (data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4)
          throw new Error(`${asset.name} 超过 8 MB`);
        const uploaded = await client.request<{ file: UploadedFile }>(
          'attachments/upload',
          {
            threadId: session.id,
            name: asset.name,
            mimeType,
            data,
          },
          deviceId,
        );
        if (alive.current) {
          let previewUri: string | undefined;
          if (/^image\/(png|jpeg|webp|gif)$/.test(mimeType)) {
            if (Platform.OS === 'web') {
              previewUri = `data:${mimeType};base64,${data}`;
              if (data.length > 200000) {
                const image = new window.Image();
                const loaded = new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('无法生成照片预览')); });
                image.src = previewUri; await loaded;
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));
                canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
                previewUri = canvas.toDataURL('image/jpeg', 0.7);
              }
            } else if (FileSystem.documentDirectory) {
              const directory = `${FileSystem.documentDirectory}attachment-previews/`;
              await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
              previewUri = `${directory}${uploaded.file.id}-${asset.name.replace(/[^\w.-]/g, '_')}`;
              await FileSystem.copyAsync({ from: asset.uri, to: previewUri });
            }
          }
          const next = [...latestDraft.current.files, { ...uploaded.file,
            ...(previewUri ? { previewUri } : {}) }];
          latestDraft.current.files = next;
          setFiles(next);
          await persistDraft();
          await onUploaded?.(index);
        }
      }
  }
  async function addRecent() {
    if (!client || uploading || sending || !draftReady || attachmentBusy.current) return;
    attachmentBusy.current = true;
    setUploading(true); setError('');
    try {
      const assets = await Promise.all(recent.map(resolveRecentImage));
      await uploadAssets(assets, async (index) => { await handleRecentImages([recent[index]]); });
      setRecent([]);
    } catch (e) { if (alive.current) setError((e as Error).message); }
    finally { attachmentBusy.current = false; if (alive.current) setUploading(false); }
  }
  async function send() {
    if (
      !client ||
      !online ||
      !draftReady ||
      loading ||
      sending ||
      uploading ||
      history.activeTurnId ||
      (!text.trim() && !files.length)
    )
      return;
    const message = text.trim();
    const settings = turnSettingsParams(history, selectedSettings);
    const signature = JSON.stringify([message, files.map((f) => f.id), settings, selectedSettings]);
    if (!attempt.current || attempt.current.signature !== signature)
      attempt.current = {
        signature,
        key: `phone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      };
    latestDraft.current.attempt = attempt.current;
    // Persist the key before sending: an uncertain response must not trigger a
    // second turn if the app closes or switches networks.
    setSending(true);
    try {
      await persistDraft();
    } catch {
      if (alive.current) {
        setError('草稿保存失败，请重试。');
        setSending(false);
      }
      return;
    }
    setError('');
    pinned.current = true;
    try {
      await client.request(
        'sessions/send',
        {
          threadId: session.id,
          text: message,
          attachmentIds: files.map((f) => f.id),
          idempotencyKey: attempt.current.key,
          ...settings,
        },
        deviceId,
      );
      if (alive.current) {
        setText((previous) => (previous.trim() === message ? '' : previous));
        setFiles([]);
        latestDraft.current = {
          text: latestDraft.current.text.trim() === message ? '' : latestDraft.current.text,
          files: [],
          settings: latestDraft.current.settings,
          attempt: attempt.current,
        };
        void persistDraft().catch(() => {});
        // The ACK does not guarantee that settings notifications have arrived.
        // Read native configuration before replacing the pending selection.
        if (await load()) {
          if (!alive.current) return;
          setSelectedSettings(null);
          attempt.current = null;
          latestDraft.current.settings = null;
          latestDraft.current.attempt = null;
          void persistDraft().catch(() => {});
        }
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setSending(false);
    }
  }
  async function stop() {
    if (!client || stopping) return;
    setStopping(true);
    setError('');
    try {
      await client.request('sessions/stop', { threadId: session.id }, deviceId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStopping(false);
    }
  }
  const running = !!history.activeTurnId;
  return (
    <KeyboardAvoidingView
      style={styles.chat}
      behavior={
        Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
      }
      testID="chat-screen"
    >
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={100}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          geometry.current = { y: contentOffset.y, height: contentSize.height };
          pinned.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 100;
        }}
        onContentSizeChange={(_, height) => {
          if (prepending.current) {
            scroll.current?.scrollTo({
              y: prepending.current.y + height - prepending.current.height,
              animated: false,
            });
            prepending.current = null;
          } else if (pinned.current) scroll.current?.scrollToEnd({ animated: false });
          geometry.current.height = height;
        }}
      >
        <View style={styles.chatWidth}>
          {history.nextCursor && (
            <Button
              subtle
              label={olderLoading ? '加载中…' : '查看更早消息'}
              onPress={loadOlder}
              disabled={!online || olderLoading}
              style={{ alignSelf: 'center', marginBottom: 18 }}
            />
          )}
          {loading && <ActivityIndicator color={palette.ink} style={{ marginTop: 45 }} />}
          {!loading && !history.items.length && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>有什么可以帮你？</Text>
              <Text style={styles.emptyHint}>继续思考，开始创造。</Text>
            </View>
          )}
          {!!history.session.forkedFromId && <View>
            <Text style={styles.connectionHint}>分支会话 · 来源 {history.session.forkedFromId}</Text>
            <Button label="打开来源会话" subtle disabled={!online || loading || sending} style={{ minHeight: 36, paddingVertical: 6 }} onPress={() => {
              if (!client) return;
              void (async () => {
                try {
                  await persistDraft();
                  const source = await client.request<SessionHistory>('sessions/read', { threadId: history.session.forkedFromId }, deviceId);
                  if (alive.current) onOpenSource(source.session);
                } catch (e) { if (alive.current) setError((e as Error).message); }
              })();
            }} />
          </View>}
          {history.items.map((item) => (
            <Message key={`${item.turnId}:${item.id}`} item={item} />
          ))}
          {history.requests.map((request) => (
            <RequestPrompt
              key={request.id}
              request={request}
              onRespond={async (action, answers) => {
                if (!client) throw new Error('请先连接电脑');
                await client.request(
                  'requests/respond',
                  { requestId: request.id, action, answers },
                  deviceId,
                );
              }}
            />
          ))}
          {running && (
            <View style={styles.progress}>
              <View style={styles.progressDot} />
              <Text style={styles.progressText}>
                {history.requests.length ? '等待你的回复' : 'Codex 正在工作…'}
              </Text>
            </View>
          )}
          {!!error && (
            <View style={{ marginTop: 18 }}>
              <Text selectable style={common.error}>
                {error}
              </Text>
              <Pressable accessibilityRole="button" onPress={load} style={{ paddingVertical: 12 }}>
                <Text style={styles.retry}>刷新会话</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
      <View style={[styles.composerOuter, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <View style={styles.chatWidth}>
          <Attachments files={files} uploading={uploading} onRemove={(id) => {
            const removed = latestDraft.current.files.find((file) => file.id === id);
            if (Platform.OS !== 'web' && removed?.previewUri?.startsWith(`${FileSystem.documentDirectory}attachment-previews/`))
              void FileSystem.deleteAsync(removed.previewUri, { idempotent: true }).catch(() => {});
            const next = latestDraft.current.files.filter((file) => file.id !== id);
            latestDraft.current.files = next; setFiles(next);
          }} />
          <View style={styles.composer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="添加附件"
              onPress={pick}
              disabled={!online || !draftReady || uploading || sending}
              style={[styles.attachButton, (!online || uploading) && { opacity: 0.35 }]}
            >
              <Icon name="attach" size={22} color={palette.secondary} />
            </Pressable>
            <TextInput
              accessibilityLabel="消息输入框"
              placeholder="Message Codex…"
              placeholderTextColor={palette.muted}
              keyboardAppearance={scheme}
              multiline
              editable={draftReady}
              value={text}
              onChangeText={(value) => {
                latestDraft.current.text = value;
                setText(value);
              }}
              style={styles.input}
              maxLength={200000}
              onKeyPress={(event) => {
                if (
                  Platform.OS === 'web' &&
                  event.nativeEvent.key === 'Enter' &&
                  !(event as any).shiftKey &&
                  !(event.nativeEvent as any).shiftKey &&
                  !(event.nativeEvent as any).isComposing
                ) {
                  (event as any).preventDefault?.();
                  void send();
                }
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={running ? '停止任务' : '发送消息'}
              disabled={
                running
                  ? !online || stopping
                  : !online ||
                    !draftReady ||
                    loading ||
                    sending ||
                    uploading ||
                    (!text.trim() && !files.length)
              }
              onPress={running ? stop : send}
              style={({ pressed }) => [
                styles.sendButton,
                (!online ||
                  loading ||
                  (!running && !text.trim() && !files.length) ||
                  sending ||
                  uploading) && { opacity: 0.22 },
                pressed && { opacity: 0.7 },
              ]}
            >
              {sending || stopping ? (
                <ActivityIndicator color={palette.onInk} size="small" />
              ) : (
                <Icon name={running ? 'stop' : 'send'} size={21} color={palette.onInk} />
              )}
            </Pressable>
          </View>
          <TurnSettingsPicker
            client={client}
            deviceId={deviceId}
            online={online}
            value={sessionTurnSettings(history, selectedSettings)}
            permissions={history.permissions}
            permissionsUnavailableReason={history.permissionsUnavailableReason}
            disabled={!draftReady || loading || sending || uploading || running}
            onChange={(changes) => {
              const next = { ...latestDraft.current.settings, ...changes };
              latestDraft.current.settings = next;
              setSelectedSettings(next);
              setError('');
              void persistDraft().catch((error: Error) => {
                if (alive.current) setError(`会话设置未保存：${error.message}`);
              });
            }}
          />
          <ChatControls history={history} client={client} deviceId={deviceId} sending={sending}
            mode={selectedSettings?.mode ?? history.mode ?? 'default'} disabled={!online || !draftReady || sending || uploading}
            onRefresh={() => void load()}
            onMode={(mode) => {
              const next = { ...latestDraft.current.settings, mode };
              latestDraft.current.settings = next; setSelectedSettings(next);
            }} />
          {!online && (
            <Text style={styles.connectionHint}>
              {clientState.status === 'reconnecting' || clientState.status === 'connecting'
                ? '正在重新连接，任务会继续在电脑上运行'
                : '电脑状态未知 · 已保存的消息仍可查看'}
            </Text>
          )}
        </View>
      </View>
      <Modal visible={recent.length > 0} transparent animationType="fade" onRequestClose={() => {
        void handleRecentImages(recent).then(() => setRecent([])).catch((e: Error) => setError(e.message));
      }}>
        <View style={styles.recentOverlay}><View style={styles.recentPanel}>
          <Text style={styles.promptTitle}>检测到近期图片，是否添加到当前会话的附件？</Text>
          <Text style={styles.promptDescription}>相册中最近 5 分钟拍摄或修改的 {recent.length} 张图片。确认后添加附件，不发送消息。</Text>
          <Button label="添加近期图片" disabled={uploading || sending || !online} onPress={() => void addRecent()} />
          <Button label="忽略近期图片" subtle disabled={uploading} onPress={() => {
            void handleRecentImages(recent).then(() => setRecent([])).catch((e: Error) => setError(e.message));
          }} />
          {!!error && <Text style={common.error}>{error}</Text>}
        </View></View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
const createStyles = (palette: Palette) =>
  StyleSheet.create({
    chat: { flex: 1, backgroundColor: palette.background },
    messages: { flexGrow: 1, paddingTop: 20, paddingBottom: 22 },
    chatWidth: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16 },
    message: { marginVertical: 13, alignSelf: 'flex-start', width: '100%', maxWidth: '100%' },
    messageText: { fontSize: 16, lineHeight: 26, color: palette.ink },
    userMessage: {
      width: 'auto',
      alignSelf: 'flex-end',
      backgroundColor: palette.soft,
      borderRadius: 19,
      paddingVertical: 11,
      paddingHorizontal: 16,
      maxWidth: '88%',
      marginTop: 22,
      marginBottom: 18,
    },
    attachedNames: { fontSize: 12, color: palette.muted, marginTop: 9 },
    execution: { marginVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: palette.line, borderRadius: 12 },
    executionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
    executionDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.muted },
    executionTitle: { flex: 1, fontSize: 12, lineHeight: 19, color: palette.secondary },
    executionBody: {
      marginLeft: 13,
      marginTop: 2,
      paddingVertical: 10,
      paddingHorizontal: 11,
      backgroundColor: palette.soft,
      borderRadius: 5,
    },
    executionOutput: { fontSize: 11, lineHeight: 18, color: palette.secondary },
    mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    empty: { flex: 1, paddingTop: 70, paddingBottom: 45, alignItems: 'center' },
    emptyTitle: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4, color: palette.ink },
    emptyHint: { fontSize: 13, color: palette.muted, marginTop: 13 },
    progress: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 17,
      paddingBottom: 6,
    },
    progressDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.secondary },
    progressText: { fontSize: 12, color: palette.muted },
    composerOuter: { backgroundColor: palette.background, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
    recentOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22, backgroundColor: '#0005' },
    recentPanel: { width: '100%', maxWidth: 440, padding: 22, borderRadius: 18, backgroundColor: palette.background, gap: 14 },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      minHeight: 54,
      borderRadius: 27,
      borderWidth: 1,
      borderColor: palette.line,
      padding: 5,
    },
    attachButton: { height: 42, width: 38, alignItems: 'center', justifyContent: 'center' },
    input: {
      flex: 1,
      fontSize: 15,
      lineHeight: 23,
      maxHeight: 145,
      minHeight: 42,
      paddingVertical: 9,
      paddingHorizontal: 8,
      color: palette.ink,
      textAlignVertical: 'center',
    },
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 23,
      backgroundColor: palette.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
    fileChip: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      backgroundColor: palette.soft,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      maxWidth: 230,
    },
    fileName: { fontSize: 12, color: palette.secondary, flexShrink: 1 },
    connectionHint: { fontSize: 10, textAlign: 'center', color: palette.muted, marginTop: 8 },
    retry: { fontSize: 12, color: palette.secondary },
    prompt: {
      paddingVertical: 22,
      marginVertical: 14,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: palette.line,
    },
    promptTitle: { color: palette.ink, fontSize: 16, fontWeight: '600' },
    promptDescription: { color: palette.secondary, fontSize: 14, lineHeight: 23, marginTop: 10 },
    promptCommand: { fontSize: 12, lineHeight: 20, color: palette.secondary, marginTop: 15 },
    promptActions: { flexDirection: 'row', gap: 7, marginTop: 20 },
    answerOption: {
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: 7,
      padding: 13,
      marginTop: 10,
    },
    optionLabel: { fontSize: 14, color: palette.ink },
    optionDescription: { fontSize: 12, lineHeight: 19, color: palette.muted, marginTop: 4 },
  });
