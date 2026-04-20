import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 9800,
      path,
      method,
      agent,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(body))
      } : {}
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('\n=== Testing CursorBeam Terminal API ===\n');

  // 1. Login
  console.log('1. Logging in...');
  const login = await request('POST', '/login', { password: '7177' });
  console.log('   Status:', login.status);
  console.log('   Token:', login.data.token?.substring(0, 20) + '...');
  
  if (!login.data.token) {
    console.error('   ERROR: No token received!');
    return;
  }

  const token = login.data.token;

  // 2. Get terminal status
  console.log('\n2. Getting terminal status...');
  const headers = { 'Authorization': `Bearer ${token}` };
  const termStatus = await request('GET', '/terminal', null);
  termStatus.headers = headers;
  
  const termReq = https.request({
    hostname: 'localhost',
    port: 9800,
    path: '/terminal',
    method: 'GET',
    agent,
    headers
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const termData = JSON.parse(data);
        console.log('   Status:', res.statusCode);
        console.log('   Available:', termData.available);
        console.log('   Tabs:', termData.tabs?.length || 0);
        if (termData.tabs) {
          termData.tabs.forEach((tab, i) => {
            console.log(`     [${i}] ${tab.name} ${tab.active ? '(active)' : ''}`);
          });
        }
        console.log('   Content length:', (termData.content || '').length);
        
        if (termData.tabs && termData.tabs.length > 1) {
          // 3. Try to select terminal tab
          testSelectTab(token, 0);
        } else {
          console.log('\n⚠️  Need at least 2 terminal tabs open in Cursor to test tab selection');
        }
      } catch (e) {
        console.error('   ERROR parsing response:', data);
      }
    });
  });
  termReq.on('error', (e) => console.error('   ERROR:', e.message));
  termReq.end();
}

async function testSelectTab(token, index) {
  console.log(`\n3. Testing select terminal tab ${index}...`);
  
  const selectReq = https.request({
    hostname: 'localhost',
    port: 9800,
    path: '/terminal/select',
    method: 'POST',
    agent: new https.Agent({ rejectUnauthorized: false }),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        console.log('   Status:', res.statusCode);
        console.log('   Result:', result);
      } catch {
        console.log('   Raw response:', data);
      }
    });
  });
  
  selectReq.on('error', (e) => console.error('   ERROR:', e.message));
  selectReq.write(JSON.stringify({ index }));
  selectReq.end();
  
  // Wait a bit then test exit
  setTimeout(() => testExit(token), 2000);
}

async function testExit(token) {
  console.log('\n4. Testing terminal input (exit)...');
  
  const inputReq = https.request({
    hostname: 'localhost',
    port: 9800,
    path: '/terminal/input',
    method: 'POST',
    agent: new https.Agent({ rejectUnauthorized: false }),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        console.log('   Status:', res.statusCode);
        console.log('   Result:', result);
      } catch {
        console.log('   Raw response:', data);
      }
      
      console.log('\n=== Test Complete ===\n');
    });
  });
  
  inputReq.on('error', (e) => console.error('   ERROR:', e.message));
  inputReq.write(JSON.stringify({ text: 'exit', enter: true }));
  inputReq.end();
}

test().catch(console.error);
