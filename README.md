# @lp-labs/image-editor

Real straight-alpha RGBA byte pipelines: brightness, contrast, saturation, and integer crop.
No browser globals, codecs, image loading, canvas, external assets, or native dependency.

## Install and quickstart

```sh
npm install @lp-labs/image-editor
```

```js
import { createImage, editImage } from '@lp-labs/image-editor';

const input = createImage(2, 1, new Uint8ClampedArray([0, 100, 240, 255, 20, 30, 40, 42]));
const output = editImage(input, [
  { type: 'brightness', amount: 20 },
  { type: 'crop', x: 1, y: 0, width: 1, height: 1 },
]);
console.log(output.width, [...output.data]); // 1 [40, 50, 60, 42]
console.log([...input.data]); // unchanged
```

## API and types

- `createImage(width, height, data, limits?): RgbaImage` validates dimensions and the exact
  `Uint8ClampedArray` length (`width * height * 4`) and copies bytes. Shared buffers are rejected.
- `editImage(input, operations, limits?): RgbaImage` validates/snapshots the full operation plan
  and work budget before allocating or visiting pixels. Copies input even for an empty plan.
  Operations must use own data properties; accessors and unknown property names are rejected.
- `RgbaImage`: positive integer `width`, `height`, independent mutable `data: Uint8ClampedArray`.
  Top-left origin, row-major interleaved R/G/B/A, no row padding.
- `ImageOperation` discriminated union:
  - `{ type: 'brightness', amount }`: `amount` finite in [-255, 255]; adds to each RGB channel.
  - `{ type: 'contrast', factor }`: finite `factor` in [0, 16]; `(channel - 127.5) * factor + 127.5`.
  - `{ type: 'saturation', factor }`: finite `factor` in [0, 16]; luminance
    `Y = 0.2126 R + 0.7152 G + 0.0722 B`, then `Y + (channel - Y) * factor`.
  - `{ type: 'crop', x, y, width, height }`: nonnegative integer origin and positive integer size,
    entirely inside the current image; coordinates apply after preceding crops.
- `ImageLimits`: optional positive safe integer `maxPixels`, `maxOperations`, `maxWork`.

Every adjustment clamps RGB to [0, 255] and applies `Math.round` after **each operation**. This
uses round-half-up, not typed-array ties-to-even. Alpha is unchanged, including RGB in transparent
pixels. Saturation is on encoded byte channels, not linear-light/color-managed luminance.
Operation order and intermediate rounding/clipping matter. Crop copies selected rows.
Input bytes are never mutated, retained, or shared with output. You own returned bytes.

## Customization, errors, and limits

Compose only the documented operations; your application supplies decoded, straight-alpha RGBA
data and handles encoding separately. Defaults/hard ceilings: 16,777,216 pixels, 64 operations,
67,108,864 pixel visits. Limits may only be lowered. Work counts the initial full copy plus each
adjustment's current pixel count and each crop's output pixel count. No-op adjustments still count.
This bounds visiting work; callers should use smaller limits for tight memory budgets. Old crop
buffers may coexist until garbage collection, and input/output full buffers coexist.

Invalid dimensions, crop bounds, numeric parameters, work/count limits throw `RangeError`.
Wrong buffer type/length, shared buffers, unknown operations/properties, accessor operations,
and malformed plans throw `TypeError`. Zero dimensions and fractional crop geometry are rejected.
There is no blur, resize, rotation, selection mask, premultiplication, ICC conversion, browser
codec, EXIF processing, or file/network I/O. Do not concurrently detach or modify input buffers.

## Modules and development

Independent ESM/CJS with declarations and zero runtime/peer dependencies.
CommonJS: `const { createImage, editImage } = require('@lp-labs/image-editor')`.
TypeScript ^5.9.3 and Prettier ^3.6.2 are development-only.
Run `npm run build`, `npm run typecheck`, `npm test`, `npm run format`, `npm run format:check`.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
