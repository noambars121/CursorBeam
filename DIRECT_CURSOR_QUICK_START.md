# ⚡ התחלה מהירה - Direct Cursor

מדריך זריז להפעלת המערכת עם חיבור ישיר לצ'אט של Cursor.

---

## 📦 מה בנוי וכבר מוכן?

הפרויקט כבר מוכן! כל מה שצריך זה:

✅ השרת הראשי נבנה (`npm run build` הושלם)  
✅ ההרחבה נבנתה ונארזה → `cursor-extension/cursor-mobile-bridge-1.0.0.vsix`  
✅ קבצי ההגדרה מוכנים → `.env.example` קיים  

---

## 🚀 5 צעדים מהירים

### 1️⃣ התקן את ההרחבה ב-Cursor

```bash
# הקובץ כבר קיים כאן:
cursor-extension/cursor-mobile-bridge-1.0.0.vsix
```

**ב-Cursor:**
1. `Ctrl+Shift+P`
2. הקלד: **Extensions: Install from VSIX**
3. בחר: `cursor-extension/cursor-mobile-bridge-1.0.0.vsix`
4. לחץ **Reload** אם מתבקש

---

### 2️⃣ הפעל את גשר ההרחבה

**ב-Cursor:**
1. `Ctrl+Shift+P`
2. הרץ: **Cursor Mobile: Start Bridge Server**
3. תופיע הודעה: ✅ `Cursor Mobile Bridge listening on port 8766`

📋 כדי לראות לוגים: **View → Output → "Cursor Mobile Bridge"**

---

### 3️⃣ הגדר את קובץ `.env`

אם אין לך `.env`, צור חדש:

```env
# ---- Security ----
LOGIN_PASSWORD=mySecurePassword123
JWT_SECRET=this_is_a_super_secret_key_at_least_32_characters_long

# ---- Projects ----
PROJECTS_ROOT=C:\Users\Noam\Music\cursor mobile
DEFAULT_PROJECT=cursor mobile
PROJECT_ALLOWLIST=["C:\\Users\\Noam\\Music\\cursor mobile"]

# ---- Cursor ----
CURSOR_CMD=cursor

# ---- Direct Cursor (חדש!) ----
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

**⚠️ חשוב:**
- החלף `LOGIN_PASSWORD` בסיסמה שלך
- החלף `JWT_SECRET` במפתח אקראי ארוך (32+ תווים)
- `DIRECT_CURSOR=true` - זה מפעיל את המצב הישיר
- `DIRECT_CURSOR_PORT=8766` - חייב להתאים לפורט של ההרחבה

---

### 4️⃣ הפעל את השרת

```bash
npm start
```

או עם PM2:
```bash
pm2 start dist/server/index.js --name cursor-mobile
```

---

### 5️⃣ גש מהאייפון

**דרך Tailscale:**

1. ודא ש-Tailscale פועל על המחשב והאייפון
2. מצא את כתובת המחשב (לדוגמה: `my-pc.tail1234.ts.net`)
3. פתח באייפון:
   ```
   http://my-pc.tail1234.ts.net:8765/
   ```
4. התחבר עם הסיסמה מ-`.env`
5. עבור ל-**Chat** ושלח פרומפט!

---

## ✅ בדיקות מהירות

### בדוק שהכל רץ:

```bash
# בדיקת הסטטוס:
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

### בדוק את ההרחבה:

```bash
curl -X POST http://127.0.0.1:8766/status -H "x-api-key: changeme"
```

תצפה לראות:
```json
{
  "ok": true,
  "bridge": "cursor-extension",
  "workspace": "cursor mobile"
}
```

---

## 🔥 שימוש

1. **פתח את ה-PWA** באייפון
2. **לך לטאב Chat**
3. **שלח פרומפט**, למשל:

```
צור קובץ utils חדש ב-src/utils/helpers.ts עם פונקציית formatDate
```

4. **ההודעה תועבר להרחבה** → תועתק ל-Clipboard
5. **ב-Cursor:** פתח צ'אט (Ctrl+L) → הדבק (Ctrl+V) → שלח

*(בעתיד: הרצה אוטומטית בצ'אט כשCursor יחשוף API)*

---

## 🛠️ פתרון בעיות

### ❌ לא מתחבר להרחבה?

1. ודא שההרחבה **רצה**: `Ctrl+Shift+P` → **Cursor Mobile: Show Status**
2. אם לא רץ: `Ctrl+Shift+P` → **Cursor Mobile: Start Bridge Server**
3. בדוק לוגים: **View → Output → "Cursor Mobile Bridge"**

### ❌ 401 Unauthorized?

ה-API key לא תואם!

- **בהרחבה**: Settings → "Cursor Mobile" → "Api Key" = `changeme`
- **ב-.env**: `DIRECT_CURSOR_API_KEY=changeme`

### ❌ השרת לא עולה?

```bash
# בדוק שיש .env:
ls .env

# בדוק שהפרויקט בנוי:
ls dist/server/index.js

# אם לא - בנה מחדש:
npm run build
```

---

## 📚 מסמכים נוספים

- **מדריך מפורט**: `SETUP_DIRECT_CURSOR.md`
- **כל האופציות**: `.env.example`
- **קריאה מהירה**: `QUICKSTART.md`

---

## 🎉 זהו!

כעת אתה עובד מול Cursor IDE ישירות מהאייפון!

💡 **טיפ:** הוסף את ה-PWA ל-Home Screen:
1. פתח ב-Safari
2. לחץ שיתוף → **Add to Home Screen**
3. כעת יש לך אייקון ייעודי! 📱✨

---

**צריך עזרה?** בדוק את `SETUP_DIRECT_CURSOR.md` למדריך מפורט!

