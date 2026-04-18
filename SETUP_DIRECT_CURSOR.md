# 🚀 מדריך הגדרת Direct Cursor

מדריך זה יעזור לך להתחבר ישירות לצ'אט הימני של Cursor מהאייפון שלך.

---

## מה זה Direct Cursor?

במצב זה, האפליקציה מהמובייל מדברת **ישירות** עם מנוע הצ'אט של Cursor IDE (הפאנל הימני), בלי צורך במפתחות API חיצוניים. הכל עובד דרך הרחבה פשוטה שמותקנת ב-Cursor.

---

## התקנה מהירה (5-7 דקות)

### שלב  הכנת ההרחבה

```bash
cd cursor-extension
npm install
npm run compile
```

אם אין לך את כלי האריזה:
```bash
npm install -g @vscode/vsce
```

עכשיו ארוז את ההרחבה:
```bash
npm run package
# או ישירות:
vsce package
```

זה ייצור קובץ `cursor-mobile-bridge-1.0.0.vsix` (או שם דומה).

---

### שלב 2: התקנת ההרחבה ב-Cursor

1. **פתח את Cursor IDE**
2. לחץ `Ctrl+Shift+P` (או `Cmd+Shift+P` ב-Mac)
3. חפש והרץ: **Extensions: Install from VSIX...**
4. בחר את קובץ ה-`.vsix` שנוצר
5. לחץ **Reload** אם מתבקש

---

### שלב 3: הפעלת גשר ההרחבה

1. ב-Cursor, לחץ `Ctrl+Shift+P`
2. הרץ: **Cursor Mobile: Start Bridge Server**
3. תופיע הודעה: `✅ Cursor Mobile Bridge listening on port 8766`
4. בדוק ב-**View → Output** → בחר "Cursor Mobile Bridge" מהרשימה

אם רוצה אוטומטי:
- **File → Preferences → Settings** → חפש "Cursor Mobile"
- וודא ש-**Auto Start** מסומן

---

### שלב 4: הגדרת קובץ `.env`

אם אין לך `.env`, צור אחד (או העתק מ-`.env.example`):

```env
# ---- Security ----
LOGIN_PASSWORD=השאר_את_מה_שיש
JWT_SECRET=השאר_את_מה_שיש

# ---- Projects ----
PROJECTS_ROOT=C:\Users\Noam\Music\cursor mobile
DEFAULT_PROJECT=cursor mobile
PROJECT_ALLOWLIST=["C:\\Users\\Noam\\Music\\cursor mobile"]

# ---- Cursor CLI ----
CURSOR_CMD=cursor

# ---- Direct Cursor (חדש!) ----
DIRECT_CURSOR=true
DIRECT_CURSOR_HOST=127.0.0.1
DIRECT_CURSOR_PORT=8766
DIRECT_CURSOR_API_KEY=changeme

# ---- Models (לא בשימוש ב-Direct mode) ----
DEFAULT_MODEL=
AVAILABLE_MODELS=[]

# ---- Other ----
READ_ONLY=false
GIT_ENABLE=true
ALLOWED_EXEC=[]
```

**חשוב:**
- `DIRECT_CURSOR=true` - מפעיל את המצב הישיר
- `DIRECT_CURSOR_PORT=8766` - חייב להתאים לפורט שההרחבה הדפיסה
- `DIRECT_CURSOR_API_KEY=changeme` - חייב להתאים להגדרת ההרחבה (ברירת מחדל: `changeme`)

---

### שלב 5: הפעלת השרת

```bash
# חזור לתיקייה הראשית
cd ..

# בנה את הפרויקט
npm run build

# הפעל את השרת
npm start
```

או אם יש לך PM2:
```bash
pm2 restart cursor-mobile
```

---

### שלב 6: גישה מהאייפון (דרך Tailscale)

1. **ודא ש-Tailscale פועל** על המחשב והאייפון
2. **גלה את כתובת המחשב:**
   - פתח Tailscale → לחץ על המחשב → העתק את ה-IP/Name
   - לדוגמה: `my-pc.tail1234.ts.net`

3. **פתח את ה-PWA באייפון:**
   ```
   http://my-pc.tail1234.ts.net:8765/
   ```
   (החלף `my-pc.tail1234.ts.net` בכתובת שלך)

4. **התחבר** עם הסיסמה מ-`.env` (`LOGIN_PASSWORD`)

5. **עבור לטאב Chat** ושלח פרומפט, למשל:
   ```
   צור קובץ context לאתר ושמור ב-src/context/site.ts
   ```

---

## בדיקות

### בדיקה 1: בדיקת Status

```bash
npm run status
```

או בדפדפן:
```
http://localhost:8765/api/status
```

חפש:
```json
{
  "directCursor": true,
  "directCursorEndpoint": "127.0.0.1:8766"
}
```

### בדיקה 2: בדיקת החיבור להרחבה

```bash
curl -X POST http://127.0.0.1:8766/status -H "x-api-key: changeme"
```

צריך להחזיר:
```json
{
  "ok": true,
  "bridge": "cursor-extension",
  "workspace": "cursor mobile"
}
```

### בדיקה 3: שליחת הודעת בדיקה

```bash
curl -X POST http://127.0.0.1:8766/chat ^
  -H "Content-Type: application/json" ^
  -H "x-api-key: changeme" ^
  -d "{\"prompt\": \"היי, זה בדיקה\"}"
```

