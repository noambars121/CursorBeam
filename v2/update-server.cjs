const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'relay-server.ts');
let content = fs.readFileSync(serverFile, 'utf8');

// Update POST /send endpoint
const oldSendRegex = /if \(method === 'POST' && url\.pathname === '\/send'\) \{[\s\S]*?const result = await manager\.sendPrompt\(prompt\);\s*sendJson\(res, result\.ok \? 200 : 422, result\);\s*return;\s*\}/;

const newSendBlock = `if (method === 'POST' && url.pathname === '/send') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { prompt?: string; images?: string[] };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
        sendJson(res, 400, { error: 'Missing or empty "prompt" field' });
        return;
      }

      const prompt = body.prompt.trim();
      log(\`POST /send → "\${prompt.substring(0, 60)}\${prompt.length > 60 ? '...' : ''}"\`);

      // Inject images if provided
      if (body.images && Array.isArray(body.images) && body.images.length > 0) {
        for (const dataUrl of body.images) {
          let base64 = dataUrl;
          let ext = 'png';
          const match = base64.match(/^data:image\\/(\\w+);base64,(.+)$/);
          if (match) {
            ext = match[1] === 'jpeg' ? 'jpg' : match[1];
            base64 = match[2];
          }
          let buf: Buffer;
          try {
            buf = Buffer.from(base64, 'base64');
          } catch {
            log('Skipping invalid image base64');
            continue;
          }
          const tmpName = \`cursor-remote-\${crypto.randomBytes(6).toString('hex')}.\${ext}\`;
          const tmpPath = path.join(os.tmpdir(), tmpName);
          try {
            fs.writeFileSync(tmpPath, buf);
            await manager.injectImage(tmpPath);
          } finally {
            try { fs.unlinkSync(tmpPath); } catch {}
          }
        }
      }

      const result = await manager.sendPrompt(prompt);
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }`;

content = content.replace(oldSendRegex, newSendBlock);

fs.writeFileSync(serverFile, content);
console.log('relay-server.ts updated successfully.');
