import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Model, SessionPermissions } from '@codex-remote/protocol';
import type { RemoteClient } from './client';
import { Icon } from './icons';
import { Button, useUI, useThemedStyles, type Palette } from './ui';
import {
  customPermissionsDescription,
  permissionLabel,
  permissionOptions,
  reasoningLabel,
  selectTurnModel,
  type TurnOverrides,
  type TurnSelection,
} from './turn-settings';

type Section = 'model' | 'effort' | 'permission';
const titles: Record<Section, string> = {
  model: '选择模型',
  effort: '选择推理强度',
  permission: '选择权限模式',
};
const closeLabels: Record<Section, string> = {
  model: '关闭模型选择',
  effort: '关闭推理强度选择',
  permission: '关闭权限模式选择',
};

function Option({
  label,
  name,
  description,
  checked,
  disabled,
  onPress,
}: {
  label: string;
  name: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, checked && styles.selected, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.optionName}>{name}</Text>
        {!!description && <Text style={styles.description}>{description}</Text>}
      </View>
      {checked && <Text style={styles.check}>✓</Text>}
    </Pressable>
  );
}

export function TurnSettingsPicker({
  client,
  deviceId,
  online,
  value,
  permissions,
  permissionsUnavailableReason,
  disabled,
  onChange,
}: {
  client: RemoteClient | null;
  deviceId: string;
  online: boolean;
  value: TurnSelection;
  permissions: SessionPermissions | null;
  permissionsUnavailableReason?: string;
  disabled: boolean;
  onChange: (changes: TurnOverrides) => void;
}) {
  const { palette, common } = useUI();
  const styles = useThemedStyles(createStyles);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!client || !online) {
      setSection(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setModels([]);
    void client
      .request<{ models: Model[] }>('models/list', {}, deviceId)
      .then((result) => {
        if (!cancelled) setModels(result.models);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, deviceId, online, refresh]);
  useEffect(() => {
    if (disabled) setSection(null);
  }, [disabled]);
  const current =
    models.find((model) => model.model === value.model) ??
    (value.model === null ? models.find((model) => model.isDefault) : undefined);
  const modelName = current?.displayName ?? value.model ?? (loading ? '读取模型…' : '默认模型');
  const effort = value.effort ?? current?.defaultReasoningEffort ?? null;
  const effortName =
    current?.supportedReasoningEfforts.length === 0
      ? '不支持'
      : effort
        ? `${value.effort === null ? '默认 · ' : ''}${reasoningLabel(effort)}`
        : loading
          ? '读取中…'
          : '默认';
  const permissionName =
    value.permissionMode !== null || permissions
      ? permissionLabel(value.permissionMode)
      : '暂不可读取';
  const unavailable = disabled || !online;
  const choose = (changes: TurnOverrides) => {
    if (unavailable) return;
    onChange(changes);
    setSection(null);
  };
  const buttons: { section: Section; title: string; value: string; disabled: boolean }[] = [
    { section: 'model', title: '模型', value: modelName, disabled: unavailable },
    {
      section: 'effort',
      title: '推理',
      value: effortName,
      disabled: unavailable || loading || !!error || !current?.supportedReasoningEfforts.length,
    },
    { section: 'permission', title: '权限', value: permissionName, disabled: unavailable },
  ];
  return (
    <>
      <View style={styles.triggers}>
        {buttons.map((button) => (
          <Pressable
            key={button.section}
            accessibilityRole="button"
            accessibilityLabel={`${titles[button.section]}，当前 ${button.value}`}
            accessibilityState={{ disabled: button.disabled, expanded: section === button.section }}
            aria-expanded={section === button.section}
            testID={`${button.section}-picker`}
            disabled={button.disabled}
            onPress={() => setSection(button.section)}
            style={({ pressed }) => [
              styles.trigger,
              button.disabled && { opacity: 0.45 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.triggerText} numberOfLines={1}>
              {button.title}：{button.value}
            </Text>
            {button.section === 'model' && loading ? (
              <ActivityIndicator size="small" color={palette.muted} />
            ) : (
              <Icon name="chevron" size={12} color={palette.secondary} />
            )}
          </Pressable>
        ))}
        {!!error && <Text style={styles.errorHint}>模型读取失败 · 点击模型重试</Text>}
      </View>
      <Modal
        visible={section !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSection(null)}
      >
        <View style={styles.overlay}>
          <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => setSection(null)} />
          <View style={styles.panel} accessibilityViewIsModal>
            <View style={styles.heading}>
              <Text style={styles.title}>{section ? titles[section] : ''}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={section ? closeLabels[section] : '关闭设置选择'}
                onPress={() => setSection(null)}
                style={styles.close}
              >
                <Icon name="close" size={19} />
              </Pressable>
            </View>
            <Text style={styles.hint}>用于此会话后续发送的消息</Text>
            {section === 'model' && loading && <ActivityIndicator color={palette.ink} style={styles.status} />}
            {section === 'model' && !!error && (
              <View style={styles.status}>
                <Text selectable style={common.error}>{error}</Text>
                <Button label="重新读取模型" subtle onPress={() => setRefresh((previous) => previous + 1)} />
              </View>
            )}
            {section === 'model' && !loading && !error && !models.length && (
              <View style={styles.status}>
                <Text style={styles.hint}>此电脑当前没有可用模型</Text>
                <Button label="重新读取模型" subtle onPress={() => setRefresh((previous) => previous + 1)} />
              </View>
            )}
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.options}>
              {section === 'model' && !loading && !error && models.map((model) => (
                <Option
                  key={model.id}
                  label={model.displayName}
                  name={model.displayName}
                  description={model.description}
                  checked={model.model === current?.model}
                  disabled={unavailable}
                  onPress={() => choose(selectTurnModel(value, model))}
                />
              ))}
              {section === 'effort' && current?.supportedReasoningEfforts.map((option) => (
                <Option
                  key={option.reasoningEffort}
                  label={`推理强度：${option.reasoningEffort}`}
                  name={reasoningLabel(option.reasoningEffort)}
                  description={option.description}
                  checked={option.reasoningEffort === effort}
                  disabled={unavailable}
                  onPress={() => choose({ model: current.model, effort: option.reasoningEffort })}
                />
              ))}
              {section === 'permission' && (
                <>
                  {!permissions && (
                    <View style={styles.currentPolicy}>
                      <Text style={styles.optionName}>此会话当前权限暂不可读取</Text>
                      {!!permissionsUnavailableReason && <Text style={styles.description}>{permissionsUnavailableReason}</Text>}
                      <Text style={styles.description}>选择的权限模式会用于下一次发送；当前会话的实际权限会在可读取时更新。</Text>
                    </View>
                  )}
                  {permissions?.mode === null && (
                    <View style={styles.currentPolicy}>
                      <Text style={styles.optionName}>此会话当前使用自定义权限</Text>
                      <Text selectable style={styles.description}>{customPermissionsDescription(permissions)}</Text>
                      <Text style={styles.hint}>保留此配置，或选择下面的权限模式。</Text>
                    </View>
                  )}
                  {permissionOptions.map((option) => (
                    <Option
                      key={option.mode}
                      label={`权限：${option.label}`}
                      name={option.label}
                      description={option.description}
                      checked={option.mode === value.permissionMode}
                      disabled={unavailable}
                      onPress={() => choose({ permissionMode: option.mode })}
                    />
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  triggers: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6, maxWidth: '100%' },
  triggerText: { fontSize: 12, color: palette.secondary, flexShrink: 1 },
  errorHint: { fontSize: 11, color: palette.error, paddingHorizontal: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  panel: { width: '100%', maxWidth: 480, maxHeight: '75%', backgroundColor: palette.background, borderRadius: 17, paddingTop: 18, paddingHorizontal: 19, paddingBottom: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, color: palette.ink, fontWeight: '600' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12, lineHeight: 19, color: palette.muted, marginTop: 3 },
  status: { paddingVertical: 28 },
  options: { paddingVertical: 16, gap: 7 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  selected: { backgroundColor: palette.soft, borderColor: palette.line },
  optionName: { fontSize: 14, color: palette.ink, fontWeight: '500' },
  description: { fontSize: 12, lineHeight: 19, color: palette.secondary, marginTop: 5 },
  currentPolicy: { paddingHorizontal: 13, paddingBottom: 10 },
  check: { color: palette.ink, fontSize: 16 },
});
