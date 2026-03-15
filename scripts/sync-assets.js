const fs = require('fs');
const path = require('path');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = stats && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

const standalonePath = path.join('.next', 'standalone');
if (fs.existsSync(standalonePath)) {
  console.log('[sync] Next.js standalone directory detected. Syncing assets...');
  
  // 1. Sync .next/static
  const staticSrc = path.join('.next', 'static');
  const staticDest = path.join(standalonePath, '.next', 'static');
  if (fs.existsSync(staticSrc)) {
    console.log(`[sync] Copying ${staticSrc} -> ${staticDest}`);
    copyRecursiveSync(staticSrc, staticDest);
  }

  // 2. Sync public
  const publicSrc = 'public';
  const publicDest = path.join(standalonePath, 'public');
  if (fs.existsSync(publicSrc)) {
    console.log(`[sync] Copying ${publicSrc} -> ${publicDest}`);
    copyRecursiveSync(publicSrc, publicDest);
  }
  
  console.log('[sync] Asset synchronization complete.');
} else {
  console.log('[sync] Standalone directory not found. Skipping asset sync.');
}
