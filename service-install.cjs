// CursorBeam Windows Service Installer
// Installs CursorBeam as a Windows Service (daemon)

const Service = require('node-windows').Service;
const path = require('path');
const fs = require('fs');

console.log('');
console.log('═══════════════════════════════════════════════');
console.log('  CursorBeam Service Installer');
console.log('═══════════════════════════════════════════════');
console.log('');

// Check if .env exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: .env file not found!');
  console.error('Please run setup first: npm run setup');
  console.error('');
  process.exit(1);
}

// Create the service object
const svc = new Service({
  name: 'CursorBeam',
  description: 'CursorBeam - Supervisor and relay server for remote Cursor IDE control',
  script: path.join(__dirname, 'src', 'supervisor.ts'),
  nodeOptions: [
    '--import', 'tsx/esm'
  ],
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    },
    {
      name: "V2_LAN",
      value: "1"
    }
  ],
  workingDirectory: __dirname,
  allowServiceLogon: true
});

// Listen for install event
svc.on('install', function() {
  console.log('✓ Service installed successfully!');
  console.log('');
  console.log('Starting service...');
  svc.start();
});

// Listen for start event
svc.on('start', function() {
  console.log('✓ Service started successfully!');
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  Service Information');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('Name:        CursorBeam');
  console.log('Status:      Running');
  console.log('Startup:     Automatic');
  console.log('');
  console.log('To manage the service:');
  console.log('  • View in Services: Win+R → services.msc');
  console.log('  • Stop service:     npm run service:stop');
  console.log('  • Restart service:  npm run service:restart');
  console.log('  • Uninstall:        npm run service:uninstall');
  console.log('');
  console.log('The service will now start automatically on boot!');
  console.log('');
});

// Listen for already installed
svc.on('alreadyinstalled', function() {
  console.log('⚠ Service is already installed!');
  console.log('');
  console.log('To reinstall:');
  console.log('  1. npm run service:uninstall');
  console.log('  2. npm run service:install');
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
    console.error('  4. Run: npm run service:install');
  }
  
  console.error('');
  process.exit(1);
});

console.log('Installing CursorBeam as Windows Service...');
console.log('');
console.log('⚠ Note: This requires administrator privileges');
console.log('');

// Install the service
svc.install();
