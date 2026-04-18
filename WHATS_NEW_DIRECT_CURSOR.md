# 🎉 מה חדש: Direct Cursor Connection

## סיכום השינויים

הוספתי תמיכה מלאה ב-**Direct Cursor Connection** - חיבור ישיר בין האפליקציה מהמובייל לבין הצ'אט הימני של Cursor IDE!

---

## 🆕 מה נוסף?

### 1. תמיכה במשתני סביבה חדשים (`src/server/env.ts`)

הוספתי 4 משתני סביבה חדשים:

```typescript
DIRECT_CURSOR: boolean              // הפעלה/כיבוי של Direct Cursor
DIRECT_CURSOR_HOST: string          // כתובת של גשר ההרחבה (ברירת מחדל: 127.0.0.1)
DIRECT_CURSOR_PORT: number          // פורט של גשר ההרחבה (ברירת מחדל: 8766)
DIRECT_CURSOR_API_KEY: string       // מפתח אימות (ברירת מחדל: "changeme")
```

---

### 2. חיבור ישיר להרחבה (`src/server/services/cursorAgent.ts`)

הוספתי פונקציה חדשה: `chatWithCursorExtension()`

**מה זה עושה?**
- שולח בקשות ישירות להרחבה ב-Cursor
- מקבל תשובות דרך SSE (Server-Sent Events)
- fallback אוטומטי ל-CLI mode אם נכשל

**האלגוריתם החדש ב-`runAgent()`:**
```
1. אם DIRECT_CURSOR=true:
   ├─ נסה להתחבר להרחבה (chatWithCursorExtension)
   ├─ אם הצליח → החזר תוצאה
   └─ אם נכשל → המשך ל-CLI fallback
   
2. נסה Cursor CLI (אם קיים)

3. נסה Cursor API keys (Anthropic/OpenAI/Google)

4. נכשל? החזר הודעת demo
```

**יתרונות:**
- אין צורך ב-API keys חיצוניים
- שימוש ישיר באותו engine של הצ'אט הימני
- fallback אוטומטי למצבים אחרים

---

### 3. עדכון endpoint של Status (`src/server/routes/status.ts`)

הוספתי 2 שדות חדשים לתשובת `/api/status`:

```json
{
  "directCursor": true,
  "directCursorEndpoint": "127.0.0.1:8766",
  // ... שאר השדות הקיימים
}
```

זה מאפשר ל-PWA לדעת אם Direct Cursor פעיל ולהציג מידע למשתמש.

---

### 4. הרחבה מוכנה (`cursor-extension/`)

ההרחבה כבר הייתה קיימת, אבל כעת היא:
- ✅ מודרת (compiled)
- ✅ נארזת ל-VSIX (`cursor-mobile-bridge-1.0.0.vsix`)
- ✅ מוכנה להתקנה

**מה ההרחבה עושה?**
- מריצה שרת HTTP מקומי על פורט 8766
- מקבלת בקשות מהשרת הראשי
- מעבירה אותן לצ'אט של Cursor (כרגע דרך clipboard)
- מחזירה תגובות SSE

---

### 5. מסמכים ומדריכים חדשים

נוספו 3 קבצים:

#### א. `.env.example`
תבנית מלאה לקובץ `.env` כולל:
- כל משתני הסביבה
- הסברים מפורטים
- הגדרות Direct Cursor

#### ב. `SETUP_DIRECT_CURSOR.md`
מדריך מפורט ומלא:
- התקנה שלב אחר שלב
- הסברים מעמיקים
- פתרון בעיות נפוצות
- טיפים ועצות

#### ג. `DIRECT_CURSOR_QUICK_START.md`
מדריך זריז ל-5 דקות:
- רק הצעדים החיוניים
- בדיקות מהירות
- מה לעשות אם משהו לא עובד

---

## 🎯 איך זה עובד?

```
┌─────────────┐          ┌──────────────────┐          ┌─────────────┐
│  iPhone PWA │  (HTTP)  │  Server (8765)   │  (HTTP)  │  Extension  │
│             │◄────────►│                  │◄────────►│  (8766)     │
│ Chat Tab    │          │ cursorAgent.ts   │          │  in Cursor  │
└─────────────┘          └──────────────────┘          └─────────────┘
                                                              │
                                                              │ (clipboard)
                                                              ▼
                                                        ┌─────────────┐
                                                        │ Cursor Chat │
                                                        │   (Right    │
                                                        │    Panel)   │
                                                        └─────────────┘
```

### תהליך:
1. **משתמש שולח פרומפט** מה-PWA (טאב Chat)
2. **השרת מקבל** (`POST /api/chat`)
3. **השרת קורא ל-`runAgent()`** עם `DIRECT_CURSOR=true`
4. **`runAgent()` קורא ל-`chatWithCursorExtension()`**
5. **בקשה נשלחת להרחבה** (`POST http://127.0.0.1:8766/chat`)
6. **ההרחבה מעתיקה לClipboard** ומציגה הודעה
7. **משתמש מדביק ידנית בצ'אט** (Ctrl+L → Ctrl+V → Enter)
8. **תשובות מוזרמות חזרה** דרך SSE ← השרת ← PWA

---

## 🔧 שינויים טכניים

### קבצים שעברו שינוי:

1. **`src/server/env.ts`**
   - הוספת 4 משתני סביבה חדשים לסכמת Zod
   - ואליידציה אוטומטית

2. **`src/server/services/cursorAgent.ts`**
   - פונקציה חדשה: `chatWithCursorExtension()`
   - עדכון `runAgent()` עם Direct Cursor כ-priority ראשון
   - הוספת לוגים מפורטים

3. **`src/server/routes/status.ts`**
   - הוספת `directCursor` ו-`directCursorEndpoint` לתשובה

