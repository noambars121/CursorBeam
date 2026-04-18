using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows.Automation;
using Vanara.PInvoke;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

// ===========================================
// Cursor Chat Host (UIA)
// ===========================================
// Remote type to Cursor AI Chat via Windows UI Automation
// Runs on loopback only (127.0.0.1:8788)

var builder = WebApplication.CreateBuilder(args);

// Configure Kestrel to listen on loopback only
builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenLocalhost(8788); // Loopback only - NEVER expose externally
});

// Add JSON serialization
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNameCaseInsensitive = true;
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

var app = builder.Build();
var logger = app.Logger;

logger.LogInformation("🚀 Cursor Chat Host starting...");

// POST /type - Type text into Cursor chat
app.MapPost("/type", async (HttpContext context) =>
{
    try
    {
        var request = await context.Request.ReadFromJsonAsync<TypeRequest>();
        
        if (request == null || string.IsNullOrWhiteSpace(request.Text))
        {
            context.Response.StatusCode = 400;
            return Results.Json(new { ok = false, error = "Missing 'text' field" });
        }

        // Sanitize input
        var sanitized = SanitizeInput(request.Text, maxLength: 4000);
        if (string.IsNullOrWhiteSpace(sanitized))
        {
            context.Response.StatusCode = 400;
            return Results.Json(new { ok = false, error = "Text is empty after sanitization" });
        }

        logger.LogInformation($"📝 Type request received (length: {sanitized.Length})");

        // Find Cursor window
        var hwnd = FindCursorWindow();
        
        // #region agent log - H6
        var windowTitle = hwnd != IntPtr.Zero ? GetWindowTitle(hwnd) : "N/A";
        System.IO.File.AppendAllText(@"c:\Users\Noam\Music\cursor mobile\.cursor\debug.log", 
            System.Text.Json.JsonSerializer.Serialize(new { 
                location = "Program.cs:type:findWindow", 
                message = "Found window", 
                data = new { hwnd = hwnd.ToString(), windowTitle = windowTitle },
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                sessionId = "debug-session",
                hypothesisId = "H6"
            }) + "\n");
        // #endregion
        
        if (hwnd == IntPtr.Zero)
        {
            context.Response.StatusCode = 503;
            return Results.Json(new { ok = false, error = "Cursor window not found. Is Cursor running?" });
        }

        // Pop & Hide strategy
        var wasMinimized = User32.IsIconic(hwnd);
        
        // Restore and bring to foreground
        if (wasMinimized)
        {
            User32.ShowWindow(hwnd, ShowWindowCommand.SW_RESTORE);
        }
        
        User32.SetForegroundWindow(hwnd);
        await Task.Delay(100); // Pop speed (half of configured)

        // #region agent log - H6/H7/H8
        var foregroundAfter = User32.GetForegroundWindow();
        System.IO.File.AppendAllText(@"c:\Users\Noam\Music\cursor mobile\.cursor\debug.log", 
            System.Text.Json.JsonSerializer.Serialize(new { 
                location = "Program.cs:type:afterSetForeground", 
                message = "Checking foreground window", 
                data = new { hwndTarget = hwnd.ToString(), hwndForeground = foregroundAfter.ToString(), match = hwnd == foregroundAfter },
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                sessionId = "debug-session",
                hypothesisId = "H8"
            }) + "\n");
        // #endregion

        // Open chat with Ctrl+L (Cursor's AI chat shortcut)
        // Note: In Cursor, Ctrl+L opens the AI chat panel
        SendHotkey(User32.VK.VK_L, ctrl: true);
        await Task.Delay(200); // Give more time for chat to open

        // Type using clipboard (most reliable)
        var method = await TypeViaClipboard(sanitized);
        
        // Send Enter
        SendKey(User32.VK.VK_RETURN);
        await Task.Delay(50);

        // Hide back if was minimized
        if (wasMinimized)
        {
            await Task.Delay(100); // Let the message send
            User32.ShowWindow(hwnd, ShowWindowCommand.SW_MINIMIZE);
        }

        logger.LogInformation($"✅ Message sent via {method}");

        return Results.Json(new { ok = true, method });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "❌ Error in /type endpoint");
        context.Response.StatusCode = 500;
        return Results.Json(new { ok = false, error = ex.Message });
    }
});

