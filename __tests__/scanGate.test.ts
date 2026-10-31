import { createScanGate } from '../src/logic/scanGate';

test('accepts a new code immediately', () => {
  const gate = createScanGate(1200);
  expect(gate.accept('A', 0)).toBe(true);
});

test('ignores the same code while it stays in view', () => {
  const gate = createScanGate(1200);
  expect(gate.accept('A', 0)).toBe(true);
  // the camera keeps seeing it every 250 ms for 10 seconds
  for (let t = 250; t <= 10_000; t += 250) expect(gate.accept('A', t)).toBe(false);
});

test('accepts the same code again once it has been out of view long enough', () => {
  const gate = createScanGate(1200);
  gate.accept('A', 0);
  gate.accept('A', 500);
  expect(gate.accept('A', 1600)).toBe(false); // 1.1 s gap: still treated as the same pass
  expect(gate.accept('A', 3000)).toBe(true); // 1.4 s without seeing it: a new scan
});

test('a different code is accepted straight away', () => {
  const gate = createScanGate(1200);
  gate.accept('A', 0);
  expect(gate.accept('B', 100)).toBe(true);
  expect(gate.accept('A', 200)).toBe(true);
});

test('hold() treats the code as still in view (e.g. while a sheet is open)', () => {
  const gate = createScanGate(1200);
  gate.accept('A', 0);
  gate.hold(5000); // sheet closed at 5 s; sticker may still be in front of the camera
  expect(gate.accept('A', 5300)).toBe(false);
  expect(gate.accept('A', 7000)).toBe(true);
});

test('ignores empty codes', () => {
  expect(createScanGate().accept('  ', 0)).toBe(false);
});
