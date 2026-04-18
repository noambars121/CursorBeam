import { CdpClient } from './cdp-client.js';

async function test() {
  const CDP_BASE = process.env.V2_CDP_BASE || 'http://127.0.0.1:9222';
  const targets = await CdpClient.fetchTargets(CDP_BASE);
  const wb = CdpClient.findWorkbench(targets);
  const client = new CdpClient(wb.webSocketDebuggerUrl);
  await client.connect();
  
  const { root } = await client.send('DOM.getDocument', { depth: -1 });
  const inputs = await client.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: 'input[type="file"]'
  });
  
  console.log('File inputs found:', inputs.nodeIds.length);
  
  for (const id of inputs.nodeIds) {
    try {
      const { outerHTML } = await client.send('DOM.getOuterHTML', { nodeId: id });
      console.log('HTML:', outerHTML);
    } catch(err) {
      console.error(err);
    }
  }
  
  client.disconnect();
}

test().catch(console.error);