// CursorBeam Windows Service Control
// Start, stop, restart the CursorBeam service

const Service = require('node-windows').Service;
const path = require('path');

const command = process.argv[2];

if (!command || !['start', 'stop', 'restart'].includes(command)) {
  console.error('Usage: node service-control.js [start|stop|restart]');
  process.exit(1);
}

console.log('');
console.log('═══════════════════════════════════════════════');
console.log(`  CursorBeam Service - ${command.toUpperCase()}`);
console.log('═══════════════════════════════════════════════');
console.log('');

// Create the service object
const svc = new Service({
  name: 'CursorBeam',
  script: path.join(__dirname, 'src', 'start.ts')
});

// Setup event handlers
svc.on('start', function() {
  console.log('✓ Service started successfully!');
  console.log('');
});

svc.on('stop', function() {
  console.log('✓ Service stopped successfully!');
  console.log('');
  
  if (command === 'restart') {
    console.log('Restarting service...');
    setTimeout(() => svc.start(), 2000);
  }
});

svc.on('error', function(err) {
  console.error('✗ Error:', err.message);
  console.error('');
  
  if (err.message.includes('elevation')) {
    console.error('ERROR: Administrator privileges required!');
    console.error('Please run PowerShell as administrator');
  }
  
  console.error('');
  process.exit(1);
});

// Execute command
console.log(`${command === 'stop' ? 'Stopping' : 'Starting'} service...`);
console.log('');

if (command === 'start') {
  svc.start();
} else if (command === 'stop') {
  svc.stop();
} else if (command === 'restart') {
  svc.stop();
}