(ב-Mac/Linux: שנה `^` ל-`\`)

---

## פתרון בעיות נפוצות

### ❌ "לא ניתן להתחבר להרחבת Cursor"

**פתרון:**
1. וודא שההרחבה **מותקנת** ב-Cursor
2. וודא שההרחבה **רצה** (View → Output → "Cursor Mobile Bridge")
3. בדוק שהפורט **תואם** (`.env` ↔ הגדרות ההרחבה)
4. בדוק שה-**API key** תואם (`changeme` ברירת מחדל)

אם ההרחבה לא רצה:
```
Ctrl+Shift+P → "Cursor Mobile: Start Bridge Server"
```

---

### ❌ "Extension bridge returned 401: Unauthorized"

**פתרון:**
ה-API key לא תואם!

**בהרחבה (Cursor):**
- File → Preferences → Settings
- חפש "Cursor Mobile"
- תחת "Api Key" - רשום `changeme` (או משהו אחר)

**בשרת (`.env`):**
```env
DIRECT_CURSOR_API_KEY=changeme  # חייב להתאים להרחבה!
```

---

### ❌ "שרת המובייל לא מגיב"

**פתרון:**
1. וודא ש-`.env` קיים ומוגדר
2. הרץ `npm run build` (אחרי שינויים)
3. הפעל מחדש: `npm start` או `pm2 restart cursor-mobile`
4. בדוק firewall:
   - Windows: אשר Node.js ב-"Private Network"
   - פורט 8765 צריך להיות פתוח בTailscale

---

### ❌ "הצ'אט לא מציג הודעות בלייב"

זה **נורמלי**! ההרחבה כרגע מעתיקה את הפרומפט ל-Clipboard ומבקשת ממך להדביק ידנית בצ'אט של Cursor.

**למה?** Cursor לא חושף API ישיר להרצת צ'אט. ההרחבה פועלת כגשר, אבל צריך הדבקה ידנית.

**אלטרנטיבה:** השתמש במצב **API ישיר** (עם מפתח Anthropic/OpenAI) במקום Direct Cursor.

---

### ⚠️ "חיבור ישיר נכשל, עובר למצב CLI"

המערכת אוטומטית נופלת ל-**CLI Mode** אם Direct Cursor לא זמין.

זה אומר:
1. השרת ניסה להתחבר להרחבה - נכשל
2. השרת עבר ל-Cursor CLI (אם מותקן)
3. אם גם זה לא זמין - עבר ל-API keys של Cursor

זה **מצב fallback אוטומטי** - המערכת תמשיך לעבוד!

---

## Firewall (Windows)

אם יש בעיות חיבור מהאייפון:

1. **פתח Windows Defender Firewall**
2. **Advanced Settings** → **Inbound Rules** → **New Rule**
3. **Port** → 8765 → TCP → **Allow**
4. בחר **Private networks** בלבד (Tailscale)
5. שם: `Cursor Mobile PWA`

---

## עצות לשימוש

### 🎯 מה עובד טוב?

- ✅ **תכנון (Plan Mode)** - יצירת תוכניות פעולה
- ✅ **עריכת קבצים** - עדכון קוד
- ✅ **הרצת פקודות** - דרך `/api/exec` (אם מוגדר ב-ALLOWED_EXEC)
- ✅ **Git** - commit, push, pull, status
- ✅ **סיכום קבצים** - מבנה הפרויקט

### ⚠️ מה לא עובד (כרגע)?

- ❌ **הרצה אוטומטית בצ'אט של Cursor** - צריך הדבקה ידנית (מגבלת API)
- ❌ **קבלת תשובות מצ'אט של Cursor** - לא חושף API חיצוני

---

## מעבר למצב API רגיל

אם אתה מעדיף לעבוד עם API ישיר (לדוגמה Claude API):

```env
# השבת Direct Cursor
DIRECT_CURSOR=false

# הפעל API keys (מקורות הCursor settings או ידני)
# השרת אוטומטית יקרא מהגדרות Cursor
```

---

## סיכום מהיר

| מצב | יתרונות | חסרונות |
|-----|---------|---------|
| **Direct Cursor** | ✅ אין צורך ב-API keys חיצוניים<br>✅ שימוש ישיר בהקשר של Cursor | ❌ צריך הדבקה ידנית בצ'אט<br>❌ לא מקבל תשובות אוטומטיות |
| **API Mode** | ✅ תשובות אוטומטיות<br>✅ streaming מלא | ❌ צריך API key משלך<br>❌ עלויות |
| **CLI Mode** | ✅ פקודות מובנות של Cursor | ❌ תלוי ב-Cursor CLI להיות מותקן |

---

## זקוק לעזרה?

1. בדוק לוגים:
   - **שרת:** הלוגים של `npm start` או `pm2 logs cursor-mobile`
   - **הרחבה:** View → Output → "Cursor Mobile Bridge"

2. בדוק status:
   ```bash
   npm run status
   curl http://localhost:8765/api/status
   ```

3. נסה fallback:
   - כבה `DIRECT_CURSOR=false` ב-`.env`
   - הפעל מחדש את השרת

---

## 🎉 סיימת!

כעת אתה יכול לעבוד מהאייפון מול Cursor IDE!

**טיפ אחרון:** הוסף את ה-PWA ל-Home Screen באייפון:
1. פתח את ה-PWA בSafari
2. לחץ על כפתור השיתוף
3. **Add to Home Screen**
4. עכשיו יש לך אייקון ייעודי! 📱✨

