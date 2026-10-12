export function horizontalBackSwipe(dx: number, dy: number, minimumDistance: number) {
  return Math.abs(dx) >= minimumDistance && Math.abs(dy) <= 80 && Math.abs(dx) > Math.abs(dy) * 2.5;
}
