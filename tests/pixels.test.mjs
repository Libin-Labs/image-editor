import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createImage, editImage } from '../dist/esm/index.js';
const image = (bytes, width = 1, height = 1) =>
  createImage(width, height, new Uint8ClampedArray(bytes));
test('brightness changes RGB, clamps channels and preserves alpha', () => {
  assert.deepEqual(
    [...editImage(image([0, 240, 100, 42]), [{ type: 'brightness', amount: 30 }]).data],
    [30, 255, 130, 42],
  );
  assert.deepEqual(
    [...editImage(image([0, 240, 100, 42]), [{ type: 'brightness', amount: -255 }]).data],
    [0, 0, 0, 42],
  );
});
test('contrast uses midpoint 127.5 and explicit round-half-up', () => {
  assert.deepEqual(
    [...editImage(image([0, 128, 255, 13]), [{ type: 'contrast', factor: 0 }]).data],
    [128, 128, 128, 13],
  );
  assert.deepEqual(
    [...editImage(image([64, 128, 200, 13]), [{ type: 'contrast', factor: 2 }]).data],
    [1, 129, 255, 13],
  );
});
test('saturation zero uses documented encoded-channel luminance', () => {
  assert.deepEqual(
    [...editImage(image([255, 0, 0, 0]), [{ type: 'saturation', factor: 0 }]).data],
    [54, 54, 54, 0],
  );
  assert.deepEqual(
    [...editImage(image([2, 100, 240, 200]), [{ type: 'saturation', factor: 1 }]).data],
    [2, 100, 240, 200],
  );
});
test('crop copies exact rows and operates on latest dimensions', () => {
  const bytes = Array.from({ length: 24 }, (_, i) => i);
  const result = editImage(image(bytes, 3, 2), [
    { type: 'crop', x: 1, y: 0, width: 2, height: 2 },
    { type: 'crop', x: 1, y: 1, width: 1, height: 1 },
  ]);
  assert.deepEqual([result.width, result.height, [...result.data]], [1, 1, [20, 21, 22, 23]]);
});
test('pipeline order and per-step quantization are observable', () => {
  const input = image([250, 20, 100, 99]);
  const a = editImage(input, [
    { type: 'brightness', amount: 20 },
    { type: 'contrast', factor: 0.5 },
  ]);
  const b = editImage(input, [
    { type: 'contrast', factor: 0.5 },
    { type: 'brightness', amount: 20 },
  ]);
  assert.deepEqual([...a.data], [191, 84, 124, 99]);
  assert.deepEqual([...b.data], [209, 94, 134, 99]);
  assert.deepEqual(
    [
      ...editImage(image([0, 0, 0, 1]), [
        { type: 'brightness', amount: 0.5 },
        { type: 'brightness', amount: 0.5 },
      ]).data,
    ],
    [2, 2, 2, 1],
  );
});
test('input buffers and no-op output are never retained or mutated', () => {
  const bytes = new Uint8ClampedArray([1, 2, 3, 4]);
  const input = createImage(1, 1, bytes);
  bytes[0] = 250;
  assert.equal(input.data[0], 1);
  const result = editImage(input, []);
  result.data[0] = 100;
  assert.equal(input.data[0], 1);
  assert.notEqual(result.data.buffer, input.data.buffer);
});
test('scalar oracle verifies all channels over representative byte grid', () => {
  const clamp = (v) => Math.round(Math.min(255, Math.max(0, v)));
  for (let r = 0; r <= 255; r += 51)
    for (let g = 0; g <= 255; g += 51)
      for (let b = 0; b <= 255; b += 51) {
        let expected = [r, g, b];
        expected = expected.map((v) => clamp(v - 12.25));
        expected = expected.map((v) => clamp(127.5 + (v - 127.5) * 1.2));
        const y = expected[0] * 0.2126 + expected[1] * 0.7152 + expected[2] * 0.0722;
        expected = expected.map((v) => clamp(y + (v - y) * 0.3));
        const result = editImage(image([r, g, b, 17]), [
          { type: 'brightness', amount: -12.25 },
          { type: 'contrast', factor: 1.2 },
          { type: 'saturation', factor: 0.3 },
        ]);
        assert.deepEqual([...result.data], [...expected, 17]);
      }
});
test('dimensions length typed buffers and shared ownership reject', () => {
  for (const [w, h] of [
    [0, 1],
    [1, -1],
    [1.1, 1],
    [Infinity, 1],
    [16_777_217, 1],
  ])
    assert.throws(() => createImage(w, h, new Uint8ClampedArray()), RangeError);
  assert.throws(() => createImage(1, 1, new Uint8ClampedArray(3)), TypeError);
  assert.throws(() => createImage(1, 1, new Uint8Array(4)), TypeError);
  assert.throws(
    () => createImage(1, 1, new Uint8ClampedArray(new SharedArrayBuffer(4))),
    TypeError,
  );
});
test('operation parameters and crop boundaries validate before editing', () => {
  const input = image([1, 2, 3, 4]);
  for (const op of [
    { type: 'brightness', amount: NaN },
    { type: 'brightness', amount: 256 },
    { type: 'contrast', factor: Infinity },
    { type: 'saturation', factor: -1 },
    { type: 'crop', x: 0.5, y: 0, width: 1, height: 1 },
    { type: 'crop', x: 1, y: 0, width: 1, height: 1 },
  ])
    assert.throws(() => editImage(input, [op]), RangeError);
  assert.throws(() => editImage(input, [{ type: 'blur' }]), TypeError);
  let calls = 0;
  assert.throws(
    () =>
      editImage(input, [
        {
          type: 'brightness',
          get amount() {
            calls++;
            return 1;
          },
        },
      ]),
    TypeError,
  );
  assert.equal(calls, 0);
  assert.deepEqual([...input.data], [1, 2, 3, 4]);
});
test('pixel operation and work bounds include initial copy and cropped output', () => {
  const input = image(Array(16).fill(1), 2, 2);
  assert.throws(() => editImage(input, [], { maxPixels: 3 }), RangeError);
  assert.throws(() => editImage(input, [], { maxWork: 3 }), RangeError);
  assert.throws(
    () =>
      editImage(
        input,
        [
          { type: 'brightness', amount: 0 },
          { type: 'contrast', factor: 1 },
        ],
        { maxOperations: 1 },
      ),
    RangeError,
  );
  assert.throws(
    () => editImage(input, [{ type: 'brightness', amount: 0 }], { maxWork: 7 }),
    RangeError,
  );
  assert.equal(
    editImage(input, [{ type: 'crop', x: 0, y: 0, width: 1, height: 1 }], { maxWork: 5 }).data
      .length,
    4,
  );
  assert.throws(() => editImage(input, [], { maxOperations: 65 }), RangeError);
});
test('CommonJS performs identical real pixel pipeline', () => {
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  const input = image([10, 20, 30, 40]);
  const ops = [
    { type: 'saturation', factor: 2 },
    { type: 'brightness', amount: 10 },
  ];
  assert.deepEqual(cjs.editImage(input, ops), editImage(input, ops));
  assert.deepEqual(cjs.createImage(1, 1, input.data), input);
});