// GET /dump - Read chat transcript (UIA)
app.MapGet("/dump", (HttpContext context) =>
{
    try
    {
        logger.LogInformation("📖 Dump request received");

        var hwnd = FindCursorWindow();
        if (hwnd == IntPtr.Zero)
        {
            return Results.Json(new { ok = true, uia = false, items = Array.Empty<object>(), message = "Cursor not found" });
        }

        // Read chat using UIAutomation
        var chatItems = ReadChatViaUIA(hwnd, logger);
        
        logger.LogInformation($"📖 Found {chatItems.Count} chat items via UIA");
        
        return Results.Json(new { 
            ok = true, 
            uia = true, 
            items = chatItems,
            timestamp = DateTime.UtcNow
        });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "❌ Error in /dump endpoint");
        return Results.Json(new { ok = false, uia = false, error = ex.Message, items = Array.Empty<object>() });
    }
});

// GET /status - Health check
app.MapGet("/status", () =>
{
    var hwnd = FindCursorWindow();
    return Results.Json(new
    {
        ok = true,
        cursorFound = hwnd != IntPtr.Zero,
        version = "2.0.0",
        features = new[] { "chat-read", "chat-type", "terminal-read" },
        timestamp = DateTime.UtcNow
    });
});

// GET /terminal - Read terminal output (UIA)
app.MapGet("/terminal", (HttpContext context) =>
{
    try
    {
        logger.LogInformation("📟 Terminal read request received");

        var hwnd = FindCursorWindow();
        if (hwnd == IntPtr.Zero)
        {
            return Results.Json(new { ok = true, uia = false, output = "", message = "Cursor not found" });
        }

        // Read terminal output using UIA
        var terminalOutput = ReadTerminalViaUIA(hwnd, logger);
        
        logger.LogInformation($"📟 Terminal output length: {terminalOutput.Length}");
        
        return Results.Json(new { 
            ok = true, 
            uia = true, 
            output = terminalOutput,
            timestamp = DateTime.UtcNow
        });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "❌ Error in /terminal endpoint");
        return Results.Json(new { ok = false, uia = false, error = ex.Message, output = "" });
    }
});

// POST /terminal/command - Run command in Cursor terminal
app.MapPost("/terminal/command", async (HttpContext context) =>
{
    try
    {
        var request = await context.Request.ReadFromJsonAsync<TerminalCommandRequest>();
        
        if (request == null || string.IsNullOrWhiteSpace(request.Command))
        {
            context.Response.StatusCode = 400;
            return Results.Json(new { ok = false, error = "Missing 'command' field" });
        }

        // Sanitize command
        var command = SanitizeInput(request.Command, maxLength: 1000);
        logger.LogInformation($"📟 Terminal command request: {command.Substring(0, Math.Min(50, command.Length))}...");

        var hwnd = FindCursorWindow();
        if (hwnd == IntPtr.Zero)
        {
            context.Response.StatusCode = 503;
            return Results.Json(new { ok = false, error = "Cursor window not found" });
        }

        // Focus Cursor and open terminal
        User32.SetForegroundWindow(hwnd);
        await Task.Delay(100);
        
        // Open terminal with Ctrl+`
        SendHotkey(User32.VK.VK_OEM_3, ctrl: true); // ` key
        await Task.Delay(200);
        
        // Type command via clipboard
        await TypeViaClipboard(command);
        
        // Press Enter
        SendKey(User32.VK.VK_RETURN);
        
        logger.LogInformation("✅ Terminal command sent");
        return Results.Json(new { ok = true, message = "Command sent" });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "❌ Error in /terminal/command endpoint");
        context.Response.StatusCode = 500;
        return Results.Json(new { ok = false, error = ex.Message });
    }
});

