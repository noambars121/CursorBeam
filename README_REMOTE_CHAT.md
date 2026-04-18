# 🤖 **Remote Chat (UIA) - שליטה מרחוק בצ'אט של Cursor**

---

## 📖 **מה זה?**

תכונה שמאפשרת לך לשלוח הודעות לצ'אט הימני של Cursor **ישירות מהאייפון** באמצעות **Windows UI Automation**.

- ✅ לא צריך screen sharing או OBS
- ✅ שליטה מלאה מהטלפון דרך Tailscale
- ✅ הודעות מוקלדות אוטומטית בצ'אט של Cursor (PC)
- ✅ תמיכה בעברית ושפות Unicode
- ✅ Fallback ל-CLI אם ה-UIA Host לא זמין

---

## 🚀 **איך להתקין?**

### **שלב 1: בניית ה-UIA Host (C#)**

```bash
npm run host:build
```

זה יבנה את `CursorChatHost.exe` שמאזין ב-`127.0.0.1:8788`.

---

### **שלב 2: הפעלת ה-Host ב-Scheduled Task (רקע אוטומטי)**

```bash
npm run host:install
```

ה-Task ירוץ **אוטומטית בכל התחברות למחשב** ויעבוד ברקע.

**אפשרויות ניהול:**
```powershell
# להפעיל עכשיו
Start-ScheduledTask -TaskName "CursorChatHost"

# לבדוק סטטוס
Get-ScheduledTask -TaskName "CursorChatHost" | Get-ScheduledTaskInfo

# להסיר התקנה
Unregister-ScheduledTask -TaskName "CursorChatHost" -Confirm:$false
```

---

### **שלב 3: הפעלת ה-Bridge (Node.js)**

```bash
npm start
```

השרת ירוץ על `http://0.0.0.0:8765` ויהיה נגיש דרך **Tailscale**.

---

### **שלב 4: פתח את ה-PWA מהאייפון**

1. **התחבר ל-Tailscale** באייפון
2. **פתח דפדפן** וגש ל-`http://<YOUR-PC-TAILSCALE-IP>:8765`
3. לך ל-**Chat tab**
4. תראה **"💬 Remote Chat"** בראש הדף
5. **הקלד הודעה** ולחץ **"שלח לצ'אט"**

---

## ⚙️ **הגדרות (`.env`)**

```env
# UIA Host (loopback only)
UIA_HOST=http://127.0.0.1:8788
UIA_READ_ENABLED=true
TRANSCRIPT_MODE=hybrid              # hybrid | uia | server
TRANSCRIPT_MAX_ITEMS=200

# התנהגות הקלדה
CHAT_TYPING_MODE=pophide            # pophide | cli
POP_HIDE_SPEED_MS=200               # 100-400ms
PASTE_STRATEGY=clipboard-first      # clipboard-first | valuepattern-first | sendkeys-only
ENTER_KEY=Enter

# Security / Limits
RCHAT_RATE_LIMIT_PER_MIN=30
RCHAT_MAX_TEXT_LEN=4000
```

---

## 🎯 **איך זה עובד?**

```
[iPhone PWA]
    ↓
    POST /api/rchat/type {"text": "בדיקה"}
    ↓
[Node Bridge :8765]
    ↓
    POST http://127.0.0.1:8788/type {"text": "בדיקה"}
    ↓
[C# UIA Host]
    ↓
    1. מוצא את חלון Cursor (process: Cursor.exe)
    2. מביא את החלון לחזית (ShowWindow + SetForegroundWindow)
    3. לוחץ Ctrl+L (פותח צ'אט)
    4. מעתיק את הטקסט ל-Clipboard
    5. לוחץ Ctrl+V (הדבקה)
    6. לוחץ Enter (שליחה)
    7. מחזיר את החלון למצב קודם
    ↓
[Cursor Chat Panel] ✅ ההודעה מופיעה!
```

---

## 🧪 **בדיקת פעולה**

### **בדיקה מקומית (PC):**

1. **וודא שCursor פתוח**
2. **הפעל את ה-Host:**
   ```bash
   npm run host:run
   ```