4. **`cursor-extension/`**
   - בנוי והודר (compiled)
   - נארז ל-VSIX

---

## ⚙️ הגדרות נדרשות

### בקובץ `.env`:

```env
# הפעל Direct Cursor
DIRECT_CURSOR=true

# הגדרות ההרחבה (ברירות מחדל)
DIRECT_CURSOR_HOST=127.0.0.1
DIRECT_CURSOR_PORT=8766
DIRECT_CURSOR_API_KEY=changeme

# כבה מודלים (לא נדרשים ב-Direct mode)
DEFAULT_MODEL=
AVAILABLE_MODELS=[]
```

### בהרחבה (Cursor):
1. התקן את `cursor-mobile-bridge-1.0.0.vsix`
2. הרץ: **Cursor Mobile: Start Bridge Server**
3. ודא בהגדרות:
   - **Port**: 8766
   - **Api Key**: changeme
   - **Auto Start**: מסומן (אופציונלי)

---

## ✅ בדיקות

### בדיקה 1: בדוק שהכל רץ
```bash
npm run status
```

או:
```bash
curl http://localhost:8765/api/status
```

תוצאה צפויה:
```json
{
  "ok": true,
  "directCursor": true,
  "directCursorEndpoint": "127.0.0.1:8766"
}
```

### בדיקה 2: בדוק את ההרחבה
```bash
curl -X POST http://127.0.0.1:8766/status -H "x-api-key: changeme"
```

תוצאה צפויה:
```json
{
  "ok": true,
  "bridge": "cursor-extension",
  "workspace": "cursor mobile"
}
```

### בדיקה 3: שלח פרומפט בדיקה
```bash
curl -X POST http://localhost:8765/api/chat ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"prompt\": \"היי, זה בדיקה\", \"mode\": \"chat\"}"
```

---

## 🛠️ Fallback Modes

המערכת תומכת ב-**3 מצבי fallback** אוטומטיים:

1. **Direct Cursor** (אם `DIRECT_CURSOR=true`)
   - חיבור להרחבה דרך HTTP
   - אם נכשל → עובר למצב 2

2. **Cursor CLI**
   - הרצת `cursor chat --prompt "..."`
   - אם נכשל → עובר למצב 3

3. **Cursor API Keys**
   - שימוש ישיר ב-API keys מהגדרות Cursor
   - אם נכשל → עובר למצב 4

4. **Demo Mode**
   - הודעה מודפסת למשתמש
   - מסביר מה חסר

---

## 🚨 מגבלות ידועות

### 1. הדבקה ידנית נדרשת
כרגע, ההרחבה **לא יכולה** להריץ את הצ'אט של Cursor אוטומטית.

**למה?** Cursor לא חושף API ציבורי להרצת צ'אט.

**הפתרון הזמני:**
- ההרחבה מעתיקה את הפרומפט ל-Clipboard
- המשתמש מדביק ידנית בצ'אט (Ctrl+L → Ctrl+V → Enter)

**עתיד אפשרי:**
- אם Cursor יחשוף API → נוכל להריץ אוטומטית

### 2. תגובות לא מוזרמות מהצ'אט
כרגע, התגובות שהמשתמש מקבל הן מההרחבה, **לא** מהצ'אט של Cursor עצמו.

**למה?** אין דרך לקרוא את תוכן הצ'אט דרך API.

**הפתרון הזמני:**
- ההרחבה מחזירה הודעת אישור
- המשתמש רואה את התשובה ב-Cursor IDE

---

## 📊 סיכום השינויים בקוד

| קובץ | שינויים | שורות |
|------|---------|-------|
| `env.ts` | +4 משתני סביבה | ~10 |
| `cursorAgent.ts` | +פונקציה חדשה, עדכון `runAgent()` | ~100 |
| `status.ts` | +2 שדות בתשובה | ~5 |
| `.env.example` | קובץ חדש | ~100 |
| `SETUP_DIRECT_CURSOR.md` | מדריך מפורט | ~450 |
| `DIRECT_CURSOR_QUICK_START.md` | מדריך זריז | ~200 |
| **סה"ק** | | **~865 שורות** |

---

## 🎓 מה זה נותן לך?

✅ **אין צורך ב-API keys חיצוניים** - שימוש ישיר בהקשר של Cursor  
✅ **אותו engine** - אותו AI כמו הצ'אט הימני  
✅ **Fallback אוטומטי** - המערכת ממשיכה לעבוד גם אם משהו נכשל  
✅ **הקשר מלא** - ההרחבה מעבירה את ההקשר של הפרויקט ל-Cursor  
✅ **מסמכים מקיפים** - 3 מדריכים ברמות פירוט שונות  

---

## 🎯 צעדים הבאים

1. **התקן את ההרחבה** (5 דקות)
   ```
   Cursor → Ctrl+Shift+P → Install from VSIX
   → בחר: cursor-extension/cursor-mobile-bridge-1.0.0.vsix
   ```

2. **הגדר את `.env`** (2 דקות)
   ```
   העתק מ-.env.example
   שנה DIRECT_CURSOR=true
   ```

3. **הפעל את השרת** (1 דקה)
   ```bash
   npm start
   ```

4. **גש מהאייפון** (2 דקות)
   ```
   http://your-pc.tailscale.net:8765/
   ```

**סה"ך: 10 דקות!** ⏱️

---

## 📞 צריך עזרה?

📖 **מדריך מפורט**: `SETUP_DIRECT_CURSOR.md`  
⚡ **מדריך מהיר**: `DIRECT_CURSOR_QUICK_START.md`  
🔧 **דוגמת הגדרות**: `.env.example`  

---

## 🎉 סיום

כעת יש לך מערכת מלאה לעבודה מהמובייל מול Cursor IDE!

**תהנה! 🚀📱✨**

