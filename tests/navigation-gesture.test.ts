import test from 'node:test';
import assert from 'node:assert/strict';
import { horizontalBackSwipe } from '../apps/mobile/src/navigation-gesture.js';
import { rememberDevices } from '../apps/mobile/src/catalog-state.js';

test('intentional swipes return in either direction without treating scrolling or small movements as back', () => {
  assert.equal(horizontalBackSwipe(180, 15, 120), true);
  assert.equal(horizontalBackSwipe(-180, -15, 120), true);
  assert.equal(horizontalBackSwipe(30, 2, 120), false);
  assert.equal(horizontalBackSwipe(160, 140, 120), false);
  assert.equal(horizontalBackSwipe(80, 180, 120), false);
});

test('known computers survive failed authentication without reporting cached online status', () => {
  const computer = { id: 'a', name: 'Computer', platform: 'darwin', online: true, lastSeen: 1 };
  const unknown = rememberDevices([computer], [], false);
  assert.deepEqual(unknown, [{ ...computer, online: false }]);
  assert.deepEqual(rememberDevices(unknown, [computer], true), [computer]);
  assert.deepEqual(rememberDevices([], [computer], false), [{ ...computer, online: false }]);
});