logger.LogInformation("✅ Cursor Chat Host listening on http://127.0.0.1:8788");
logger.LogInformation("📡 Endpoints:");
logger.LogInformation("   POST /type            - Type text to Cursor chat");
logger.LogInformation("   GET  /dump            - Read chat transcript");
logger.LogInformation("   GET  /terminal        - Read terminal output");
logger.LogInformation("   POST /terminal/command- Send terminal command");
logger.LogInformation("   GET  /status          - Health check");

app.Run();

// ===========================================
// Helper Functions
// ===========================================

IntPtr FindCursorWindow()
{
    // Find Cursor.exe process
    var processes = Process.GetProcessesByName("Cursor");
    foreach (var process in processes)
    {
        if (process.MainWindowHandle != IntPtr.Zero)
        {
            return process.MainWindowHandle;
        }
    }
    return IntPtr.Zero;
}

string GetWindowTitle(IntPtr hwnd)
{
    try
    {
        var length = User32.GetWindowTextLength(hwnd);
        if (length == 0) return "";
        
        var sb = new StringBuilder(length + 1);
        User32.GetWindowText(hwnd, sb, sb.Capacity);
        return sb.ToString();
    }
    catch
    {
        return "ERROR";
    }
}

string SanitizeInput(string text, int maxLength)
{
    if (string.IsNullOrWhiteSpace(text))
        return string.Empty;

    // Remove control characters (except newlines and tabs)
    text = Regex.Replace(text, @"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "");
    
    // Normalize newlines
    text = text.Replace("\r\n", "\n").Replace("\r", "\n");
    
    // Trim to max length
    if (text.Length > maxLength)
    {
        text = text.Substring(0, maxLength);
    }

    return text.Trim();
}

async Task<string> TypeViaClipboard(string text)
{
    // Save current clipboard
    string? previousClipboard = null;
    try
    {
        previousClipboard = GetClipboardText();
    }
    catch
    {
        // Ignore clipboard read errors
    }

    try
    {
        // Set clipboard
        SetClipboardText(text);
        await Task.Delay(50);

        // Paste with Ctrl+V
        SendHotkey(User32.VK.VK_V, ctrl: true);
        await Task.Delay(50);

        return "clipboard";
    }
    finally
    {
        // Restore clipboard
        try
        {
            if (previousClipboard != null)
            {
                await Task.Delay(100);
                SetClipboardText(previousClipboard);
            }
        }
        catch
        {
            // Ignore clipboard restore errors
        }
    }
}

void SendHotkey(User32.VK key, bool ctrl = false, bool shift = false, bool alt = false)
{
    var inputs = new List<User32.INPUT>();

    // Press modifiers
    if (ctrl)
    {
        inputs.Add(CreateKeyInput(User32.VK.VK_CONTROL, false));
    }
    if (shift)
    {
        inputs.Add(CreateKeyInput(User32.VK.VK_SHIFT, false));
    }
    if (alt)
    {
        inputs.Add(CreateKeyInput(User32.VK.VK_MENU, false));
    }

    // Press key
    inputs.Add(CreateKeyInput(key, false));
    inputs.Add(CreateKeyInput(key, true));

    // Release modifiers
    if (alt)
    {
        inputs.Add(CreateKeyInput(User32.VK.VK_MENU, true));
    }
    if (shift)
    {
        inputs.Add(CreateKeyInput(User32.VK.VK_SHIFT, true));
    }
    if (ctrl)
    {
        inputs.Add(CreateKeyInput(User32.VK.VK_CONTROL, true));
    }

    User32.SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf<User32.INPUT>());
}

void SendKey(User32.VK key)
{
    var inputs = new[]
    {
        CreateKeyInput(key, false),
        CreateKeyInput(key, true)
    };
    User32.SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<User32.INPUT>());
}

