/**
 * PWA 아이콘 생성 스크립트
 * 기존 logo-dark.png에서 다양한 사이즈의 PWA 아이콘을 생성합니다.
 *
 * 사용법: npx tsx scripts/generate-pwa-icons.ts
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const SOURCE_IMAGE = path.join(process.cwd(), 'public', 'logo-dark.png');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'icons');

// PWA 아이콘 사이즈 목록
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// 앱 배경색 (manifest.json과 일치)
const BACKGROUND_COLOR = '#1f2937';

async function generateIcons() {
  console.log('🎨 PWA 아이콘 생성 시작...\n');

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 디렉토리 생성: ${OUTPUT_DIR}`);
  }

  // 소스 이미지 확인
  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.error(`❌ 소스 이미지를 찾을 수 없습니다: ${SOURCE_IMAGE}`);
    process.exit(1);
  }

  // 소스 이미지 메타데이터 확인
  const metadata = await sharp(SOURCE_IMAGE).metadata();
  console.log(`📷 소스 이미지: ${metadata.width}x${metadata.height} (${metadata.format})\n`);

  // 각 사이즈별 아이콘 생성
  for (const size of ICON_SIZES) {
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);

    try {
      // 정사각형 캔버스에 로고 중앙 배치
      await sharp(SOURCE_IMAGE)
        .resize(Math.round(size * 0.75), Math.round(size * 0.75), {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .extend({
          top: Math.round(size * 0.125),
          bottom: Math.round(size * 0.125),
          left: Math.round(size * 0.125),
          right: Math.round(size * 0.125),
          background: BACKGROUND_COLOR,
        })
        .resize(size, size) // 최종 사이즈 보정
        .png()
        .toFile(outputPath);

      console.log(`✅ ${size}x${size} 아이콘 생성 완료`);
    } catch (error) {
      console.error(`❌ ${size}x${size} 아이콘 생성 실패:`, error);
    }
  }

  // Apple Touch Icon (180x180)
  const appleTouchPath = path.join(OUTPUT_DIR, 'apple-touch-icon.png');
  await sharp(SOURCE_IMAGE)
    .resize(135, 135, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: 22,
      bottom: 23,
      left: 22,
      right: 23,
      background: BACKGROUND_COLOR,
    })
    .resize(180, 180)
    .png()
    .toFile(appleTouchPath);
  console.log(`✅ Apple Touch Icon (180x180) 생성 완료`);

  // Favicon (32x32)
  const faviconPath = path.join(OUTPUT_DIR, 'favicon-32x32.png');
  await sharp(SOURCE_IMAGE)
    .resize(24, 24, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: 4,
      bottom: 4,
      left: 4,
      right: 4,
      background: BACKGROUND_COLOR,
    })
    .resize(32, 32)
    .png()
    .toFile(faviconPath);
  console.log(`✅ Favicon (32x32) 생성 완료`);

  // Favicon 16x16
  const favicon16Path = path.join(OUTPUT_DIR, 'favicon-16x16.png');
  await sharp(SOURCE_IMAGE)
    .resize(12, 12, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: 2,
      bottom: 2,
      left: 2,
      right: 2,
      background: BACKGROUND_COLOR,
    })
    .resize(16, 16)
    .png()
    .toFile(favicon16Path);
  console.log(`✅ Favicon (16x16) 생성 완료`);

  // Maskable 아이콘 (Android 적응형 아이콘용, 더 큰 안전 영역)
  const maskableSize = 512;
  const maskablePath = path.join(OUTPUT_DIR, 'icon-maskable-512x512.png');
  await sharp(SOURCE_IMAGE)
    .resize(Math.round(maskableSize * 0.6), Math.round(maskableSize * 0.6), {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: Math.round(maskableSize * 0.2),
      bottom: Math.round(maskableSize * 0.2),
      left: Math.round(maskableSize * 0.2),
      right: Math.round(maskableSize * 0.2),
      background: BACKGROUND_COLOR,
    })
    .resize(maskableSize, maskableSize)
    .png()
    .toFile(maskablePath);
  console.log(`✅ Maskable 아이콘 (512x512) 생성 완료`);

  // 바로가기 아이콘 (96x96)
  const shortcutIcons = [
    { name: 'shortcut-events', emoji: '🎮' },
    { name: 'shortcut-leaderboard', emoji: '🏆' },
  ];

  for (const shortcut of shortcutIcons) {
    const shortcutPath = path.join(OUTPUT_DIR, `${shortcut.name}.png`);

    // 간단한 배경 아이콘 생성
    await sharp({
      create: {
        width: 96,
        height: 96,
        channels: 4,
        background: BACKGROUND_COLOR,
      },
    })
      .png()
      .toFile(shortcutPath);

    console.log(`✅ 바로가기 아이콘 (${shortcut.name}) 생성 완료`);
  }

  // Badge 아이콘 (알림용, 72x72)
  const badgePath = path.join(OUTPUT_DIR, 'badge-72x72.png');
  await sharp(SOURCE_IMAGE)
    .resize(54, 54, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: 9,
      bottom: 9,
      left: 9,
      right: 9,
      background: BACKGROUND_COLOR,
    })
    .resize(72, 72)
    .png()
    .toFile(badgePath);
  console.log(`✅ Badge 아이콘 (72x72) 생성 완료`);

  console.log('\n🎉 모든 PWA 아이콘 생성 완료!');
  console.log(`📁 출력 경로: ${OUTPUT_DIR}`);

  // 생성된 파일 목록 출력
  const files = fs.readdirSync(OUTPUT_DIR);
  console.log(`\n📦 생성된 파일 (${files.length}개):`);
  files.forEach((file) => {
    const stats = fs.statSync(path.join(OUTPUT_DIR, file));
    console.log(`   - ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
  });
}

generateIcons().catch(console.error);
