const fs = require('fs');
const path = require('path');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(function(childItemName) {
      copyRecursiveSync(path.join(src, childItemName),
                        path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

const src = path.join(__dirname, 'frontend/dist/pokelytro/browser');
const dest = path.join(__dirname, 'dist/pokelytro/browser');

if (fs.existsSync(src)) {
    copyRecursiveSync(src, dest);
    console.log('Successfully moved build to root dist folder');
} else {
    console.error('Source directory not found: ' + src);
    process.exit(1);
}
