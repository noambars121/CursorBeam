import { CdpClient } from './cdp-client.js';

async function test() {
  const CDP_BASE = process.env.V2_CDP_BASE || 'http://127.0.0.1:9222';
  const targets = await CdpClient.fetchTargets(CDP_BASE);
  const wb = CdpClient.findWorkbench(targets);
  const client = new CdpClient(wb.webSocketDebuggerUrl);
  await client.connect();
  
  const result = await client.evaluate(`
    (function() {
      const imgs = document.querySelectorAll('img');
      const pills = document.querySelectorAll('.image-pill, .image-attachment, [class*="image-"]');
      const files = document.querySelector('input[type="file"]')?.files;
      return {
        imgs: imgs.length,
        pills: pills.length,
        fileCount: files ? files.length : 0,
        fileName: files && files.length > 0 ? files[0].name : null,
      };
    })()
  `);
  console.log(result);
  client.disconnect();
}

test().catch(console.error);