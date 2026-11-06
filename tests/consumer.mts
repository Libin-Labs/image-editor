import {
  createImage,
  editImage,
  type RgbaImage,
  type ImageOperation,
  type ImageLimits,
} from '@lp-labs/image-editor';
const limits: ImageLimits = { maxPixels: 10, maxWork: 20 };
const input: RgbaImage = createImage(1, 1, new Uint8ClampedArray([1, 2, 3, 4]), limits);
const operations: ImageOperation[] = [
  { type: 'brightness', amount: 20 },
  { type: 'crop', x: 0, y: 0, width: 1, height: 1 },
];
const result: RgbaImage = editImage(input, operations, limits);
void result;
// @ts-expect-error no unsupported browser codec operation
editImage(input, [{ type: 'decode', format: 'png' }]);
