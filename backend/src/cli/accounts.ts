import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { initDatabase, rootDb, closeAllDatabases } from '../db.js';
import { createAccountRepository, isPersonalUsername, normalizeUsername } from '../repositories/accountRepository.js';

const HELP = `服务器账号管理（无网页注册入口）
  accounts create <用户名> [--password-stdin]
  accounts list
  accounts disable <用户名>
  accounts enable <用户名>
  accounts reset-password <用户名> [--password-stdin]

默认隐藏输入密码；自动化时使用 --password-stdin 从标准输入读取一行。
用户名为 3–32 位字母/数字/点/下划线/连字符，admin/public 为保留名称。
新密码至少 12 字符且最多 72 UTF-8 字节。停用和改密会立即使旧会话失效。`;

async function readPassword(fromStdin: boolean): Promise<string> {
  if (fromStdin) {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk.toString();
      if (Buffer.byteLength(input, 'utf8') > 1024) throw new Error('密码输入过长');
    }
    return input.replace(/\r?\n$/, '');
  }
  if (!process.stdin.isTTY) throw new Error('非交互终端请使用 --password-stdin，禁止把密码放入命令参数');
  process.stdout.write('请输入密码（隐藏输入）：');
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let password = '';
    function finish(error?: Error) {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('data', onData);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(password);
    }
    function onData(chunk: string) {
      for (const character of chunk) {
        if (character === '\u0003') return finish(new Error('操作已取消'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') password = Array.from(password).slice(0, -1).join('');
        else if (character >= ' ') password += character;
        if (Buffer.byteLength(password, 'utf8') > 1024) return finish(new Error('密码输入过长'));
      }
    }
    process.stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const [command, username, ...flags] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') { console.log(HELP); return; }
  if (!['create', 'list', 'disable', 'enable', 'reset-password'].includes(command)) throw new Error(HELP);
  if (command !== 'list' && !username) throw new Error('请提供用户名');
  if (command === 'list' ? Boolean(username) : flags.some(flag => flag !== '--password-stdin')) throw new Error('存在不支持的参数');
  if (flags.length && !['create', 'reset-password'].includes(command)) throw new Error('此命令不接受密码参数');
  if (command === 'create' && !isPersonalUsername(normalizeUsername(username))) {
    throw new Error('用户名须为 3–32 位字母、数字、点、下划线或连字符，且不能使用 admin/public');
  }
  initDatabase();
  const accounts = createAccountRepository(rootDb, { maxAccounts: config.maxPersonalAccounts });
  if (command === 'list') {
    const rows = accounts.list();
    console.log(`个人账号 ${rows.length}/${config.maxPersonalAccounts}（含停用账号；admin/public 不计入）`);
    console.table(rows.map(({ username: name, disabled, createdAt }) => ({ username: name, status: disabled ? '停用' : '启用', createdAt })));
    return;
  }
  const existing = accounts.findByUsername(username);
  if (command === 'create' && existing) throw new Error('用户名已存在');
  if (command !== 'create' && !existing) throw new Error('个人账号不存在；管理员密码请通过服务器环境配置管理');
  if (command === 'disable' || command === 'enable') {
    accounts.setDisabled(existing!.id, command === 'disable');
    console.log(`${existing!.username} 已${command === 'disable' ? '停用' : '启用'}，旧会话已失效`);
    return;
  }
  const password = await readPassword(flags.includes('--password-stdin'));
  if (Array.from(password).length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('密码至少 12 字符，且最多 72 UTF-8 字节');
  const passwordHash = await bcrypt.hash(password, 12);
  if (command === 'create') {
    const account = accounts.create({ username, passwordHash });
    console.log(`已创建个人账号 ${account.username}`);
  } else {
    accounts.setPasswordHash(existing!.id, passwordHash);
    console.log(`${existing!.username} 密码已重置，旧会话已失效`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : '账号管理失败');
  process.exitCode = 1;
}).finally(closeAllDatabases);
