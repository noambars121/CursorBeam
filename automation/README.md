# 🤖 Cursor Chat Automation (CDP)

אוטומציה **ישירה** של צ'אט Cursor ללא API - בדיוק כמו סקריפט לגוגל!

## 🎯 איך זה עובד?

1. **Cursor = Electron = Chromium**
2. **Chromium = CDP (Chrome DevTools Protocol)**
3. **CDP = שליטה מלאה בממשק!** 🚀

---

## 🚀 התקנה מהירה

### שלב 1: הפעל את Cursor עם Debug Mode

**Windows:**
```batch
automation\start-cursor-with-debug.bat
```

**או ידנית:**
```
cursor.exe --remote-debugging-port=9222
```

### שלב 2: התקן Dependencies

```bash
cd automation
npm install
```

### שלב 3: בדיקה

```bash
npm test
```

זה ישלח "בדיקה 1 2 3" לצ'אט של Cursor! ✨

---

## 💻 שימוש מ-Node.js

```javascript
const { sendToCursorChat, readCursorChat } = require('./cursor-chat-cdp');

// שלח הודעה
await sendToCursorChat('בדיקה מהסקריפט!');

// קרא את הצ'אט
const messages = await readCursorChat();
console.log(messages);
```

---

## 🔌 אינטגרציה עם Cursor Mobile

עכשיו אפשר לשלב את זה עם ה-Bridge:

```javascript
// src/server/routes/rchat.ts

import { sendToCursorChat } from '../../../automation/cursor-chat-cdp';

router.post('/api/rchat/send', async (req, res) => {
  const { text } = req.body;
  
  try {
    const result = await sendToCursorChat(text);
    res.json({ ok: true, method: result.method });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 🎯 3 אסטרטגיות (בסדר עדיפות):

### 1️⃣ **VS Code API** (הכי נקי)
```javascript
vscode.postMessage({ command: 'chat', text: message });
```

### 2️⃣ **DOM Injection** (אמין)
```javascript
document.querySelector('textarea[placeholder*="message"]').value = message;
```

### 3️⃣ **Keyboard Automation** (תמיד עובד)
```javascript
Ctrl+L → type → Enter
```

---

## ⚙️ הגדרות

אם Cursor לא על פורט 9222, הסקריפט יחפש אוטומטית בין 9222-9230.

---

## 🔍 Debug

```bash
# בדוק אם Cursor פתוח עם debugging
netstat -ano | findstr :9222

# הצג את כל ה-targets הזמינים
node -e "require('chrome-remote-interface').List({ port: 9222 }).then(console.log)"
```

---

## ✅ יתרונות על פני UIA/API

| תכונה | UIA (C#) | Extension API | CDP Automation |
|-------|----------|---------------|----------------|
| 🚀 מהירות | איטי | בינוני | **מהיר** |
| 🎯 אמינות | בינוני | תלוי ב-API | **גבוהה** |
| 🔧 התקנה | מסובכת | צריך Extension | **פשוטה** |
| 📖 קריאת Chat | קשה | בינוני | **קלה** |
| 🌐 Remote | לא | כן | **כן** |

---

## 🎉 תוצאה

**עכשיו יש לך שליטה מלאה בצ'אט של Cursor מכל מקום!** 🚀

בדיוק כמו שאתה רוצה - כמו סקריפט אוטומציה רגיל! 💪

