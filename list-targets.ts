import { CdpClient } from './v2/cdp-client.js';

async function main() {
  try {
    const targets = await CdpClient.fetchTargets();
    console.log("Targets found:", targets.length);
    for (const t of targets) {
      console.log(`- [${t.type}] ${t.title} (${t.url})`);
    }
  } catch (err) {
    console.error(err);
  }
}
main();