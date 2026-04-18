; CursorBeam Installer Script (Inno Setup 6)
; Creates a professional Windows installer for CursorBeam.

#define MyAppName "CursorBeam"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Noam Bars"
#define MyAppURL "https://github.com/noambars121/CursorBeam"
#define MyAppExeName "start-gui.bat"

[Setup]
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
UninstallDisplayIcon={app}\assets\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableDirPage=no
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "installservice"; Description: "Install as Windows Service (auto-start on boot)"; GroupDescription: "Service Options:"; Flags: unchecked
Name: "installtailscale"; Description: "Install Tailscale for remote access (optional)"; GroupDescription: "Network Options:"; Flags: unchecked

[Files]
; Core app files — exclude build/dev junk and anything sensitive.
Source: "..\src\*";                DestDir: "{app}\src";                Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\assets\*";             DestDir: "{app}\assets";             Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\installer\post-install.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "..\package.json";         DestDir: "{app}";                    Flags: ignoreversion
Source: "..\package-lock.json";    DestDir: "{app}";                    Flags: ignoreversion skipifsourcedoesntexist
Source: "..\tsconfig.json";        DestDir: "{app}";                    Flags: ignoreversion
Source: "..\start-gui.bat";        DestDir: "{app}";                    Flags: ignoreversion
Source: "..\service-install.cjs";  DestDir: "{app}";                    Flags: ignoreversion
Source: "..\service-uninstall.cjs";DestDir: "{app}";                    Flags: ignoreversion
Source: "..\service-control.cjs";  DestDir: "{app}";                    Flags: ignoreversion
Source: "..\LICENSE";              DestDir: "{app}";                    Flags: ignoreversion
Source: "..\README.md";            DestDir: "{app}";                    Flags: ignoreversion

; Portable Node (produced by build-installer.ps1 before compilation)
Source: "..\tools\node-portable\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\start-gui.bat"; IconFilename: "{app}\assets\icon.ico"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\start-gui.bat"; IconFilename: "{app}\assets\icon.ico"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; Install production dependencies with the bundled Node (portable npm-cli.js).
Filename: "{app}\node\node.exe"; \
  Parameters: """{app}\node\node_modules\npm\bin\npm-cli.js"" install --omit=dev --no-audit --no-fund --silent"; \
  WorkingDir: "{app}"; StatusMsg: "Installing dependencies (this may take a minute)..."; Flags: runhidden waituntilterminated

; Run post-install script (shortcuts, env fixup)
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\post-install.ps1"" -InstallPath ""{app}"""; \
  StatusMsg: "Configuring CursorBeam..."; Flags: runhidden waituntilterminated

; Install Windows Service if requested
Filename: "{app}\node\node.exe"; Parameters: """{app}\service-install.cjs"""; WorkingDir: "{app}"; \
  StatusMsg: "Installing Windows Service..."; Flags: runhidden; Tasks: installservice

; Open Tailscale download in browser if requested
Filename: "https://tailscale.com/download/windows"; Flags: shellexec skipifsilent; Tasks: installtailscale

; Offer to launch the app
Filename: "{app}\start-gui.bat"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; \
  Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\node\node.exe"; Parameters: """{app}\service-uninstall.cjs"""; WorkingDir: "{app}"; Flags: runhidden; RunOnceId: "UninstallService"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\logs"
Type: files; Name: "{app}\.env"

[Code]
var
  PasswordPage: TInputQueryWizardPage;
  CursorPathPage: TInputDirWizardPage;
  ProjectsPathPage: TInputDirWizardPage;

function GeneratePassword(Len: Integer): String;
var
  i: Integer;
  chars: String;
begin
  chars := 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  Result := '';
  for i := 1 to Len do
    Result := Result + chars[Random(Length(chars)) + 1];
end;

function GenerateHex(Len: Integer): String;
var
  i: Integer;
  chars: String;
begin
  chars := '0123456789abcdef';
  Result := '';
  for i := 1 to Len do
    Result := Result + chars[Random(Length(chars)) + 1];
end;

procedure InitializeWizard;
begin
  // Password input page
  PasswordPage := CreateInputQueryPage(wpSelectTasks,
    'Web Login Password', 'Choose a password for the mobile web interface',
    'This password protects your CursorBeam web UI. You will enter it once on each device.');
  PasswordPage.Add('Password:', False);
  PasswordPage.Values[0] := GeneratePassword(8);

  // Cursor path selection
  CursorPathPage := CreateInputDirPage(PasswordPage.ID,
    'Cursor Installation', 'Where is Cursor IDE installed?',
    'Select the folder that contains Cursor.exe:', False, '');
  CursorPathPage.Add('');
  CursorPathPage.Values[0] := ExpandConstant('{localappdata}\Programs\cursor');

  // Projects folder selection
  ProjectsPathPage := CreateInputDirPage(CursorPathPage.ID,
    'Projects Folder', 'Where are your projects stored?',
    'Each direct subfolder becomes a switchable project in the app.', False, '');
  ProjectsPathPage.Add('');
  ProjectsPathPage.Values[0] := ExpandConstant('{userdocs}');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = PasswordPage.ID then
  begin
    if Length(PasswordPage.Values[0]) < 4 then
    begin
      MsgBox('Password must be at least 4 characters long.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = CursorPathPage.ID then
  begin
    if not FileExists(CursorPathPage.Values[0] + '\Cursor.exe') then
    begin
      if MsgBox('Cursor.exe was not found in this folder. Continue anyway?', mbConfirmation, MB_YESNO) = IDNO then
        Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvFile: String;
  EnvContent: TArrayOfString;
  JwtSecret: String;
begin
  if CurStep = ssPostInstall then
  begin
    EnvFile := ExpandConstant('{app}\.env');
    JwtSecret := GenerateHex(64);

    SetArrayLength(EnvContent, 15);
    EnvContent[0]  := '# CursorBeam Configuration';
    EnvContent[1]  := '# Generated by installer on ' + GetDateTimeString('yyyy-mm-dd hh:nn:ss', '-', ':');
    EnvContent[2]  := '';
    EnvContent[3]  := 'PORT=9800';
    EnvContent[4]  := 'CDP_PORT=9222';
    EnvContent[5]  := 'V2_LAN=1';
    EnvContent[6]  := '';
    EnvContent[7]  := 'PASSWORD=' + PasswordPage.Values[0];
    EnvContent[8]  := 'V2_PASSWORD=' + PasswordPage.Values[0];
    EnvContent[9]  := 'LOGIN_PASSWORD=' + PasswordPage.Values[0];
    EnvContent[10] := 'JWT_SECRET=' + JwtSecret;
    EnvContent[11] := '';
    EnvContent[12] := 'CURSOR_EXE=' + CursorPathPage.Values[0] + '\Cursor.exe';
    EnvContent[13] := 'PROJECTS_ROOT=' + ProjectsPathPage.Values[0];
    EnvContent[14] := 'V2_PROJECTS_ROOT=' + ProjectsPathPage.Values[0];

    SaveStringsToFile(EnvFile, EnvContent, False);
  end;
end;

[Messages]
WelcomeLabel2=This will install [name/ver] on your computer.%n%nCursorBeam lets you remote-control Cursor IDE from any phone or browser on your network.%n%nTip: Close Cursor IDE before continuing for the smoothest install.
