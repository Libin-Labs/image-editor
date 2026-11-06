export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export type ImageOperation =
  | { type: 'brightness'; amount: number }
  | { type: 'contrast'; factor: number }
  | { type: 'saturation'; factor: number }
  | { type: 'crop'; x: number; y: number; width: number; height: number };
export interface ImageLimits {
  maxPixels?: number;
  maxOperations?: number;
  maxWork?: number;
}
function limit(value: number | undefined, fallback: number, ceiling: number): number {
  const n = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(n) || n < 1 || n > ceiling) throw new RangeError('Invalid image limit');
  return n;
}
function size(width: number, height: number, maxPixels: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > maxPixels
  )
    throw new RangeError('Invalid or excessive image dimensions');
}
function limitsFor(limits: ImageLimits): { pixels: number; operations: number; work: number } {
  return {
    pixels: limit(limits.maxPixels, 16_777_216, 16_777_216),
    operations: limit(limits.maxOperations, 64, 64),
    work: limit(limits.maxWork, 67_108_864, 67_108_864),
  };
}
/** Copies straight-alpha RGBA bytes. No buffer is retained, shared, or mutated. */
export function createImage(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  limits: ImageLimits = {},
): RgbaImage {
  const { pixels } = limitsFor(limits);
  size(width, height, pixels);
  if (!(data instanceof Uint8ClampedArray) || data.length !== width * height * 4)
    throw new TypeError('Expected exact RGBA byte buffer');
  if (typeof SharedArrayBuffer !== 'undefined' && data.buffer instanceof SharedArrayBuffer)
    throw new TypeError('Shared buffers are unsupported');
  return { width, height, data: data.slice() };
}
function parameter(value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new RangeError('Invalid operation parameter');
}
function snapshot(operation: ImageOperation): ImageOperation {
  if (!operation || typeof operation !== 'object') throw new TypeError('Invalid operation');
  const result: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(operation)) {
    if (!['type', 'amount', 'factor', 'x', 'y', 'width', 'height'].includes(key))
      throw new TypeError('Unknown operation property');
    const property = Object.getOwnPropertyDescriptor(operation, key)!;
    if (!('value' in property)) throw new TypeError('Operation accessors are unsupported');
    result[key] = property.value;
  }
  if (Object.getOwnPropertySymbols(operation).length)
    throw new TypeError('Symbol operation keys are unsupported');
  return result as unknown as ImageOperation;
}
/** Applies operations in order, rounding/clamping bytes after EACH operation. Alpha is preserved. */
export function editImage(
  input: RgbaImage,
  operations: readonly ImageOperation[],
  limits: ImageLimits = {},
): RgbaImage {
  const bounds = limitsFor(limits);
  size(input.width, input.height, bounds.pixels);
  if (!Array.isArray(operations) || operations.length > bounds.operations)
    throw new RangeError('Operation limit exceeded');
  const plan = operations.map(snapshot);
  let width = input.width;
  let height = input.height;
  let work = width * height;
  // Validate the entire plan and work before allocating output or visiting pixels.
  for (const op of plan) {
    if (!op || typeof op !== 'object') throw new TypeError('Invalid operation');
    switch (op.type) {
      case 'brightness':
        parameter(op.amount, -255, 255);
        break;
      case 'contrast':
      case 'saturation':
        parameter(op.factor, 0, 16);
        break;
      case 'crop':
        size(op.width, op.height, bounds.pixels);
        if (
          !Number.isSafeInteger(op.x) ||
          !Number.isSafeInteger(op.y) ||
          op.x < 0 ||
          op.y < 0 ||
          op.x + op.width > width ||
          op.y + op.height > height
        )
          throw new RangeError('Crop outside image');
        width = op.width;
        height = op.height;
        break;
      default:
        throw new TypeError('Unknown image operation');
    }
    work += width * height;
    if (work > bounds.work) throw new RangeError('Pixel work limit exceeded');
  }
  if (work > bounds.work) throw new RangeError('Pixel work limit exceeded');
  let image = createImage(input.width, input.height, input.data, limits);
  for (const op of plan) {
    if (op.type === 'crop') {
      const data = new Uint8ClampedArray(op.width * op.height * 4);
      for (let y = 0; y < op.height; y++) {
        const offset = ((op.y + y) * image.width + op.x) * 4;
        data.set(image.data.subarray(offset, offset + op.width * 4), y * op.width * 4);
      }
      image = { width: op.width, height: op.height, data };
      continue;
    }
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!,
        g = data[i + 1]!,
        b = data[i + 2]!;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      for (let c = 0; c < 3; c++) {
        const v = data[i + c]!;
        const next =
          op.type === 'brightness'
            ? v + op.amount
            : op.type === 'contrast'
              ? (v - 127.5) * op.factor + 127.5
              : luma + (v - luma) * op.factor;
        data[i + c] = Math.round(Math.max(0, Math.min(255, next)));
      }
    }
  }
  return image;
}
