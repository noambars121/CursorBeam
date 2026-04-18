import { CdpClient } from './cdp-client.js';

async function test() {
  const CDP_BASE = process.env.V2_CDP_BASE || 'http://127.0.0.1:9222';
  const targets = await CdpClient.fetchTargets(CDP_BASE);
  const wb = CdpClient.findWorkbench(targets);
  const client = new CdpClient(wb.webSocketDebuggerUrl);
  await client.connect();
  
  const result = await client.evaluate(`
    (function() {
      const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
      return inputs.map(i => {
        return {
          id: i.id,
          class: i.className,
          accept: i.accept,
          parentClass: i.parentElement?.className,
          rect: i.getBoundingClientRect().width
        };
      });
    })()
  `);
  console.log(JSON.stringify(result, null, 2));
  client.disconnect();
}

test().catch(console.error);