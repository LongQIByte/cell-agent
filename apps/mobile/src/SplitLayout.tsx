import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { DIVIDER_WIDTH, MAX_PROJECT_RATIO, MIN_PROJECT_RATIO, projectPaneWidth } from './preferences';
import { usePreferences, useThemedStyles, type Palette } from './ui';

export function SplitLayout({ split, projectHidden, project, children }: {
  split: boolean;
  projectHidden: boolean;
  project: React.ReactNode;
  children: React.ReactNode;
}) {
  const dimensions = useWindowDimensions();
  const [width, setWidth] = useState(dimensions.width);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const { preferences, updatePreferences } = usePreferences();
  const styles = useThemedStyles(createStyles);
  const active = split && !projectHidden;
  const availableWidth = Math.max(1, width - DIVIDER_WIDTH);
  const projectWidth = projectPaneWidth(availableWidth, dragRatio ?? preferences.projectRatio);
  const percent = Math.round(projectWidth / availableWidth * 100);
  const minimum = Math.round(projectPaneWidth(availableWidth, MIN_PROJECT_RATIO) / availableWidth * 100);
  const maximum = Math.round(projectPaneWidth(availableWidth, MAX_PROJECT_RATIO) / availableWidth * 100);
  const current = useRef({ availableWidth, projectWidth, ratio: preferences.projectRatio });
  current.current = { availableWidth, projectWidth, ratio: dragRatio ?? preferences.projectRatio };
  const startWidth = useRef(projectWidth);
  const dragging = useRef(false);
  const finish = useCallback(() => {
    if (dragging.current) {
      dragging.current = false;
      updatePreferences({ projectRatio: Math.round(current.current.ratio * 100) / 100 });
    }
    setDragRatio(null);
  }, [updatePreferences]);
  useEffect(() => { finish(); }, [active, width, finish]);
  const responder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 2,
      onPanResponderGrant: (event) => {
        if (Platform.OS === 'web') event.preventDefault();
        dragging.current = true;
        startWidth.current = current.current.projectWidth;
      },
      onPanResponderMove: (event, gesture) => {
        if (Platform.OS === 'web') event.preventDefault();
        const available = current.current.availableWidth;
        const ratio = projectPaneWidth(available, (startWidth.current + gesture.dx) / available) / available;
        current.current.ratio = ratio;
        setDragRatio(ratio);
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
      onPanResponderTerminationRequest: () => false,
    });
  }, [finish]);
  function adjust(delta: number) {
    const ratio = projectPaneWidth(availableWidth, projectWidth / availableWidth + delta) / availableWidth;
    updatePreferences({ projectRatio: Math.round(ratio * 100) / 100 });
  }
  return (
    <View style={styles.shell} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View testID="project-panel" nativeID="project-pane" style={[
        styles.projectPanel,
        active && [styles.sidebar, { width: projectWidth }],
        projectHidden && styles.hidden,
      ]}>
        {project}
      </View>
      {active && (
        <View testID="pane-divider" accessible accessibilityRole="adjustable"
          accessibilityLabel="调整项目与会话比例"
          accessibilityHint="左右拖动，或使用方向键调整项目栏宽度"
          accessibilityValue={{ min: minimum, max: maximum, now: percent, text: `Project ${percent}%，Session ${100 - percent}%` }}
          aria-valuemin={minimum}
          aria-valuemax={maximum}
          aria-valuenow={percent}
          aria-valuetext={`Project ${percent}%，Session ${100 - percent}%`}
          accessibilityActions={[{ name: 'increment', label: '增加项目栏宽度' }, { name: 'decrement', label: '减少项目栏宽度' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') adjust(0.05);
            if (event.nativeEvent.actionName === 'decrement') adjust(-0.05);
          }}
          {...(Platform.OS === 'web' ? {
            role: 'separator' as const,
            'aria-orientation': 'vertical',
            'aria-controls': 'project-pane',
            tabIndex: 0,
            onKeyDown: (event: { key: string; preventDefault: () => void }) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                adjust(event.key === 'ArrowRight' ? 0.05 : event.key === 'ArrowLeft' ? -0.05 : event.key === 'Home' ? -1 : 1);
              }
            },
          } : {})}
          style={styles.divider} {...responder.panHandlers}>
          <View style={styles.dividerLine} />
          <View style={styles.dividerHandle} />
        </View>
      )}
      {children}
    </View>
  );
}
const createStyles = (palette: Palette) => StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', minHeight: 0 },
  projectPanel: { flex: 1, minWidth: 0 },
  sidebar: Platform.OS === 'web'
    ? { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }
    : { flex: 0, flexShrink: 0 },
  hidden: { display: 'none' },
  divider: { width: DIVIDER_WIDTH, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  dividerLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: palette.line },
  dividerHandle: { width: 4, height: 40, borderRadius: 2, backgroundColor: palette.muted },
});
