import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem, questionReplyText } from '../apps/agent/src/normalize.js';
const envelope = (replies: unknown) => `<send_user_message_question_reply>\n${JSON.stringify(replies)}\n</send_user_message_question_reply>`;
test('native asynchronous replies show questions and answers in live and restored items', () => {
  const text = envelope([
    { questionItemId: '["request_user_input_async","call_secret",0]', question: '连接哪台电脑？', answer: '是，使用这个 macbook-air 连接' },
    { questionItemId: 'internal-id', question: '补充说明？', answer: '第一行\n第二行 "引用"' },
  ]);
  for (const timestamp of [Date.now(), 1]) {
    const item = normalizeItem({ type: 'userMessage', id: 'answer', content: [{ type: 'text', text }] }, 'turn', timestamp)!;
    assert.equal(item.kind, 'user');
    assert.equal(item.text, '连接哪台电脑？\n回答：是，使用这个 macbook-air 连接\n\n补充说明？\n回答：第一行\n第二行 "引用"');
    assert.ok(!item.text.includes('questionItemId'));
    assert.ok(!item.text.includes('send_user_message_question_reply'));
  }
});
test('single answers, malformed envelopes and ordinary user text remain readable', () => {
  assert.equal(questionReplyText(envelope([{ answer: '选项 A' }])), '选项 A');
  assert.equal(questionReplyText(envelope([])), '已提交提问回复');
  assert.equal(questionReplyText('<send_user_message_question_reply>broken</send_user_message_question_reply>'), '已提交提问回复（内容无法解析）');
  const ordinary = '请解释 `<send_user_message_question_reply>` 的作用';
  assert.equal(questionReplyText(ordinary), ordinary);
});
