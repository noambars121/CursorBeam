# Icon Generation

The PWA requires two icon files:
- `icon-192.png` (192x192 pixels)
- `icon-512.png` (512x512 pixels)

## Quick Generation Options:

### Option 1: Online Tool
Visit [favicon.io/favicon-generator](https://favicon.io/favicon-generator/) or similar:
- Text: "CM"
- Background: #007acc (blue)
- Font: Bold, white color
- Download as PNG and rename to icon-192.png and icon-512.png

### Option 2: SVG to PNG (if you have ImageMagick)
```bash
# Install ImageMagick
choco install imagemagick

# Convert the SVG
magick convert -density 192 -background "#007acc" icon-192.svg icon-192.png
magick convert -density 512 -background "#007acc" icon-192.svg icon-512.png
```

### Option 3: Use Placeholder
For testing, you can use simple colored squares:
- Create any 192x192 and 512x512 blue images with "CM" text
- The PWA will work fine with placeholders

### Option 4: Node.js Script (if you have canvas)
```javascript
// Requires: npm install canvas
const { createCanvas } = require('canvas');
const fs = require('fs');

function generateIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#007acc';
  ctx.fillRect(0, 0, size, size);
  
  // Text
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size * 0.4}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CM', size / 2, size / 2);
  
  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
}

generateIcon(192, 'src/web/public/icon-192.png');
generateIcon(512, 'src/web/public/icon-512.png');
console.log('Icons generated!');
```

## Current Status

The SVG placeholder is in `icon-192.svg`. Replace with actual PNG files before deploying.

