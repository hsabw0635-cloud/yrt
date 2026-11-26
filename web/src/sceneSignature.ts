/**
 * بصمة مكان مبسّطة للصورة الفورية.
 * تُحسب في المتصفح من نفس الإطار الذي يُلتقط، ثم تُرسل مع الصورة ليقارنها
 * السيرفر بصور زملاء الطالب في الجلسة نفسها. لا تحتوي على أي بيانات جغرافية.
 */

export interface SceneSignature {
  v: 1;
  /** 16×16 تدرّج رمادي بعد تصغير الصورة */
  gray: number[];
  /** مدرّج ألوان 3×3×3 (27 خانة) */
  color: number[];
  /** مدرّج اتجاهات الحواف (8 خانات) */
  edges: number[];
}

const SIZE = 48;
const GRID = 16;

const round = (value: number) => Math.round(value * 1000) / 1000;

function normalize(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return values.map(() => 0);
  return values.map((value) => round(value / total));
}

export function createSceneSignature(source: HTMLCanvasElement): SceneSignature | null {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(source, 0, 0, SIZE, SIZE);
  const { data } = context.getImageData(0, 0, SIZE, SIZE);

  const luminance = new Float32Array(SIZE * SIZE);
  const colorBins = new Array<number>(27).fill(0);

  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    luminance[index] = 0.299 * red + 0.587 * green + 0.114 * blue;

    const r = Math.min(2, Math.floor(red / 86));
    const g = Math.min(2, Math.floor(green / 86));
    const b = Math.min(2, Math.floor(blue / 86));
    colorBins[r * 9 + g * 3 + b] += 1;
  }

  const gray: number[] = [];
  const cell = SIZE / GRID;
  for (let gy = 0; gy < GRID; gy += 1) {
    for (let gx = 0; gx < GRID; gx += 1) {
      let sum = 0;
      for (let y = 0; y < cell; y += 1) {
        for (let x = 0; x < cell; x += 1) {
          sum += luminance[(gy * cell + y) * SIZE + gx * cell + x];
        }
      }
      gray.push(round(sum / (cell * cell)));
    }
  }

  const edgeBins = new Array<number>(8).fill(0);
  for (let y = 1; y < SIZE - 1; y += 1) {
    for (let x = 1; x < SIZE - 1; x += 1) {
      const at = (px: number, py: number) => luminance[py * SIZE + px];
      const gx =
        -at(x - 1, y - 1) + at(x + 1, y - 1) -
        2 * at(x - 1, y) + 2 * at(x + 1, y) -
        at(x - 1, y + 1) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const magnitude = Math.hypot(gx, gy);
      if (magnitude < 12) continue;
      let angle = Math.atan2(gy, gx);
      if (angle < 0) angle += Math.PI;
      const bin = Math.min(7, Math.floor((angle / Math.PI) * 8));
      edgeBins[bin] += magnitude;
    }
  }

  return { v: 1, gray, color: normalize(colorBins), edges: normalize(edgeBins) };
}
