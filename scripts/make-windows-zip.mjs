// Builds release/Canal-Sugar-Offboarding-Windows.zip: the web app, a Windows Node runtime and double-click launchers.
// Usage: npm run package:windows      (needs: npm, python3 with Pillow for the icon, zip)
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const NODE_VERSION = '22.23.3'
const NAME = 'Canal-Sugar-Offboarding'
const root = process.cwd()
const cache = join(root, 'scripts', '.cache')
const out = join(root, 'release')
const stage = join(out, NAME)
const crlf = (s) => s.replace(/\r?\n/g, '\r\n')
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })

console.log('1/5 building the web app'); run('npm', ['run', 'build'])

console.log('2/5 getting the Windows runtime (node.exe)')
mkdirSync(cache, { recursive: true })
const nodeExe = join(cache, `node-${NODE_VERSION}`, 'package', 'bin', 'node.exe')
if (!existsSync(nodeExe)) {
  const tgz = `node-win-x64-${NODE_VERSION}.tgz`
  run('npm', ['pack', `node-win-x64@${NODE_VERSION}`], { cwd: cache })
  mkdirSync(join(cache, `node-${NODE_VERSION}`), { recursive: true })
  run('tar', ['-xzf', join(cache, tgz), '-C', join(cache, `node-${NODE_VERSION}`)])
}
if (readFileSync(nodeExe).subarray(0, 2).toString() !== 'MZ') throw new Error('node.exe is not a Windows program')

console.log('3/5 assembling the folder')
rmSync(out, { recursive: true, force: true })
const files = join(stage, 'files'), more = join(stage, 'More')
mkdirSync(join(files, 'runtime'), { recursive: true }); mkdirSync(join(files, 'server')); mkdirSync(more, { recursive: true })
copyFileSync(nodeExe, join(files, 'runtime', 'node.exe'))
cpSync(join(root, 'dist'), join(files, 'www'), { recursive: true })
copyFileSync(join(root, 'scripts', 'server.cjs'), join(files, 'server', 'server.cjs'))
run('python3', [join(root, 'scripts', 'make_icon.py'), join(root, 'public', 'logo-dark.png'), join(files, 'icon.ico')])

const tpl = (name, dest) => writeFileSync(dest, crlf(readFileSync(join(root, 'scripts', 'windows', name), 'utf8')))
tpl('Install Canal Sugar Offboarding.bat', join(stage, 'Install Canal Sugar Offboarding.bat'))   // the one file people run
tpl('launch.ps1', join(files, 'launch.ps1')); tpl('make-shortcut.ps1', join(files, 'make-shortcut.ps1'))
tpl('Open with a window (for problems).bat', join(more, 'Open with a window (for problems).bat'))
tpl('Stop Canal Sugar Offboarding.bat', join(more, 'Stop Canal Sugar Offboarding.bat'))
copyFileSync(join(root, 'public', 'setup-guide.html'), join(stage, 'Setup guide (with pictures).html'))
writeFileSync(join(stage, 'README.txt'), crlf(readFileSync(join(root, 'scripts', 'README-windows.txt'), 'utf8')))

console.log('4/5 zipping')
const zip = join(out, `${NAME}-Windows.zip`)
run('zip', ['-r', '-q', '-9', zip, NAME], { cwd: out })
console.log('5/5 done ->', zip)
