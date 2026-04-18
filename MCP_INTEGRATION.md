# 🔌 MCP (Model Context Protocol) Integration

## מה זה MCP?

**MCP = Model Context Protocol**

זה הדרך של Cursor להרחיב את יכולות ה-AI עם **כלים חיצוניים** ו**מידע נוסף**.

---

## 🎯 **איך MCP עובד עם Cursor Mobile:**

```mermaid
אייפון 📱
   ↓
Cursor Mobile Server 🖥️
   ↓
קורא: mcp.json בפרויקט
   ↓
מתחבר ל-MCP Servers:
   - Notion (מסמכים)
   - GitHub (issues, PRs)
   - Database (נתונים)
   - File System (קבצים)
   ↓
Claude API + MCP Tools 🧠
   ↓
תשובה עם גישה לכל המידע! ✨
```

---

## 📝 **דוגמה: mcp.json**

צור קובץ בשורש הפרויקט:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Users\\Noam\\Music\\CinemUS"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    },
    "notion": {
      "command": "node",
      "args": ["path/to/notion-mcp-server.js"],
      "env": {
        "NOTION_API_KEY": "secret_your_key_here"
      }
    }
  }
}
```

---

## 🛠️ **MCP Servers זמינים:**

### **1. File System** 📁
```bash
npx @modelcontextprotocol/server-filesystem
```

**מה זה נותן:**
- ✅ קריאת קבצים
- ✅ חיפוש בקוד
- ✅ רשימת תיקיות
- ✅ מידע על מבנה פרויקט

**דוגמת שימוש:**
```
אתה: "מצא את כל הפונקציות שקוראות ל-API"
AI: [מחפש עם MCP] → "מצאתי 3 פונקציות..."
```

---

### **2. GitHub** 🐙
```bash
npx @modelcontextprotocol/server-github
```

**מה זה נותן:**
- ✅ רשימת issues
- ✅ Pull requests
- ✅ היסטוריית commits
- ✅ מידע על contributors

**דוגמת שימוש:**
```
אתה: "מה ה-issues הפתוחים?"
AI: [שואל GitHub דרך MCP] → "יש 5 issues פתוחים..."
```

---

### **3. Notion** 📝
```bash
npm install @modelcontextprotocol/server-notion
```

**מה זה נותן:**
- ✅ גישה למסמכים
- ✅ קריאת דוקומנטציה פנימית
- ✅ חיפוש במאגר ידע
- ✅ עדכון משימות

**דוגמת שימוש:**
```
אתה: "מה ה-API documentation שלנו?"
AI: [קורא Notion] → "לפי הדוקומנטציה, ה-API..."
```

---

### **4. Postgres Database** 🗄️
```bash
npx @modelcontextprotocol/server-postgres
```

**מה זה נותן:**
- ✅ שאילתות SQL
- ✅ סכמת DB
- ✅ מידע על טבלאות
- ✅ ניתוח נתונים

**דוגמת שימוש:**
```
אתה: "כמה users יש לי בDB?"
AI: [מריץ SQL דרך MCP] → "SELECT COUNT(*) FROM users → 1,234"
```

---

## 🚀 **איך להפעיל MCP ב-Cursor Mobile:**

### **שלב 1: צור mcp.json בפרויקט**

```bash
cd C:\Users\Noam\Music\CinemUS
notepad mcp.json
```

הדבק:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

### **שלב 2: Cursor Mobile יזהה אוטומטית!**

הקוד שלנו כבר תומך ב-MCP:

```typescript
// src/server/services/cursorAgent.ts
async function checkMCPConfig(cwd: string): Promise<string | null> {
  const mcpPath = path.join(cwd, 'mcp.json');
  try {
    await fs.access(mcpPath);
    logger.info({ mcpPath }, 'MCP config found');  // ✅ נמצא!
    return mcpPath;
  } catch {
    return null;
  }
}
```

### **שלב 3: תשלח prompt - MCP עובד!**

```
אייפון: "מצא את כל הקומפוננטות בפרויקט"
         ↓
Server: [רואה mcp.json] → מפעיל MCP filesystem
         ↓
