; CursorBeam Installer Script (Inno Setup)
; Creates a professional Windows installer

#define MyAppName "CursorBeam"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Noam Bars"
#define MyAppURL "https://github.com/noambars121/CursorBeam"
#define MyAppExeName "CursorBeam.exe"

[Setup]
; App information
AppId={{8B3E9C2D-4F7A-4B1E-9D2C-5E8F1A3B6C9D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=..\LICENSE
OutputDir=..\dist
OutputBaseFilename=CursorBeam-Setup-v{#MyAppVersion}
SetupIconFile=..\assets\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

; Visual style
WizardImageFile=..\assets\wizard-image.bmp
WizardSmallImageFile=..\assets\wizard-small.bmp

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "installservice"; Description: "Install as Windows Service (starts automatically)"; GroupDescription: "Service Options:"; Flags: checkedonce
Name: "installtailscale"; Description: "Install Tailscale for remote access (optional)"; GroupDescription: "Network Options:"

[Files]
; Main application files
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "node_modules,dist,.git,.cursor,*.log,terminals"
; Node.js portable (bundled)
Source: "..\tools\node-portable\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\start-gui.bat"; IconFilename: "{app}\assets\icon.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\start-gui.bat"; IconFilename: "{app}\assets\icon.ico"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\start-gui.bat"; IconFilename: "{app}\assets\icon.ico"; Tasks: quicklaunchicon

[Run]
; Install dependencies
Filename: "{app}\node\node.exe"; Parameters: "{app}\node\npm.cmd install --production --no-audit --no-fund"; WorkingDir: "{app}"; StatusMsg: "Installing dependencies..."; Flags: runhidden
; Run setup script
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\installer\post-install.ps1"" -InstallPath ""{app}"""; StatusMsg: "Configuring CursorBeam..."; Flags: runhidden waituntilterminated
; Install service if selected
Filename: "{app}\node\node.exe"; Parameters: "{app}\service-install.cjs"; WorkingDir: "{app}"; StatusMsg: "Installing Windows Service..."; Flags: runhidden; Tasks: installservice
; Open Tailscale download if selected
Filename: "https://tailscale.com/download/windows"; Flags: shellexec skipifsilent; Tasks: installtailscale
; Launch app
Filename: "{app}\start-gui.bat"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Stop and remove service
Filename: "{app}\node\node.exe"; Parameters: "{app}\service-uninstall.cjs"; WorkingDir: "{app}"; Flags: runhidden
; Kill any running processes
Filename: "taskkill"; Parameters: "/F /IM node.exe /T"; Flags: runhidden

[Code]
var
  PasswordPage: TInputQueryWizardPage;
  CursorPathPage: TInputDirWizardPage;
  ProjectsPathPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  // Password input page
  PasswordPage := CreateInputQueryPage(wpSelectTasks,
    'Login Password', 'Enter a password for the web interface',
    'This password will be used to login from your phone or browser.');
  PasswordPage.Add('Password:', True);
  PasswordPage.Values[0] := GeneratePassword();
  
  // Cursor path selection
  CursorPathPage := CreateInputDirPage(wpSelectDir,
    'Cursor Installation', 'Where is Cursor IDE installed?',
    'Select the folder where Cursor.exe is located:', False, '');
  CursorPathPage.Add('');
  CursorPathPage.Values[0] := ExpandConstant('{localappdata}\Programs\cursor');
  
  // Projects folder selection
  ProjectsPathPage := CreateInputDirPage(CursorPathPage.ID,
    'Projects Folder', 'Where are your projects located?',
    'Select your main projects folder (optional):', False, '');
  ProjectsPathPage.Add('');
  ProjectsPathPage.Values[0] := ExpandConstant('{userdocs}\projects');
end;

function GeneratePassword(): String;
var
  i: Integer;
  chars: String;
begin
  chars := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  Result := '';
  for i := 1 to 12 do
    Result := Result + chars[Random(Length(chars)) + 1];
end;

function NextButtonClick(CurID: Integer): Boolean;
begin
  Result := True;
  
  // Validate password
  if CurID = PasswordPage.ID then
  begin
    if Length(PasswordPage.Values[0]) < 4 then
    begin
      MsgBox('Password must be at least 4 characters long.', mbError, MB_OK);
      Result := False;
    end;
  end;
  
  // Validate Cursor path
  if CurID = CursorPathPage.ID then
  begin
    if not FileExists(CursorPathPage.Values[0] + '\Cursor.exe') then
    begin
      if MsgBox('Cursor.exe not found in this location. Continue anyway?', mbConfirmation, MB_YESNO) = IDNO then
        Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvFile: String;
  EnvContent: TArrayOfString;
begin
  if CurStep = ssPostInstall then
  begin
    // Create .env file with user settings
    EnvFile := ExpandConstant('{app}\.env');
    SetArrayLength(EnvContent, 6);
    EnvContent[0] := '# CursorBeam Configuration';
    EnvContent[1] := '# Generated by installer on ' + GetDateTimeString('yyyy-mm-dd hh:nn:ss', '-', ':');
    EnvContent[2] := '';
    EnvContent[3] := 'PASSWORD=' + PasswordPage.Values[0];
    EnvContent[4] := 'CURSOR_EXE=' + CursorPathPage.Values[0] + '\Cursor.exe';
    EnvContent[5] := 'PROJECTS_ROOT=' + ProjectsPathPage.Values[0];
    EnvContent[6] := 'PORT=9800';
    EnvContent[7] := 'CDP_PORT=9222';
    
    SaveStringsToFile(EnvFile, EnvContent, False);
  end;
end;

[Messages]
WelcomeLabel2=This will install [name/ver] on your computer.%n%nCursorBeam lets you control Cursor IDE from any mobile device with a secure web interface.%n%nRecommended: Close Cursor IDE before continuing.
