import { CdpClient } from './cdp-client.js';
import fs from 'node:fs';
import path from 'node:path';

async function test() {
  const CDP_BASE = process.env.V2_CDP_BASE || 'http://127.0.0.1:9222';
  const targets = await CdpClient.fetchTargets(CDP_BASE);
  const wb = CdpClient.findWorkbench(targets);
  const client = new CdpClient(wb.webSocketDebuggerUrl);
  await client.connect();
  
  // Create a dummy image
  const imgPath = path.resolve('v2/dummy.png');
  fs.writeFileSync(imgPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
  
  const { root } = await client.send('DOM.getDocument', { depth: -1 });
  const inputs = await client.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: 'input[type="file"]'
  });
  
  if (inputs.nodeIds.length === 0) {
    console.log('No file input found');
    client.disconnect();
    return;
  }
  
  console.log('Injecting to nodeId:', inputs.nodeIds[0]);
  
  await client.send('DOM.setFileInputFiles', {
    nodeId: inputs.nodeIds[0],
    files: [imgPath]
  });
  
  console.log('Injected. Waiting 2s...');
  await new Promise(r => setTimeout(r, 2000));
  
  client.disconnect();
}

test().catch(console.error);