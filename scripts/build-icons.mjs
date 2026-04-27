import sharp from 'sharp';

const SOURCE = 'src/assets/verba-logo.webp';
const SIZES = [16, 32, 48, 128];

for (const size of SIZES) {
  const out = `src/assets/verba-logo-${size}.png`;
  await sharp(SOURCE)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(out);
  console.log(`✓ ${out}`);
}
