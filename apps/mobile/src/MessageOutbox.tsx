import React from 'react';
import { Text, View } from 'react-native';
import type { OutboxMessage } from '@codex-remote/protocol';
import { Button, useUI } from './ui';
const labels = { queued: '排队中', submitting: '提交中', accepted: '已接受', failed: '发送失败', uncertain: '结果待确认' };
export function MessageOutbox({ messages, online, onRetry }: {
  messages: OutboxMessage[]; online: boolean; onRetry: (id: string) => void;
}) {
  const { common, palette } = useUI();
  const visible = [...messages.filter((message) => message.status !== 'accepted'),
    ...messages.filter((message) => message.status === 'accepted').slice(-3)];
  return <>{visible.map((message) => <View key={message.id} style={{ marginVertical: 5, padding: 10, borderWidth: 1, borderColor: palette.line, borderRadius: 12 }}>
    <Text style={{ color: palette.secondary, fontSize: 12 }} numberOfLines={2}>
      {labels[message.status]} · {message.text.slice(0, 200) || message.attachmentNames.join(' · ')}
    </Text>
    {!!message.error && <Text style={common.error}>{message.error}</Text>}
    {message.status === 'failed' && <Button label="重试排队消息" subtle disabled={!online} onPress={() => onRetry(message.id)} />}
  </View>)}</>;
}
