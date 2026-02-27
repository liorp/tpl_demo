const backendPort = process.env.TPL_BACKEND_PORT ?? '';
const shouldWatch = process.argv.includes('--watch');

const buildArgs = [
  'build',
  './src/main.tsx',
  '--target',
  'browser',
  '--define',
  `__TPL_BACKEND_PORT__="${backendPort}"`,
  '--outfile',
  './dist/asset/main.js',
  '--minify',
];

if (shouldWatch) {
  buildArgs.push('--watch');
}

const processHandle = Bun.spawn(['bun', ...buildArgs], {
  env: process.env,
  stderr: 'inherit',
  stdin: 'inherit',
  stdout: 'inherit',
});

process.exit(await processHandle.exited);
