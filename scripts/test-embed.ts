const url = new URL('../src/assets/mpv.app.tar.gz', import.meta.url);
console.log('import.meta.url:', import.meta.url);
console.log('import.meta.dir:', import.meta.dir);
console.log('resolved URL:   ', url.href);

const f = Bun.file(url);
console.log('size:', await f.size);
console.log('exists:', await f.exists());
