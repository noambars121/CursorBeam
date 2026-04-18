# 🔧 Troubleshooting Guide - פתרון בעיות

מדריך מקיף לפתרון בעיות נפוצות ב-Cursor Mobile.

---

## 📋 תוכן עניינים

1. [בעיות התקנה](#בעיות-התקנה)
2. [בעיות התחברות](#בעיות-התחברות)
3. [בעיות ביצועים](#בעיות-ביצועים)
4. [בעיות Tailscale](#בעיות-tailscale)
5. [בעיות Cursor](#בעיות-cursor)
6. [לוגים ודיבאגינג](#לוגים-ודיבאגינג)

---

## 🔴 בעיות התקנה

### Node.js לא מותקן

**תסמינים:**
```
'node' is not recognized as an internal or external command
```

**פתרון:**
1. הורד Node.js מ: https://nodejs.org/ (גרסת LTS)
2. הרץ את ההתקנה עם ברירות המחדל
3. **הפעל מחדש את PowerShell/CMD**
4. בדוק: `node --version`

### npm install נכשל

**תסמינים:**
```
npm ERR! code ENOENT
npm ERR! Failed at the ... postinstall script
```

**פתרונות:**

**פתרון 1:** נקה cache
```powershell
npm cache clean --force
npm install
```

**פתרון 2:** מחק node_modules
```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

**פתרון 3:** הרץ כמנהל
- לחץ ימני על PowerShell → "Run as Administrator"
- נווט לתיקיית הפרויקט
- `npm install`

### install.ps1 לא רץ

**תסמינים:**
```
cannot be loaded because running scripts is disabled on this system
```

**פתרון:**
```powershell
# הפעל כמנהל:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# או רק לפעם הזו:
powershell -ExecutionPolicy Bypass -File install.ps1
```

---

## 🔴 בעיות התחברות

### לא מצליח להתחבר מהטלפון

**תסמין:** "Can't reach the server" או timeout

**בדיקות:**

#### 1. בדוק שהשרת רץ
במחשב, פתח:
```
http://localhost:9800
```
אם עובד במחשב אבל לא בטלפון → בעיית רשת/firewall.

#### 2. בדוק Firewall

**פתרון אוטומטי:**
```powershell
# הרץ כמנהל:
New-NetFirewallRule -DisplayName "Cursor Mobile" -Direction Inbound -LocalPort 9800 -Protocol TCP -Action Allow
```

**פתרון ידני:**
1. Windows Security → Firewall & Network Protection
2. Advanced Settings
3. Inbound Rules → New Rule
4. Port → TCP → 9800
5. Allow the connection
6. Apply to all profiles

#### 3. בדוק אותה רשת WiFi

- המחשב והטלפון **חייבים** להיות באותו WiFi
- WiFi של אורחים (Guest network) לפעמים חוסם חיבורים מקומיים

#### 4. בדוק את ה-IP

במחשב:
```powershell
ipconfig
```
חפש "IPv4 Address" תחת הרשת הפעילה.

בטלפון, נסה:
```
http://<IP-זה>:9800
```

### סיסמה לא מתקבלת

**תסמין:** "Wrong password" / "Unauthorized"

**פתרונות:**

1. **בדוק את הסיסמה בקובץ `.env`:**
   ```powershell
   notepad .env
   ```
   חפש את השורה: `V2_PASSWORD=...`

2. **האם יש רווחים?**
   - הסיסמה לא צריכה רווחים בהתחלה/סוף
   - אל תשים מרכאות: `V2_PASSWORD=mypass` (לא `"mypass"`)

3. **שנה סיסמה:**
   - ערוך את `.env`
   - שמור
   - **הפעל מחדש את השרת**
   - נסה להתחבר שוב

### Token expired

**תסמין:** נזרק אוטומטית ל-login

**פתרון:**
- זה נורמלי אחרי 7 ימים
- פשוט התחבר מחדש עם הסיסמה

---

## 🔴 בעיות ביצועים

### השרת איטי / תקוע

**בדיקות:**

#### 1. בדוק CPU במחשב
- פתח Task Manager (Ctrl+Shift+Esc)
- חפש `node.exe`
- אם ב-100% CPU → בעיה

**פתרון:** הפחת polling:
```env
# בקובץ .env:
V2_POLL_MS=3000
```
(ברירת מחדל: 1500ms)

#### 2. בדוק זיכרון
אם Node.js תופס >500MB → דליפת זיכרון.

**פתרון זמני:** הפעל מחדש:
```powershell
# סגור את השרת (Ctrl+C)
npm run v2:start
```

### הודעות לא מתעדכנות בזמן אמת

**תסמין:** צריך לרענן ידנית כדי לראות הודעות חדשות

**פתרון:**

1. **בדוק WebSocket:**
   - פתח Developer Tools בטלפון (Safari/Chrome)
   - Console → חפש `[WS]` או errors
   
2. **רענן את ה-PWA:**
   - Safari: Settings → Safari → Advanced → Website Data → מחק
   - Chrome: Settings → Site settings → cursor-mobile → Clear data

3. **התקן מחדש PWA:**
   - מחק מהמסך הבית
   - פתח בדפדפן שוב
   - Add to Home Screen מחדש

### גלילה ממש איטית

**פתרון:** הופעל hardware acceleration

iPhone:
- Settings → Safari → Advanced → Experimental Features
- וודא שכל ה-rendering features מופעלים

Android:
- Chrome → Settings → Site settings → JavaScript (enabled)

---

## 🔴 בעיות Tailscale

### Tailscale לא מתחבר

**תסמין:** "Logged out" או "No connection"

**פתרון 1:** Login מחדש
```powershell
tailscale logout
tailscale login
```

**פתרון 2:** הפעל מחדש service
```powershell
# הרץ כמנהל:
Restart-Service Tailscale
```

**פתרון 3:** הפעל מחדש את המחשב
- פשוט restart - לפעמים זה פותר

### לא רואה את המחשב מהטלפון

**תסמין:** המחשב לא מופיע ב-"Machines" בטלפון

**פתרון:**

1. **ודא שני המכשירים באותו חשבון Tailscale**
   ```powershell
   # במחשב:
   tailscale status
   ```
   תראה את החשבון שלך למעלה.

2. **בדוק שהמחשב online:**
   - Tailscale icon בסרגל המשימות צריך להיות ירוק

3. **רענן:**
   - בטלפון: סגור ופתח את Tailscale
   - במחשב: `tailscale status --peers`

### חיבור איטי דרך Tailscale

**סיבה אפשרית:** החיבור עובר דרך relay במקום ישיר

**בדיקה:**
```powershell
tailscale status --peers
```
חפש "relay" או "DERP" ליד המכשיר.

**פתרון:**
- וודא שאין firewall חוסם UDP
- לפעמים זה בלתי נמנע (רשתות עבודה)
- עדיין יעבוד, פשוט קצת יותר איטי

---

## 🔴 בעיות Cursor

### Cursor לא נפתח

**תסמינים:** השרת מתחיל אבל Cursor לא עולה

**פתרון 1:** בדוק path ב-.env
```powershell
notepad .env
```
הקו `V2_CURSOR_EXE=...` חייב להצביע לקובץ exe קיים.

**פתרון 2:** סגור Cursor קיים
- הסקריפט לא יכול לפתוח Cursor אם הוא כבר רץ
- סגור את Cursor לגמרי (Task Manager אם צריך)
- הרץ את השרת שוב

**פתרון 3:** הפעל Cursor ידנית עם CDP
```powershell
& "C:\Users\...\Cursor.exe" --remote-debugging-port=9222
```

### "Cannot extract state" / "Composer not detected"

**תסמין:** השרת רץ אבל לא רואה את הצ'אט

**פתרון:**

1. **פתח צ'אט ב-Cursor:**
   - לחץ Ctrl+L (או Cmd+L)
   - וודא שחלון הצ'אט פתוח ונראה

2. **המתן 3-5 שניות**
   - הסקריפט לוקח רגע לזהות את החלון

3. **רענן extraction:**
   - בטלפון: pull-to-refresh או סגור/פתח PWA

### הודעות לא מופיעות / חסרות

**סיבה:** Cursor משתמש בווירטואליזציה - רק חלק מההודעות בדום

**פתרון:**
- לחץ "טען כל ההיסטוריה" ב-PWA
- או גלול למעלה בצ'אט **של Cursor** (במחשב)

### Tool approvals לא עובדים

**תסמין:** לוחץ "Approve" אבל כלום לא קורה

**פתרון:**

1. **רענן:**
   - המתן 2-3 שניות
   - הכפתור יעלם כש-Cursor מאשר

2. **בדוק ב-Cursor:**
   - פתח את Cursor במחשב
   - לפעמים צריך אישור נוסף שם

3. **הפעל מחדש extraction:**
   - בטלפון: pull-to-refresh

---

## 🔴 בעיות ביצועים

### השרת קורס / נעצר

**תסמין:** "Connection lost" ב-PWA

**בדיקה:** חפש crash בחלון השרת (CMD)

**פתרון 1:** הרץ מחדש
```powershell
npm run v2:start
```

**פתרון 2:** נקה state
```powershell
# מחק log files אם קיימים:
Remove-Item logs/* -ErrorAction SilentlyContinue
npm run v2:start
```

### זיכרון גבוה

**תסמין:** Node.js תופס הרבה RAM (>1GB)

**פתרון:**
- הפעל מחדש את השרת כל כמה ימים
- פתח issue ב-GitHub עם הלוגים

### סוללה מתרוקנת בטלפון

**סיבה:** WebSocket connection keep-alive

**פתרון:**
- זה נורמלי עם חיבורים WebSocket
- סגור את ה-PWA כשלא בשימוש
- או השאר את הטלפון בטעינה

---

## 🔴 בעיות PWA

### PWA לא מתעדכן

**תסמין:** שינויים בקוד לא מופיעים ב-PWA

**פתרון:**

#### iPhone:
1. Settings → Safari
2. Advanced → Website Data
3. מצא "cursor-mobile" או את ה-IP
4. Swipe left → Delete
5. פתח את ה-PWA מחדש

#### Android:
1. Chrome → Settings
2. Site settings → All sites
3. מצא את הכתובת
4. Clear & reset
5. פתח מחדש

### התקנה כ-PWA נכשלת

**תסמין:** לא רואה "Add to Home Screen"

**פתרון:**

#### iPhone:
- חייב להשתמש ב-**Safari** (לא Chrome!)
- פתח מחדש ב-Safari אם פתחת בדפדפן אחר

#### Android:
- חייב להשתמש ב-**Chrome**
- אם לא עובד: Settings → Apps → Chrome → Storage → Clear cache

### PWA נפתח בדפדפן במקום standalone

**סיבה:** ההתקנה לא הצליחה כראוי

**פתרון:**
1. מחק את האייקון מהמסך הבית
2. פתח את הכתובת **ישירות בדפדפן** (לא דרך link/QR)
3. Add to Home Screen שוב

---

## 🔴 לוגים ודיבאגינג

### הצגת לוגים מפורטים

השרת מדפיס logs לקונסול. כדי לשמור:

```powershell
npm run v2:start > logs.txt 2>&1
```

### לוגים חשובים לחפש

**חיבור CDP:**
```
[StateManager] Connected to: cursor - <project> - Cursor
```
אם לא רואה → Cursor לא נפתח עם CDP.

**Polling errors:**
```
[StateManager] Poll error: ...
```
שים לב למסר השגיאה.

**WebSocket:**
```
[Relay] WS client connected (total: 1)
```
אם לא רואה אחרי login → WebSocket לא מתחבר.

### בדיקת health

```powershell
# בטרמינל נפרד:
curl http://localhost:9800/health
```

תקבל משהו כמו:
```json
{
  "cdpReachable": true,
  "workbenchFound": true,
  "wsConnected": true,
  "composerDetected": true
}
```

כל `false` מצביע על הבעיה.

### בדיקת פורטים

```powershell
# בדוק מי משתמש בפורט 9800:
netstat -ano | findstr "9800"

# בדוק CDP (9222):
netstat -ano | findstr "9222"
```

אם יש PID, לסגור:
```powershell
taskkill /F /PID <המספר>
```

---

## 🔴 בעיות ספציפיות לפיצ'רים

### Edit Message לא עובד

**תסמין:** לוחץ "ערוך" אבל כלום לא קורה

**פתרון:**
1. וודא שאתה לוחץ **long-press** (לחיצה ארוכה)
2. המתן שהדיאלוג יופיע ב-Cursor (במחשב)
3. בחר "Branch"/"Continue"
4. הטקסט יופיע בשדה העריכה ב-PWA

### Terminal לא מראה output

**תסמין:** פקודות נשלחות אבל אין פלט

**פתרון:**

1. **פתח טרמינל ב-Cursor** (במחשב):
   - Ctrl+` או View → Terminal

2. **המתן 5 שניות:**
   - הטרמינל לוקח רגע להיטען

3. **רענן:**
   - בטלפון: עבור ל-Chat ואז חזור ל-Terminal

### Model picker לא מראה מודלים

**תסמין:** רשימה ריקה או "טוען..."

**פתרון:**
1. לחץ על ה-model picker **ב-Cursor** (במחשב) פעם אחת
2. סגור אותו
3. עכשיו נסה מה-PWA

---

## 🔴 בעיות Tailscale ספציפיות

### 100.x.x.x לא עובד

**בדיקה:**
```powershell
# במחשב:
tailscale ping <phone-name>
```

אם לא עובד:

**פתרון 1:** Exit nodes
- בטלפון: Tailscale → Use exit node → (none)

**פתרון 2:** בדוק ACL
- https://login.tailscale.com/admin/acls
- וודא שאין כללים שחוסמים

**פתרון 3:** Key expiration
- מכשירים ישנים מנותקים אחרי 180 יום
- Admin console → Machines → Reauthenticate

### Tailscale מתנתק כל הזמן

**סיבה:** Windows sleep/hibernate

**פתרון:**
```powershell
# הרץ כמנהל - מנע sleep:
powercfg -change -standby-timeout-ac 0
```

או:
1. Settings → System → Power & Sleep
2. שנה "Sleep" ל-"Never" כשמחובר לחשמל

---

## 🛠️ כלי אבחון

### סקריפט אבחון מהיר

שמור בתור `diagnose.ps1`:

```powershell
Write-Host "=== Cursor Mobile Diagnostics ===" -ForegroundColor Cyan

# Node
Write-Host "`n[Node.js]" -ForegroundColor Yellow
node --version
npm --version

# Ports
Write-Host "`n[Ports]" -ForegroundColor Yellow
netstat -ano | findstr "9800"
netstat -ano | findstr "9222"

# Tailscale
Write-Host "`n[Tailscale]" -ForegroundColor Yellow
if (Get-Command tailscale -ErrorAction SilentlyContinue) {
    tailscale status --json | ConvertFrom-Json | Select-Object BackendState, Self
} else {
    Write-Host "Not installed"
}

# .env
Write-Host "`n[Configuration]" -ForegroundColor Yellow
if (Test-Path .env) {
    Write-Host ".env exists: YES"
    Get-Content .env | Where-Object { $_ -match '^V2_' } | ForEach-Object {
        if ($_ -match 'PASSWORD') {
            Write-Host "V2_PASSWORD=******"
        } else {
            Write-Host $_
        }
    }
} else {
    Write-Host ".env exists: NO"
}

# Health check
Write-Host "`n[Server Health]" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod "http://localhost:9800/health"
    $health | Format-List
} catch {
    Write-Host "Server not responding: $_" -ForegroundColor Red
}

Write-Host "`nDone!" -ForegroundColor Green
```

הרץ:
```powershell
powershell -ExecutionPolicy Bypass -File diagnose.ps1
```

---

## 📞 קבלת עזרה

אם שום דבר לא עובד:

1. **אסוף מידע:**
   - הרץ את סקריפט האבחון למעלה
   - צלם screenshot של השגיאה
   - העתק את ה-logs מהשרת

2. **פתח Issue ב-GitHub:**
   - https://github.com/noambars121/CursorBeam/issues/new
   - תאר מה ניסית
   - צרף את המידע שאספת

3. **פרטים שכדאי לכלול:**
   - גרסת Windows (Win+R → `winver`)
   - גרסת Node.js (`node --version`)
   - גרסת Cursor (Help → About)
   - Tailscale: yes/no
   - מה עובד / מה לא עובד

---

## ✅ רשימת בדיקה כוללת

נסה בסדר הזה:

- [ ] 1. Node.js מותקן וב-PATH
- [ ] 2. `npm install` הצליח
- [ ] 3. קובץ `.env` קיים עם סיסמה ונתיב Cursor
- [ ] 4. Firewall מאפשר port 9800
- [ ] 5. `http://localhost:9800` עובד במחשב
- [ ] 6. Cursor נפתח עם `--remote-debugging-port=9222`
- [ ] 7. הטלפון והמחשב באותו WiFi (או Tailscale)
- [ ] 8. הכתובת `http://<IP>:9800` נגישה מהטלפון
- [ ] 9. הסיסמה נכונה (ללא רווחים)
- [ ] 10. WebSocket מתחבר (בדוק ב-DevTools)

אם הכל מסומן אבל עדיין לא עובד → פתח Issue!

---

**זכור: רוב הבעיות נפתרות עם הפעלה מחדש של השרת והדפדפן! 🔄**