User32.INPUT CreateKeyInput(User32.VK key, bool keyUp)
{
    return new User32.INPUT
    {
        type = User32.INPUTTYPE.INPUT_KEYBOARD,
        ki = new User32.KEYBDINPUT
        {
            wVk = (ushort)key,
            dwFlags = keyUp ? User32.KEYEVENTF.KEYEVENTF_KEYUP : 0
        }
    };
}

string? GetClipboardText()
{
    string? result = null;
    var thread = new Thread(() =>
    {
        try
        {
            if (User32.OpenClipboard(IntPtr.Zero))
            {
                var handle = User32.GetClipboardData((uint)13); // CF_UNICODETEXT
                if (handle != IntPtr.Zero)
                {
                    var ptr = Kernel32.GlobalLock(handle);
                    if (ptr != IntPtr.Zero)
                    {
                        result = Marshal.PtrToStringUni(ptr);
                        Kernel32.GlobalUnlock(handle);
                    }
                }
                User32.CloseClipboard();
            }
        }
        catch
        {
            // Ignore
        }
    });
    
    thread.SetApartmentState(ApartmentState.STA);
    thread.Start();
    thread.Join();
    
    return result;
}

void SetClipboardText(string text)
{
    var thread = new Thread(() =>
    {
        try
        {
            if (User32.OpenClipboard(IntPtr.Zero))
            {
                User32.EmptyClipboard();
                
                var hGlobal = Kernel32.GlobalAlloc(Kernel32.GMEM.GMEM_MOVEABLE, (SizeT)((text.Length + 1) * 2));
                if (!hGlobal.IsNull)
                {
                    var ptr = Kernel32.GlobalLock(hGlobal);
                    if (ptr != IntPtr.Zero)
                    {
                        Marshal.Copy(Encoding.Unicode.GetBytes(text + "\0"), 0, ptr, (text.Length + 1) * 2);
                        Kernel32.GlobalUnlock(hGlobal);
                        User32.SetClipboardData((uint)13, hGlobal.DangerousGetHandle()); // CF_UNICODETEXT
                    }
                }
                
                User32.CloseClipboard();
            }
        }
        catch
        {
            // Ignore
        }
    });
    
    thread.SetApartmentState(ApartmentState.STA);
    thread.Start();
    thread.Join();
}

// ===========================================
// UIA Chat Reading Functions
// ===========================================

