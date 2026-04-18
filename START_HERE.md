# 🎯 התחל כאן - Direct Cursor מוכן לשימוש!

## ✅ מה כבר בנוי?

הכל מוכן! הפרויקט כולל:

✅ **השרת הראשי** - נבנה ומוכן (`dist/`)  
✅ **ההרחבה** - נבנתה ונארזה (`cursor-extension/cursor-mobile-bridge-1.0.0.vsix`)  
✅ **המסמכים** - 3 מדריכים מפורטים  
✅ **קוד Direct Cursor** - מוטמע במערכת  

---

## 🚀 מה עכשיו? (10 דקות)

### צעד 1: התקן את ההרחבה (2 דקות)

1. **פתח Cursor IDE**
2. **לחץ:** `Ctrl+Shift+P` (או `Cmd+Shift+P` ב-Mac)
3. **הקלד:** `Extensions: Install from VSIX`
4. **בחר:** `cursor-extension/cursor-mobile-bridge-1.0.0.vsix`
5. **לחץ Reload** אם מתבקש

✅ **סימן שזה עבד:** בOutput תראה "Cursor Mobile Bridge activated"

---

### צעד 2: הפעל את גשר ההרחבה (1 דקה)

1. **ב-Cursor:** `Ctrl+Shift+P`
2. **הרץ:** `Cursor Mobile: Start Bridge Server`
3. **תראה הודעה:** ✅ `Cursor Mobile Bridge listening on port 8766`

💡 **כדי לראות לוגים:**
- View → Output → בחר "Cursor Mobile Bridge" מהתפריט

---

### צעד 3: הגדר את `.env` (3 דקות)

אם אין לך `.env`, צור אחד:

```env
# ---- Security (שנה אותם!) ----
LOGIN_PASSWORD=הסיסמה_שלך_כאן
JWT_SECRET=מפתח_אקראי_ארוך_מינימום_32_תווים

# ---- Projects ----
PROJECTS_ROOT=C:\Users\Noam\Music\cursor mobile
DEFAULT_PROJECT=cursor mobile
PROJECT_ALLOWLIST=["C:\\Users\\Noam\\Music\\cursor mobile"]

# ---- Cursor ----
CURSOR_CMD=cursor

# ---- Direct Cursor (זה החלק החשוב!) ----
DIRECT_CURSOR=true
DIRECT_CURSOR_HOST=127.0.0.1
DIRECT_CURSOR_PORT=8766
DIRECT_CURSOR_API_KEY=changeme

# ---- Models (לא נדרש ב-Direct mode) ----
DEFAULT_MODEL=
AVAILABLE_MODELS=[]

# ---- Other ----
READ_ONLY=false
GIT_ENABLE=true
ALLOWED_EXEC=[]
CORS_ORIGINS=*
MAX_RUN_SECONDS=900
PROJECT_START_TIMEOUT=60
AUTO_START_ENABLED=true
PORT_RANGE_START=3000
PORT_RANGE_END=3100
```

📋 **העתק מ-`.env.example`** אם אתה רוצה את כל האופציות.

⚠️ **חשוב:**
- שנה את `LOGIN_PASSWORD` - זו הסיסמה שלך!
- שנה את `JWT_SECRET` - יצור אקראי: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- ודא ש-`DIRECT_CURSOR=true`

---

### צעד 4: הפעל את השרת (2 דקות)

```bash
npm start
```

או עם PM2:
```bash
pm2 start dist/server/index.js --name cursor-mobile
```

✅ **סימן שזה עבד:**
```
🚀 Server running on port 8765
✅ Direct Cursor enabled: 127.0.0.1:8766
```

---

### צעד 5: בדוק שהכל רץ (2 דקות)

#### בדיקה 1: בדוק את השרת
```bash
curl http://localhost:8765/api/status
```

תצפה לראות:
```json
{
  "ok": true,
  "directCursor": true,
  "directCursorEndpoint": "127.0.0.1:8766"
}
```

#### בדיקה 2: בדוק את ההרחבה
```bash
curl -X POST http://127.0.0.1:8766/status -H "x-api-key: changeme"
```

תצפה לראות:
```json
{
  "ok": true,
  "bridge": "cursor-extension"
}
```

✅ **אם שתי הבדיקות עבדו - הכל מוכן!**

