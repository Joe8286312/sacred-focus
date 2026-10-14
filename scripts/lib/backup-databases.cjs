// Fed to `node -` in the running image, including versions predating multiuser support.
const fs = require('node:fs');
const path = require('node:path');
const Database = require(require.resolve('better-sqlite3', { paths: [process.cwd(), path.join(process.cwd(), 'backend')] }));

async function main() {
  const dataDir = path.resolve(process.argv[2]);
  const filename = process.argv[3];
  if (!/^app_(backup|pre_update)_\d{8}_\d{6}\.db$/.test(filename)) throw new Error('Invalid backup filename');
  const outputDir = path.join(dataDir, 'backup');
  const accountsName = filename.slice(0, -3) + '_accounts';
  const manifestName = filename + '.manifest.json';
  fs.mkdirSync(outputDir, { recursive: true });
  for (const name of [filename, accountsName, manifestName]) {
    if (fs.existsSync(path.join(outputDir, name))) throw new Error('Backup target already exists');
  }
  const sources = [{ accountId: 'admin', source: 'app.db', snapshot: filename }];
  const accountsDir = path.join(dataDir, 'accounts');
  if (fs.existsSync(accountsDir)) {
    if (fs.lstatSync(accountsDir).isSymbolicLink()) throw new Error('Account directory cannot be a symbolic link');
    for (const name of fs.readdirSync(accountsDir).sort()) {
      const folder = path.join(accountsDir, name);
      const source = path.join(folder, 'app.db');
      if (!fs.existsSync(source)) continue;
      if (fs.lstatSync(folder).isSymbolicLink() || fs.lstatSync(source).isSymbolicLink()
        || !/^(public|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(name)) throw new Error('Unexpected account database path');
      sources.push({ accountId: name, source: `accounts/${name}/app.db`, snapshot: `${accountsName}/${name}/app.db` });
    }
  }
  const stage = fs.mkdtempSync(path.join(outputDir, `.${filename}.tmp-`));
  const moved = [];
  try {
    for (const item of sources) {
      const sourcePath = path.join(dataDir, item.source);
      if (fs.lstatSync(sourcePath).isSymbolicLink()) throw new Error('Invalid source database');
      const target = path.join(stage, item.snapshot);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const sourceDb = new Database(sourcePath, { readonly: true, fileMustExist: true });
      try { await sourceDb.backup(target); } finally { sourceDb.close(); }
      const targetDb = new Database(target, { readonly: true, fileMustExist: true });
      try {
        const result = targetDb.pragma('quick_check', { simple: true });
        if (result !== 'ok') throw new Error('Backup integrity check failed');
      } finally { targetDb.close(); }
      fs.chmodSync(target, 0o600);
    }
    fs.writeFileSync(path.join(stage, manifestName), JSON.stringify({
      formatVersion: 1, createdAt: new Date().toISOString(), consistency: 'per-database', method: 'better-sqlite-online', databases: sources
    }, null, 2) + '\n', { mode: 0o600 });
    for (const name of [accountsName, manifestName, filename]) {
      const item = path.join(stage, name);
      if (fs.existsSync(item)) {
        const final = path.join(outputDir, name);
        fs.renameSync(item, final);
        moved.push(final);
      }
    }
  } catch (error) {
    for (const item of moved.reverse()) fs.rmSync(item, { recursive: true, force: true });
    throw error;
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

main().catch(error => { console.error('SQLite backup failed:', error.message); process.exitCode = 2; });
