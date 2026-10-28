const SIZE_UNITS = ["", "K", "M", "G", "T", "P", "E"] as const;
const MIN_KB_BYTES = 102.4;

/**
 * 把字节量转成紧凑字符串，单位不带 B；小于 102.4 字节时直接输出原数。
 * 数值 ≥100 或没有单位时取整，其余保留一位小数并去掉 `.0`。
 *
 * @example
 * formatSize(6)       // '6'
 * formatSize(1536)    // '1.5K'
 * formatSize(1048576) // '1M'
 */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return "0";
  const sign = bytes < 0 ? "-" : "";
  let value = Math.abs(bytes);
  let unitIndex = value < MIN_KB_BYTES ? 0 : 1;
  if (unitIndex === 1) value /= 1024;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${sign}${value.toFixed(digits).replace(/\.0$/, "")}${SIZE_UNITS[unitIndex]}`;
}
