import React, { memo, useMemo, type ReactNode } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Renderer, useMarkdown, type MarkedStyles } from 'react-native-marked';
import { scaleTextStyles, useThemedStyles, useUI, type Palette } from './ui';
import { RemoteFileLink } from './RemoteFileLink';
import { isRemoteFileLink } from './remote-file';
import { ChatImage } from './ChatImage';

class ChatMarkdownRenderer extends Renderer {
  image(uri: string, alt?: string): ReactNode {
    return <ChatImage key={this.getKey()} source={uri} name={alt || '图片'} />;
  }
  constructor(private readonly styles: ReturnType<typeof createStyles>) {
    super({ selectable: true });
  }
  heading(children: string | ReactNode[], textStyle?: TextStyle): ReactNode {
    return (
      <Text key={this.getKey()} selectable accessibilityRole="header" style={textStyle}>
        {children}
      </Text>
    );
  }

  code(
    text: string,
    language?: string,
    containerStyle?: ViewStyle,
    textStyle?: TextStyle,
  ): ReactNode {
    return (
      <View key={this.getKey()} style={this.styles.codeBlock}>
        {!!language && <Text style={this.styles.codeLanguage}>{language}</Text>}
        <ScrollView
          horizontal
          nestedScrollEnabled
          testID="markdown-code-scroll"
          contentContainerStyle={containerStyle}
        >
          <View style={{ flexShrink: 0 }}>
            <Text selectable style={[textStyle, { flexShrink: 0 }]}>
              {text}
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  table(
    header: ReactNode[][],
    rows: ReactNode[][][],
    tableStyle?: ViewStyle,
    rowStyle?: ViewStyle,
    cellStyle?: ViewStyle,
  ): ReactNode {
    return (
      <View key={this.getKey()} style={this.styles.table} testID="markdown-table">
        {super.table(header, rows, tableStyle, rowStyle, cellStyle)}
      </View>
    );
  }

  link(children: string | ReactNode[], href: string, textStyle?: TextStyle): ReactNode {
    if (isRemoteFileLink(href)) return <RemoteFileLink key={this.getKey()} source={href} style={textStyle}>{children}</RemoteFileLink>;
    return (
      <Text
        key={this.getKey()}
        selectable
        accessibilityRole="link"
        accessibilityHint="打开链接"
        {...(Platform.OS === 'web'
          ? { href, target: '_blank', rel: 'noopener noreferrer' }
          : {
              onPress: () => {
                void Linking.openURL(href).catch((error: Error) =>
                  Alert.alert('无法打开链接', error.message),
                );
              },
            })}
        style={textStyle}
      >
        {children}
      </Text>
    );
  }
}

export const MarkdownMessage = memo(function MarkdownMessage({ text }: { text: string }) {
  const { palette, scheme, fontScale } = useUI();
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useMemo(() => scaleTextStyles(createMarkdownStyles(palette), fontScale), [palette, fontScale]);
  // Start the renderer's keys at the same position for every streamed parse so
  // unchanged code blocks and tables retain their horizontal scroll position.
  const renderer = useMemo(() => new ChatMarkdownRenderer(styles), [text, styles]);
  const elements = useMarkdown(text, { renderer, styles: markdownStyles, colorScheme: scheme });
  return <View style={styles.body}>{elements}</View>;
});

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const createMarkdownStyles = (palette: Palette): MarkedStyles => ({
  text: { fontSize: 16, lineHeight: 26, color: palette.ink },
  paragraph: { paddingVertical: 0, marginVertical: 7 },
  h1: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '700',
    marginTop: 19,
    marginBottom: 10,
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  h2: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '600',
    marginTop: 17,
    marginBottom: 9,
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  h3: { fontSize: 19, lineHeight: 27, fontWeight: '600', marginTop: 15, marginBottom: 8 },
  h4: { fontSize: 17, lineHeight: 25, fontWeight: '600', marginTop: 13, marginBottom: 7 },
  h5: { fontSize: 16, lineHeight: 24, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  h6: { fontSize: 15, lineHeight: 23, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  strong: { fontWeight: '700', lineHeight: 26 },
  em: { lineHeight: 26 },
  strikethrough: { lineHeight: 26 },
  link: { color: palette.link, textDecorationLine: 'underline', fontStyle: 'normal', lineHeight: 26 },
  blockquote: {
    marginVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: palette.line,
    paddingLeft: 14,
    opacity: 1,
  },
  codespan: {
    fontFamily: mono,
    fontSize: 14,
    lineHeight: 24,
    fontStyle: 'normal',
    fontWeight: '400',
    backgroundColor: palette.soft,
  },
  code: { padding: 14, backgroundColor: palette.soft, minWidth: '100%' },
  codeText: { fontFamily: mono, fontSize: 13, lineHeight: 21, color: palette.code },
  list: { marginVertical: 3 },
  li: { fontSize: 16, lineHeight: 26, color: palette.ink, flexShrink: 1 },
  table: { borderWidth: 1, borderColor: palette.line },
  tableRow: { flexDirection: 'row', backgroundColor: palette.soft },
  tableCell: { padding: 10 },
  hr: { borderBottomColor: palette.line, marginVertical: 15 },
});

const createStyles = (palette: Palette) => StyleSheet.create({
  body: { width: '100%', minWidth: 0 },
  codeBlock: {
    maxWidth: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: palette.soft,
    marginVertical: 10,
  },
  codeLanguage: { fontSize: 11, color: palette.secondary, paddingTop: 10, paddingHorizontal: 14 },
  table: { maxWidth: '100%', marginVertical: 12 },
});
