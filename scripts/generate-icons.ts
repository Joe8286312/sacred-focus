import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// CRC32 计算实现
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * 生成包含 Sacred Focus 标志性暗金 Hexagon 图形的纯色/渐变 RGBA PNG 缓冲
 */
export function generateSacredFocusPng(size: number): Buffer {
  const width = size;
  const height = size;

  // IHDR 数据块
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // Compression
  ihdr.writeUInt8(0, 11); // Filter
  ihdr.writeUInt8(0, 12); // Interlace

  // 构建未压缩像素数据 (每行首字节为 filter byte = 0)
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowBytes);

  const cx = width / 2;
  const cy = height / 2;
  const maxR = width / 2;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData.writeUInt8(0, rowOffset); // None filter

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 圆角矩形背景 / 外环
      let r = 10, g = 10, b = 12, a = 255; // #0A0A0C

      // 金色六边形 / 晶体几何映射
      const angle = Math.atan2(dy, dx);
      // 六边形距离
      const hexDist = dist * Math.cos((Math.abs(angle) % (Math.PI / 3)) - Math.PI / 6);

      if (hexDist < maxR * 0.75 && hexDist > maxR * 0.70) {
        // 外边框金色光环
        r = 245; g = 158; b = 11; a = 240; // #F59E0B
      } else if (dist < maxR * 0.40) {
        // 核心聚焦晶体 (明亮金与青蓝辉光)
        const diamondDist = Math.abs(dx) + Math.abs(dy);
        if (diamondDist < maxR * 0.28) {
          r = 254; g = 243; b = 199; a = 255; // #FEF3C7
        } else {
          r = 217; g = 119; b = 6; a = 220; // #D97706
        }
      } else if (dist > maxR * 0.88) {
        // 圆角矩形外边缘裁剪 (透明度微调)
        const cornerDist = Math.hypot(Math.max(0, Math.abs(dx) - (cx - 24)), Math.max(0, Math.abs(dy) - (cy - 24)));
        if (cornerDist > 24) {
          a = 0;
        }
      }

      rawData.writeUInt8(r, pxOffset);
      rawData.writeUInt8(g, pxOffset + 1);
      rawData.writeUInt8(b, pxOffset + 2);
      rawData.writeUInt8(a, pxOffset + 3);
    }
  }

  const idatData = zlib.deflateSync(rawData);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * 将 PNG 包装为标准 ICO 格式
 */
export function pngToIco(pngBuffer: Buffer, size = 64): Buffer {
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // ICO type (1 for icon)
  icoHeader.writeUInt16LE(1, 4); // Number of images (1)

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(size >= 256 ? 0 : size, 0); // Width
  dirEntry.writeUInt8(size >= 256 ? 0 : size, 1); // Height
  dirEntry.writeUInt8(0, 2); // Color palette
  dirEntry.writeUInt8(0, 3); // Reserved
  dirEntry.writeUInt16LE(1, 4); // Color planes
  dirEntry.writeUInt16LE(32, 6); // Bits per pixel
  dirEntry.writeUInt32LE(pngBuffer.length, 8); // Image size in bytes
  dirEntry.writeUInt32LE(22, 12); // Offset (6 + 16 = 22)

  return Buffer.concat([icoHeader, dirEntry, pngBuffer]);
}

export function writeAllAssets(targetDir: string) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const png192 = generateSacredFocusPng(192);
  const png512 = generateSacredFocusPng(512);
  const png180 = generateSacredFocusPng(180);
  const png64 = generateSacredFocusPng(64);
  const ico = pngToIco(png64, 64);

  fs.writeFileSync(path.join(targetDir, 'pwa-192x192.png'), png192);
  fs.writeFileSync(path.join(targetDir, 'pwa-512x512.png'), png512);
  fs.writeFileSync(path.join(targetDir, 'apple-touch-icon.png'), png180);
  fs.writeFileSync(path.join(targetDir, 'favicon.ico'), ico);

  console.log(`✓ 成功生成全部 Sacred Focus 图标资产 -> ${targetDir}`);
}

// 独立脚本直接执行入口
const isMain = process.argv[1] && (process.argv[1].endsWith('generate-icons.js') || process.argv[1].endsWith('generate-icons.ts'));
if (isMain) {
  const defaultOut = path.resolve(__dirname, '../frontend/public');
  writeAllAssets(defaultOut);
}
