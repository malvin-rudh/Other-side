// Local entry for POST /api/explain: node http server around the platform
// neutral handler. Function Compute wiring lives in fc.ts and is documented
// in docs/deploy-fc.md; this file is the development and smoke-test path.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config';
import { loadEnvFile } from './loadEnvFile';
import { buildApiHandlerFromEnv } from './app';
import { hasValidDemoToken } from './explain';
import { handleNodeRequest } from './nodeHttp';

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig(process.env);
  const handler = await buildApiHandlerFromEnv();

  const server = http.createServer((req, res) => {
    handleNodeRequest(req, res, handler, {
      isAuthorized: (authorization) => hasValidDemoToken(authorization, config.demoToken),
    });
  });

  server.listen(config.port, () => {
    console.log(`other-side server listening on http://localhost:${config.port}/api/explain`);
    console.log(`provider status at http://localhost:${config.port}/api/provider/status`);
  });
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}

export { main };
