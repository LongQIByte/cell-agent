import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import app from '../app.json';
import { DEFAULT_PREFERENCES, MAX_PROJECT_RATIO, MIN_PROJECT_RATIO, clampProjectRatio } from './preferences';
import { Button, usePreferences, useThemedStyles, useUI, type Palette } from './ui';
import { allowRecentImages } from './recent-images';

function Choices<T extends string>({ label, options, value, onSelect }: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onSelect: (value: T) => void;
}) {
  const { palette } = useUI();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.choices}>
      {options.map((option) => (
        <Pressable key={option.value} accessibilityRole="radio"
          accessibilityLabel={`${label}：${option.label}`}
          accessibilityState={{ checked: value === option.value }}
          aria-checked={value === option.value}
          onPress={() => onSelect(option.value)}
          style={[styles.choice, value === option.value && { backgroundColor: palette.ink }]}>
          <Text style={[styles.choiceText, value === option.value && { color: palette.onInk }]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function GeneralSettings() {
  const { preferences, updatePreferences, saveError } = usePreferences();
  const { palette, common } = useUI();
  const styles = useThemedStyles(createStyles);
  const projectPercent = Math.round(preferences.projectRatio * 100);
  const [photoStatus, setPhotoStatus] = useState('');
  function adjustRatio(delta: number) {
    updatePreferences({ projectRatio: clampProjectRatio(Math.round((preferences.projectRatio + delta) * 100) / 100) });
  }
  return (
    <View style={styles.section} testID="general-settings">
      <Text accessibilityRole="header" style={styles.sectionTitle}>通用</Text>
      <Text style={styles.help}>设置立即生效，自动保存在当前设备。</Text>
      <View style={styles.setting}>
        <Text style={styles.label}>主题设置</Text>
        <Choices label="主题" value={preferences.theme}
          options={[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '白色' }, { value: 'dark', label: '黑色' }]}
          onSelect={(theme) => updatePreferences({ theme })} />
      </View>
      <View style={styles.setting}>
        <Text style={styles.label}>字体大小</Text>
        <Choices label="字体大小" value={preferences.fontSize}
          options={[{ value: 'small', label: '小' }, { value: 'standard', label: '标准' }, { value: 'large', label: '大' }, { value: 'extraLarge', label: '特大' }]}
          onSelect={(fontSize) => updatePreferences({ fontSize })} />
        <Text style={styles.previewText} testID="font-preview">随时查看项目，继续你的会话。</Text>
      </View>
      <View style={styles.setting}>
        <Text style={styles.label}>折叠屏布局调整</Text>
        <Text style={styles.help}>展开屏幕并显示项目栏后，可拖动中间分隔线调整比例。较窄的窗口会为两侧保留操作空间。</Text>
        <View style={styles.ratioHeading}>
          <Button label="−" accessibilityLabel="减少项目栏宽度" subtle
            disabled={projectPercent <= MIN_PROJECT_RATIO * 100} onPress={() => adjustRatio(-0.05)} />
          <Text style={styles.ratioText} testID="project-ratio">Project {projectPercent}% · Session {100 - projectPercent}%</Text>
          <Button label="+" accessibilityLabel="增加项目栏宽度" subtle
            disabled={projectPercent >= MAX_PROJECT_RATIO * 100} onPress={() => adjustRatio(0.05)} />
        </View>
        <View style={styles.ratioPreview} testID="split-preview">
          <View style={{ flex: preferences.projectRatio, backgroundColor: palette.ink }} />
          <View style={{ width: 3, backgroundColor: palette.background }} />
          <View style={{ flex: 1 - preferences.projectRatio, backgroundColor: palette.line }} />
        </View>
      </View>
      <View style={styles.setting}>
        <Text style={styles.label}>其他配置信息</Text>
        {Platform.OS !== 'web' && <>
          <Text style={styles.help}>近期图片：授权后，返回会话时提示添加相册中最近 5 分钟拍摄或修改的图片。仅在确认后上传，不自动发送。</Text>
          <Button label="允许检测近期图片" subtle onPress={() => {
            void allowRecentImages().then((allowed) => setPhotoStatus(allowed ? '已允许，请返回会话查看近期图片' : '未授权，仍可手动添加附件')).catch((e: Error) => setPhotoStatus(e.message));
          }} />
          {!!photoStatus && <Text style={styles.help}>{photoStatus}</Text>}
        </>}
        <View style={styles.info}>
          <Text style={styles.help}>应用版本</Text>
          <Text style={styles.infoValue}>{app.expo.version}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.help}>通用设置存储</Text>
          <Text style={styles.infoValue}>当前设备</Text>
        </View>
        <Button label="恢复默认设置" subtle onPress={() => updatePreferences(DEFAULT_PREFERENCES)}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: 12 }} />
      </View>
      {!!saveError && <Text style={common.error}>{saveError}</Text>}
    </View>
  );
}
const createStyles = (palette: Palette) => StyleSheet.create({
  section: { paddingTop: 38, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: palette.line },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: palette.ink },
  label: { fontSize: 14, fontWeight: '500', color: palette.ink },
  help: { fontSize: 13, lineHeight: 22, color: palette.muted, marginTop: 8 },
  setting: { marginTop: 26 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  choice: { minHeight: 44, minWidth: 58, paddingVertical: 12, paddingHorizontal: 15, borderRadius: 8, backgroundColor: palette.soft, alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontSize: 13, color: palette.ink },
  previewText: { fontSize: 16, lineHeight: 26, color: palette.ink, marginTop: 14 },
  ratioHeading: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  ratioText: { flex: 1, textAlign: 'center', fontSize: 13, lineHeight: 22, color: palette.secondary },
  ratioPreview: { height: 14, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', marginTop: 8 },
  info: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  infoValue: { fontSize: 13, color: palette.secondary, flexShrink: 1 },
});