3. **בטרמינל נפרד, שלח בקשה:**
   ```powershell
   Invoke-WebRequest -Uri "http://127.0.0.1:8788/type" `
     -Method POST `
     -ContentType "application/json" `
     -Body '{"text":"בדיקה 1 2 3"}'
   ```
4. **צפוי:** הודעה "בדיקה 1 2 3" מופיעה בצ'אט של Cursor

---

### **בדיקה מהאייפון:**

1. **התחבר דרך PWA**
2. **לך לטאב Chat**
3. **הקלד בשדה Remote Chat:** "בדיקה מהטלפון 📱"
4. **לחץ "שלח לצ'אט"**
5. **צפוי:**
   - Toast: "✅ נשלח ל-Cursor!"
   - ההודעה מופיעה בפאנל Cursor Chat (PC)

---

## 🐛 **Troubleshooting**

### **❌ "UIA Host לא זמין"**

**בעיה:** ה-C# Host לא רץ או לא מגיב.

**פתרון:**
1. בדוק אם ה-Host רץ:
   ```powershell
   Get-Process | Where-Object {$_.Name -like "*CursorChatHost*"}
   ```
2. אם לא, הפעל ידנית:
   ```bash
   npm run host:run
   ```
3. בדוק logs ב-Console של ה-Host.

---

### **❌ "Cursor window not found"**

**בעיה:** ה-Host לא מוצא את Cursor.

**פתרון:**
1. **וודא שCursor פתוח** (לא ממוזער לגמרי)
2. בדוק שהתהליך נקרא `Cursor.exe`:
   ```powershell
   Get-Process Cursor
   ```

---

### **❌ "ההודעה לא מופיעה בצ'אט"**

**בעיה:** ה-Host מדווח הצלחה אבל הטקסט לא מופיע.

**פתרון:**
1. **נסה להאט את `POP_HIDE_SPEED_MS`** ב-`.env` ל-`300` או `400`
2. **נסה אסטרטגיה אחרת:**
   ```env
   PASTE_STRATEGY=sendkeys-only
   ```
3. **וודא שCursor לא חסום** על ידי antivirus או firewall.

---

### **❌ "/api/rchat/dump מחזיר ריק"**

**בעיה:** התמליל ריק למרות ששלחת הודעות.

**פתרון:**
- **זה בסדר!** ה-UIA Read עדיין לא מיושם במלואו.
- ההודעות שלך נשמרות ב-**Server Transcript** (זיכרון השרת).
- האסיסטנט יתעד תשובות אוטומטית מ-`/api/chat`.

---

### **❌ "שגיאה: Rate limit exceeded"**

**בעיה:** שלחת יותר מדי הודעות במהירות.

**פתרון:**
- ה-Rate limit הוא **30 הודעות לדקה** (ברירת מחדל).
- המתן דקה או שנה ב-`.env`:
  ```env
  RCHAT_RATE_LIMIT_PER_MIN=60
  ```

---

## 📚 **סדר הפעילות המומלץ**

```
1️⃣ הפעל את Cursor IDE (PC)
2️⃣ הפעל את UIA Host (Task Scheduler או ידני)
3️⃣ הפעל את Node Bridge (npm start או PM2)
4️⃣ פתח PWA מהאייפון דרך Tailscale
5️⃣ שלח הודעה מהטאב Chat → Remote Chat
```

---

## ✅ **Acceptance Criteria**

| מס. | קריטריון | סטטוס |
|-----|----------|-------|
| 1 | שלח "בדיקה 1 2 3" מהאייפון → מופיע בCursor תוך 1.5s | ✅ |
| 2 | `/api/rchat/dump` מחזיר transcript (UIA או server) | ✅ |
| 3 | אם UIA Host לא זמין → fallback ל-CLI עובד | ✅ |
| 4 | `/api/rchat/*` דורש `x-api-key` + Rate limit פעיל | ✅ |
| 5 | Pop-&-Hide: חלון Cursor חוזר למצב קודם | ✅ |
| 6 | אין תלות ב-OBS/Screen capture | ✅ |

---

## 🎉 **זהו! תהנה משליטה מרחוק בCursor!**

**יש בעיה? פתח issue או בדוק את הlogs:**
- **C# Host logs:** Console של `CursorChatHost.exe`
- **Node Bridge logs:** stdout של `npm start`
- **PWA logs:** Developer Tools ב-iPhone (Safari → Develop → iPhone)

---

💡 **טיפ:** אם אתה רוצה רק CLI mode (ללא UIA), שנה:
```env
CHAT_TYPING_MODE=cli
```

זה ישמור הודעות ב-transcript אבל לא יקליד אוטומטית בCursor.

