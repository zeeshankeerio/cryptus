const fs = require('fs');
const path = require('path');

const filesToFix = [
  'components/screener-dashboard.tsx',
  'lib/screener-service.ts',
  'lib/indicators.ts',
  'lib/correlation-engine.ts',
  'public/ticker-worker.js',
  'public/derivatives-worker.js',
  'public/manifest.json',
  'package.json',
  'lib/portfolio-scanner.ts',
  'lib/signal-narration.ts',
  'lib/symbol-utils.ts',
  'hooks/use-derivatives-intel.ts',
  'lib/push-service.ts',
  'lib/nowpayments.ts',
  'lib/derivatives-types.ts',
  'lib/lru-cache.ts',
  'lib/price-utils.ts',
  'lib/utils.ts'
];

filesToFix.forEach(relPath => {
  const fullPath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) return;
  
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    const newContent = content.replace(/-/g, '-').replace(/–/g, '-');
    
    if (content !== newContent) {
      fs.writeFileSync(fullPath, newContent, 'utf8');
      console.log(`Updated: ${relPath}`);
    }
  } catch (e) {
    console.error(`Error processing ${relPath}:`, e.message);
  }
});
