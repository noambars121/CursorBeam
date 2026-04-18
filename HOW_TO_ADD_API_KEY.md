# 🔑 איך להוסיף API Key ל-Cursor Mobile

## ⚡ **חדשות טובות: זה אוטומטי!**

Cursor Mobile קורא אוטומטית את ה-API keys מ-Cursor IDE שלך!

---

## ✅ **בדיקה: יש לך כבר key?**

1. פתח: `C:\Users\Noam\AppData\Roaming\Cursor\User\settings.json`
2. חפש אחד מאלה:
   - `"superdesign.anthropicApiKey"` (Claude)
   - `"cursor.openaiApiKey"` (GPT)
   - `"cursor.googleApiKey"` (Gemini)

אם יש - **אתה מוכן! המערכת משתמשת בזה.**

---

## 🆕 **הוספת API Key חדש:**

### **דרך 1: דרך Cursor IDE (קל!)** ⭐

1. **פתח Cursor IDE**
2. `File` → `Preferences` → `Settings` (או `Ctrl+,`)
3. **חפש:** `api key`
4. **תמצא:**
   - `Superdesign: Anthropic Api Key`
   - `Cursor: Openai Api Key`
   - `Cursor: Google Api Key`
5. **הדבק** את ה-key

### **דרך 2: עריכה ישירה של settings.json**

1. **פתח:**  
   `C:\Users\Noam\AppData\Roaming\Cursor\User\settings.json`

2. **הוסף:**
   ```json
   {
     "superdesign.anthropicApiKey": "sk-ant-api03-...",
     "cursor.openaiApiKey": "sk-...",
     "cursor.googleApiKey": "AIzaSy..."
   }
   ```

3. **שמור** (Ctrl+S)
4. **רענן** את האפליקציה

---

## 🎯 **איך לקבל API Key:**

### **Anthropic (Claude) - מומלץ!** 💎

**למה:** תשובות הכי טובות, תמיכה בעברית מעולה

1. **הירשם:** https://console.anthropic.com
2. לחץ **Get API Keys**
3. **Create Key** → תן שם (לדוגמה: "Cursor Mobile")
4. **Copy** את הkey (מתחיל ב-`sk-ant-`)
5. **הדבק ב-Cursor** (ראה למעלה)

**עלות:**
- 💰 $3 ל-1M tokens (~2,000 הודעות ארוכות)
- 🎁 $5 credit חינם!

---

### **Google Gemini - חינם!** 🆓

**למה:** לחלוטין חינם, מספיק טוב!

1. **הירשם:** https://makersuite.google.com/app/apikey
2. לחץ **Create API Key**
3. **בחר Project** (או צור חדש)
4. **Copy** את הkey (מתחיל ב-`AIzaSy`)
5. **הדבק ב-Cursor**

**עלות:**
- 🆓 **חינם לחלוטין!**
- ⚡ 60 requests/דקה
- 🚀 1500 requests/יום

---

### **OpenAI (GPT) - פופולרי** 🤖

**למה:** מוכר, אמין, תוצאות טובות

1. **הירשם:** https://platform.openai.com/signup
2. **הוסף כרטיס אשראי** (חובה)
3. **API Keys** → **Create new secret key**
4. **Copy** (מתחיל ב-`sk-`)
5. **הדבק ב-Cursor**

**עלות:**
- 💰 GPT-4: $30/1M input, $60/1M output (~$2 ל-1000 הודעות)
- 💰 GPT-3.5: $0.50/1M input (~$0.10 ל-1000 הודעות)
- 🎁 $5 credit חינם!

---

## 🔄 **רענון המערכת:**

לאחר הוספת/עדכון key:

1. **שמור** את settings.json
2. **רענן** את Cursor Mobile באייפון (F5)
3. **שלח prompt** → המערכת תשתמש בkey החדש!

---

## ✅ **וידוא שזה עובד:**

1. שלח prompt באפליקציה
2. תראה:
   - ✅ `🔄 מתחבר ל-Claude...` → עובד!
   - ❌ `⚠️ לא נמצא API key` → צריך להוסיף

---

## 🆘 **פתרון בעיות:**

### **"לא נמצא API key"**
- ✅ וודא ש-Cursor IDE **סגור** (שמירת settings)
- ✅ בדוק שה-key **ללא רווחים** בהתחלה/סוף
- ✅ רענן את האפליקציה

### **"API error: 401"**
- ❌ Key לא תקף או פג תוקף
- 🔄 צור key חדש באתר הספק

### **"API error: 429"**
- ⚠️ עברת את הlimit
- ⏰ חכה דקה או שדרג תוכנית

---

## 💡 **טיפים:**

1. **Gemini** = הכי זול (חינם!)
2. **Claude** = הכי חכם (עברית מעולה)
3. **GPT-4** = הכי מוכר (אמין)

**המלצה:** התחל עם Gemini (חינם) → אם אתה אוהב, שדרג ל-Claude!

---

## 📊 **השוואת מחירים:**

| Provider | עלות ל-1000 הודעות | מתנה | איכות |
|----------|-------------------|------|-------|
| **Gemini** | 🆓 **חינם!** | - | טוב |
| **Claude** | ~$1.50 | $5 | מעולה |
| **GPT-4** | ~$2.00 | $5 | מצוין |
| **GPT-3.5** | ~$0.05 | $5 | סביר |

---

**זהו! עכשיו תוכל לדבר עם AI מהאייפון! 🚀**

