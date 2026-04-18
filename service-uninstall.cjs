// CursorBeam Windows Service Uninstaller
// Removes CursorBeam Windows Service

const Service = require('node-windows').Service;
const path = require('path');

console.log('');
console.log('═══════════════════════════════════════════════');
console.log('  CursorBeam Service Uninstaller');
console.log('═══════════════════════════════════════════════');
console.log('');

// Create the service object
const svc = new Service({
  name: 'CursorBeam',
  script: path.join(__dirname, 'src', 'start.ts')
});

// Listen for uninstall event
svc.on('uninstall', function() {
  console.log('✓ Service uninstalled successfully!');
  console.log('');
  console.log('CursorBeam service has been removed.');
  console.log('The service will no longer start automatically.');
  console.log('');
  console.log('To reinstall: npm run service:install');
  console.log('');
});

// Listen for already uninstalled
svc.on('alreadyuninstalled', function() {
  console.log('⚠ Service is not installed');
  console.log('');
});

// Listen for error
svc.on('error', function(err) {
  console.error('✗ Error:', err.message);
  console.error('');
  
  if (err.message.includes('elevation')) {
    console.error('ERROR: Administrator privileges required!');
    console.error('');
    console.error('Please run as administrator:');
    console.error('  1. Right-click PowerShell');
    console.error('  2. Select "Run as administrator"');
    console.error('  3. Navigate to this folder');
    console.error('  4. Run: npm run service:uninstall');
  }
  
  console.error('');
  process.exit(1);
});

console.log('Uninstalling CursorBeam Windows Service...');
console.log('');

// Uninstall the service
svc.uninstall();
