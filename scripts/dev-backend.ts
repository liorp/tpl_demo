const backendPort = process.env.TPL_BACKEND_PORT ?? '8080';

const processHandle = Bun.spawn(
  [
    'uv',
    'run',
    '--project',
    'backend',
    'uvicorn',
    'backend.main:app',
    '--host',
    '0.0.0.0',
    '--port',
    backendPort,
    '--reload',
  ],
  {
    env: process.env,
    stderr: 'inherit',
    stdin: 'inherit',
    stdout: 'inherit',
  },
);

process.exit(await processHandle.exited);
