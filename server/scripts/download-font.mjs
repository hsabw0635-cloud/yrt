import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf';
const targetDir = path.join(process.cwd(), 'server/assets/fonts');
const target = path.join(targetDir, 'NotoSansArabic.ttf');

await fs.mkdir(targetDir, { recursive: true });

async function viaFetch() {
  const response = await fetch(url, { headers: { 'Accept-Encoding': 'identity' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
}

function viaCurl() {
  const binary = process.platform === 'win32' ? 'curl.exe' : 'curl';
  execFileSync(binary, ['--fail', '--location', '--retry', '5', '--retry-all-errors', '--output', target, url], { stdio: 'inherit' });
}

try {
  await viaFetch();
} catch (error) {
  console.warn(`تعذر تحميل الخط عبر fetch (${error.message})، سيتم استخدام curl...`);
  viaCurl();
}

const stat = await fs.stat(target);
if (stat.size < 100000) throw new Error('ملف الخط الذي تم تنزيله غير مكتمل');
console.log(`تم حفظ الخط في ${target} (${Math.round(stat.size / 1024)} KB)`);