AI: "מצאתי 12 קומפוננטות: Button.tsx, Header.tsx..."
```

---

## 💡 **MCP Servers מותאמים אישית:**

### **צור MCP Server משלך:**

```javascript
// my-mcp-server.js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'my-custom-server',
  version: '1.0.0',
});

// הוסף כלי
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'get_movie_info',
      description: 'Get info about a movie from IMDB',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' }
        }
      }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'get_movie_info') {
    const title = request.params.arguments.title;
    // חפש ב-IMDB API
    const info = await fetchIMDB(title);
    return { content: [{ type: 'text', text: JSON.stringify(info) }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### **הוסף ל-mcp.json:**

```json
{
  "mcpServers": {
    "movies": {
      "command": "node",
      "args": ["my-mcp-server.js"],
      "env": {
        "IMDB_API_KEY": "your_key"
      }
    }
  }
}
```

### **עכשיו AI יכול:**

```
אתה: "מה הציון של Inception ב-IMDB?"
AI: [קורא ל-MCP tool] → "Inception קיבל 8.8/10"
```

---

## 📦 **MCP Servers שימושיים:**

| Server | תיאור | התקנה |
|--------|-------|--------|
| **filesystem** | קבצים ותיקיות | `npx @modelcontextprotocol/server-filesystem` |
| **github** | GitHub API | `npx @modelcontextprotocol/server-github` |
| **postgres** | PostgreSQL | `npx @modelcontextprotocol/server-postgres` |
| **sqlite** | SQLite | `npx @modelcontextprotocol/server-sqlite` |
| **brave-search** | חיפוש באינטרנט | `npx @modelcontextprotocol/server-brave-search` |
| **puppeteer** | Web scraping | `npx @modelcontextprotocol/server-puppeteer` |
| **slack** | Slack messages | `npx @modelcontextprotocol/server-slack` |

---

## 🎯 **דוגמה מלאה: CinemUS עם MCP**

### **mcp.json:**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Users\\Noam\\Music\\CinemUS"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://localhost/cinemus"
      }
    }
  }
}
```

### **עכשיו AI יכול:**

```
✅ "כמה סרטים יש לי בDB?" → SQL query
✅ "מה הקומפוננטות בפרויקט?" → File search
✅ "מה ה-issues הפתוחים?" → GitHub API
✅ "תקן את הבאג ב-MovieCard.tsx" → Read file + context
```

---

## 🔧 **Debug MCP:**

### **בדוק אם MCP עובד:**

```bash
# Test filesystem server
npx @modelcontextprotocol/server-filesystem C:\Users\Noam\Music\CinemUS

# Should output MCP protocol messages
```

### **Cursor Mobile Logs:**

```bash
# Check server logs
npm run dev

# Look for:
[INFO] MCP config found: C:\...\CinemUS\mcp.json
```

---

## 📊 **מה MCP מוסיף ל-Cursor Mobile:**

| ללא MCP | עם MCP |
|---------|--------|
| AI רואה רק prompt | AI רואה prompt **+ קבצים** |
| ידע כללי | ידע כללי **+ DB שלך** |
| תשובות גנריות | תשובות **ספציפיות לפרויקט** |
| לא יכול לחפש | **חיפוש בקוד** |
| לא יכול לקרוא | **קריאת כל קובץ** |

---

## 🎊 **סיכום:**

```
MCP = Model Context Protocol
     = כלים ומידע נוסף ל-AI

✅ Cursor Mobile כבר תומך ב-MCP!
✅ פשוט תוסיף mcp.json לפרויקט
✅ AI יהיה חכם פי 10!
```

---

## 🔗 **קישורים:**

- [MCP Documentation](https://modelcontextprotocol.io)
- [Cursor MCP Guide](https://docs.cursor.com/context/model-context-protocol)
- [MCP Servers List](https://github.com/modelcontextprotocol/servers)

---

## 🚀 **מה הלאה:**

1. **צור mcp.json** בפרויקט שלך
2. **בחר MCP servers** שמתאימים לך
3. **שלח prompts** מהאייפון
4. **תתפעל** מהתשובות! 🎉

**AI עכשיו יודע הכל על הפרויקט שלך!** 💎

