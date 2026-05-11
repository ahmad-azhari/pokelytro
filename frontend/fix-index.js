const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'dist/pokelytro/browser/index.csr.html');
const dest = path.join(__dirname, 'dist/pokelytro/browser/index.html');

if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('Successfully copied index.csr.html to index.html');
} else {
    console.error('index.csr.html not found at ' + src);
}