---

## 📱 גישה מהאייפון

### אם אתה באותו רשת Wi-Fi:

1. **מצא את ה-IP של המחשב:**
   ```bash
   ipconfig
   ```
   חפש את ה-IPv4 Address (לדוגמה: `192.168.1.100`)

2. **פתח באייפון:**
   ```
   http://192.168.1.100:8765/
   ```

### אם אתה משתמש ב-Tailscale:

1. **ודא ש-Tailscale פועל** על המחשב והאייפון
2. **מצא את שם המחשב:**
   ```bash
   tailscale status
   ```
   (לדוגמה: `my-pc.tail1234.ts.net`)

3. **פתח באייפון:**
   ```
   http://my-pc.tail1234.ts.net:8765/
   ```

---

## 🎮 שימוש

1. **התחבר** עם הסיסמה מ-`.env` (`LOGIN_PASSWORD`)
2. **לך לטאב Chat**
3. **שלח פרומפט**, למשל:
   ```
   צור קובץ utils חדש ב-src/utils/helpers.ts
   ```
4. **ההודעה תועבר להרחבה** והפרומפט יועתק ל-Clipboard
5. **ב-Cursor:** Ctrl+L → Ctrl+V → Enter

*(כרגע צריך הדבקה ידנית - בעתיד כשCursor יחשוף API זה יהיה אוטומטי)*

---

## 🛠️ אם משהו לא עובד

### ❌ השרת לא עולה

```bash
# בדוק שיש .env
ls .env

# בדוק שהפרויקט בנוי
ls dist/server/index.js

# אם לא - בנה מחדש
npm run build
npm start
```

### ❌ לא מתחבר להרחבה

```
Ctrl+Shift+P → Cursor Mobile: Show Status
```

אם לא רץ:
```
Ctrl+Shift+P → Cursor Mobile: Start Bridge Server
```

### ❌ 401 Unauthorized מההרחבה

ה-API key לא תואם!

- **בהרחבה:** Settings → "Cursor Mobile" → "Api Key" = `changeme`
- **ב-.env:** `DIRECT_CURSOR_API_KEY=changeme`

### ❌ לא מצליח להתחבר מהאייפון

1. **בדוק Windows Firewall:**
   - אשר Node.js ב-Private Network
   - או צור כלל חדש לפורט 8765

2. **בדוק שהשרת רץ:**
   ```bash
   npm run status
   ```

3. **ודא ש-Tailscale מחובר** (אם משתמש בTailscale)

---

## 📚 מסמכים נוספים

| מסמך | תיאור | זמן קריאה |
|------|-------|-----------|
| **DIRECT_CURSOR_QUICK_START.md** | מדריך זריז ל-5 דקות | ⚡ 5 דק' |
| **SETUP_DIRECT_CURSOR.md** | מדריך מפורט + פתרון בעיות | 📖 15 דק' |
| **WHATS_NEW_DIRECT_CURSOR.md** | סיכום השינויים הטכניים | 🔧 10 דק' |
| **.env.example** | תבנית מלאה לקובץ הגדרות | 📋 3 דק' |
| **README.md** | תיעוד מלא של הפרויקט | 📚 20 דק' |

---

## 💡 טיפים

### הוסף את ה-PWA ל-Home Screen:

1. פתח את ה-PWA ב**Safari** באייפון
2. לחץ על כפתור **השיתוף** (החץ למעלה)
3. **Add to Home Screen**
4. כעת יש לך אייקון ייעודי! 📱✨

### הפעלה אוטומטית:

אם רוצה שההרחבה תתחיל אוטומטית כש-Cursor נפתח:

1. **Cursor:** File → Preferences → Settings
2. חפש: **"Cursor Mobile"**
3. סמן: **"Auto Start"**

### שמירת לוגים:

אם רוצה לראות לוגים מפורטים:

```bash
# עם PM2
pm2 logs cursor-mobile

# ללא PM2
npm start > logs.txt 2>&1
```

---

## 🎉 סיימת!

כעת אתה יכול לעבוד מהאייפון מול Cursor IDE ישירות!

**צריך עזרה?** בדוק את המדריכים המפורטים למעלה. 👆

---

**Happy coding from anywhere! 🚀📱✨**

