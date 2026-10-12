import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { useUI } from './ui';
type Name =
  | 'plus'
  | 'chevron'
  | 'projects'
  | 'settings'
  | 'attach'
  | 'send'
  | 'stop'
  | 'search'
  | 'close'
  | 'back'
  | 'archive'
  | 'restore'
  | 'check';
export function Icon({
  name,
  size = 22,
  color,
}: {
  name: Name;
  size?: number;
  color?: string;
}) {
  const { palette } = useUI();
  const stroke = color ?? palette.ink;
  const paths: Partial<Record<Name, string>> = {
    plus: 'M12 5v14M5 12h14',
    chevron: 'm6 9 6 6 6-6',
    attach: 'm9 17 8-8a3 3 0 0 0-4-4l-8 8a5 5 0 0 0 7 7l8-8',
    send: 'M12 19V5m-6 6 6-6 6 6',
    search: 'm16 16 4 4',
    close: 'm6 6 12 12M18 6 6 18',
    back: 'm14 6-6 6 6 6',
    archive: 'M4 8v12h16V8M9 12h6',
    restore: 'M4 8v12h16V8M12 17v-6m-3 3 3-3 3 3',
    check: 'm5 12 4 4L19 6',
    settings:
      'm9.5 3-.6 2.1-2 .9-1.9-.6-2 3.4 1.6 1.5v2.4L3 14.2l2 3.4 2-.6 2 .9.5 2.1h4.8l.5-2.1 2-.9 2 .6 2-3.4-1.6-1.5v-2.4l1.6-1.5-2-3.4-2 .6-2-.9L14.3 3Z',
  };
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] && <Path d={paths[name]} />}
      {name === 'settings' && <Circle cx={12} cy={11.9} r={3} />}
      {name === 'search' && <Circle cx={10.5} cy={10.5} r={6.5} />}
      {(name === 'archive' || name === 'restore') && <Rect x={3} y={3} width={18} height={5} rx={1} />}
      {name === 'projects' && (
        <>
          <Rect x={4} y={4} width={16} height={6} rx={1.2} />
          <Rect x={4} y={14} width={16} height={6} rx={1.2} />
        </>
      )}
      {name === 'stop' && (
        <Rect x={7} y={7} width={10} height={10} rx={1} fill={stroke} stroke="none" />
      )}
    </Svg>
  );
}