List<ChatItem> ReadChatViaUIA(IntPtr hwnd, ILogger logger)
{
    var items = new List<ChatItem>();
    
    try
    {
        // Get AutomationElement from window handle
        var rootElement = AutomationElement.FromHandle(hwnd);
        if (rootElement == null)
        {
            logger.LogWarning("Could not get AutomationElement from Cursor window");
            return items;
        }

        logger.LogDebug("Got root element, searching for chat content...");

        // Strategy 1: Find elements with specific patterns that indicate chat messages
        // Cursor uses Electron/Chromium, so we look for Document or Text elements
        
        var textCondition = new PropertyCondition(
            AutomationElement.ControlTypeProperty, 
            ControlType.Text
        );
        
        var documentCondition = new PropertyCondition(
            AutomationElement.ControlTypeProperty,
            ControlType.Document
        );
        
        // Find all text elements
        var allTexts = rootElement.FindAll(TreeScope.Descendants, textCondition);
        var allDocs = rootElement.FindAll(TreeScope.Descendants, documentCondition);
        
        logger.LogDebug($"Found {allTexts.Count} text elements, {allDocs.Count} document elements");

        // Try to extract text from document elements (chat panels)
        foreach (AutomationElement doc in allDocs)
        {
            try
            {
                // Try to get text pattern
                if (doc.TryGetCurrentPattern(TextPattern.Pattern, out object? patternObj))
                {
                    var textPattern = patternObj as TextPattern;
                    if (textPattern != null)
                    {
                        var text = textPattern.DocumentRange.GetText(-1);
                        if (!string.IsNullOrWhiteSpace(text) && text.Length > 10)
                        {
                            // Parse the chat content
                            var parsed = ParseChatContent(text, logger);
                            items.AddRange(parsed);
                        }
                    }
                }
                
                // Also try value pattern
                if (doc.TryGetCurrentPattern(ValuePattern.Pattern, out object? valueObj))
                {
                    var valuePattern = valueObj as ValuePattern;
                    if (valuePattern != null)
                    {
                        var text = valuePattern.Current.Value;
                        if (!string.IsNullOrWhiteSpace(text) && text.Length > 10)
                        {
                            var parsed = ParseChatContent(text, logger);
                            items.AddRange(parsed);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogDebug($"Error reading document element: {ex.Message}");
            }
        }

        // If we found items, deduplicate and return
        if (items.Count > 0)
        {
            items = items
                .GroupBy(i => i.Text.Trim())
                .Select(g => g.First())
                .OrderBy(i => i.Timestamp)
                .ToList();
            
            logger.LogInformation($"Successfully extracted {items.Count} unique chat items");
            return items;
        }

        // Strategy 2: If no TextPattern, try walking the tree for any text content
        logger.LogDebug("TextPattern not available, trying tree walk...");
        
        var treeWalker = TreeWalker.ContentViewWalker;
        var collected = new HashSet<string>();
        
        CollectTextFromElement(rootElement, treeWalker, collected, logger, depth: 0, maxDepth: 15);
        
        // Convert collected text to chat items (simple heuristic)
        long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        foreach (var text in collected.Where(t => t.Length > 20).Take(50))
        {
            // Try to determine if it's user or assistant
            var role = text.StartsWith("You:") || text.Contains("שלחת:") ? "user" : "assistant";
            var cleanText = text
                .Replace("You:", "")
                .Replace("שלחת:", "")
                .Trim();
            
            if (!string.IsNullOrWhiteSpace(cleanText))
            {
                items.Add(new ChatItem(role, cleanText, timestamp++));
            }
        }

        logger.LogInformation($"Tree walk found {items.Count} potential chat items");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error in ReadChatViaUIA");
    }
    
    return items;
}

List<ChatItem> ParseChatContent(string rawText, ILogger logger)
{
    var items = new List<ChatItem>();
    
    try
    {
        // Split by common patterns that separate messages
        var lines = rawText.Split(new[] { "\n\n", "\r\n\r\n" }, StringSplitOptions.RemoveEmptyEntries);
        
        long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        
        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (string.IsNullOrWhiteSpace(trimmed) || trimmed.Length < 5)
                continue;
            
            // Heuristics to determine role
            string role = "assistant";
            string text = trimmed;
            
            // Check for user indicators
            if (trimmed.StartsWith("You:") || 
                trimmed.StartsWith(">") ||
                trimmed.Contains("שלחת") ||
                trimmed.StartsWith("User:"))
            {
                role = "user";
                text = Regex.Replace(trimmed, @"^(You:|User:|>|\s*שלחת:?\s*)", "").Trim();
            }
            // Check for AI indicators
            else if (trimmed.StartsWith("AI:") ||
                     trimmed.StartsWith("Assistant:") ||
                     trimmed.StartsWith("Claude:") ||
                     trimmed.StartsWith("GPT:"))
            {
                role = "assistant";
                text = Regex.Replace(trimmed, @"^(AI:|Assistant:|Claude:|GPT:)\s*", "").Trim();
            }
            
            if (!string.IsNullOrWhiteSpace(text) && text.Length > 3)
            {
                items.Add(new ChatItem(role, text, timestamp++, role == "assistant" ? "Cursor AI" : null));
            }
        }
    }
    catch (Exception ex)
    {
        logger.LogDebug($"Error parsing chat content: {ex.Message}");
    }
    
    return items;
}

void CollectTextFromElement(AutomationElement element, TreeWalker walker, HashSet<string> collected, ILogger logger, int depth, int maxDepth)
{
    if (depth > maxDepth) return;
    
    try
    {
        // Get name/text of current element
        var name = element.Current.Name;
        if (!string.IsNullOrWhiteSpace(name) && name.Length > 5 && name.Length < 5000)
        {
            collected.Add(name);
        }
        
        // Recurse to children
        var child = walker.GetFirstChild(element);
        while (child != null)
        {
            CollectTextFromElement(child, walker, collected, logger, depth + 1, maxDepth);
            child = walker.GetNextSibling(child);
        }
    }
    catch
    {
        // Ignore errors during traversal
    }
}

// ===========================================
// Terminal Reading Functions
// ===========================================

string ReadTerminalViaUIA(IntPtr hwnd, ILogger logger)
{
    var output = new StringBuilder();
    
    try
    {
        var rootElement = AutomationElement.FromHandle(hwnd);
        if (rootElement == null)
        {
            logger.LogWarning("Could not get AutomationElement for terminal read");
            return "";
        }

        // Look for terminal panel elements
        // Cursor's terminal is typically a text element with specific patterns
        var collected = new HashSet<string>();
        var treeWalker = TreeWalker.ContentViewWalker;
        
        CollectTerminalText(rootElement, treeWalker, collected, logger, 0, 20);
        
        // Filter for terminal-like content
        foreach (var text in collected)
        {
            // Heuristics for terminal content:
            // - Contains command prompts (PS, $, >, etc.)
            // - Contains path patterns
            // - Contains common CLI output patterns
            if (IsTerminalContent(text))
            {
                output.AppendLine(text);
            }
        }
        
        logger.LogDebug($"Terminal read collected {output.Length} chars");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error in ReadTerminalViaUIA");
    }
    
    return output.ToString();
}

void CollectTerminalText(AutomationElement element, TreeWalker walker, HashSet<string> collected, ILogger logger, int depth, int maxDepth)
{
    if (depth > maxDepth) return;
    
    try
    {
        var name = element.Current.Name;
        var className = element.Current.ClassName;
        var controlType = element.Current.ControlType;
        
        // Look for terminal-like elements
        if (!string.IsNullOrWhiteSpace(name) && name.Length > 3)
        {
            // Check if it looks like terminal content
            if (className?.Contains("terminal", StringComparison.OrdinalIgnoreCase) == true ||
                className?.Contains("xterm", StringComparison.OrdinalIgnoreCase) == true ||
                controlType == ControlType.Text ||
                controlType == ControlType.Edit)
            {
                collected.Add(name);
            }
        }
        
        // Try to get text from text pattern
        if (element.TryGetCurrentPattern(TextPattern.Pattern, out object? patternObj))
        {
            var textPattern = patternObj as TextPattern;
            if (textPattern != null)
            {
                var text = textPattern.DocumentRange.GetText(-1);
                if (!string.IsNullOrWhiteSpace(text) && text.Length > 5)
                {
                    collected.Add(text);
                }
            }
        }
        
        // Recurse to children
        var child = walker.GetFirstChild(element);
        while (child != null)
        {
            CollectTerminalText(child, walker, collected, logger, depth + 1, maxDepth);
            child = walker.GetNextSibling(child);
        }
    }
    catch
    {
        // Ignore traversal errors
    }
}

bool IsTerminalContent(string text)
{
    if (string.IsNullOrWhiteSpace(text) || text.Length < 10)
        return false;
    
    // Common terminal patterns
    var terminalPatterns = new[]
    {
        "PS ", "PS>", "$ ", "> ", ">>> ",  // Prompts
        "npm ", "node ", "git ", "dotnet ", // Commands
        "error", "warning", "success", // Status
        "C:\\", "/home/", "/usr/", // Paths
        "exit code", "listening on" // Common output
    };
    
    foreach (var pattern in terminalPatterns)
    {
        if (text.Contains(pattern, StringComparison.OrdinalIgnoreCase))
            return true;
    }
    
    // Check for ANSI-like patterns or line numbers
    if (Regex.IsMatch(text, @"^\s*\d+[\|\:]"))
        return true;
    
    return false;
}

// ===========================================
// Request/Response Models
// ===========================================

public record TypeRequest(string Text);
public record ChatItem(string Role, string Text, long Timestamp, string? Author = null);
public record TerminalCommandRequest(string Command);
