require("dotenv").config();
const express = require("express");

const app = express();
app.use(express.json({ limit: "1mb" }));

// ============================================================
// CORS
// ============================================================
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }
    next();
});

// ============================================================
// CONFIGURATION
// ============================================================
const PORT = Number(process.env.PORT || 3001);
const NVIDIA_URL =
    process.env.NVIDIA_URL ||
    "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "openai/gpt-oss-20b";
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const JAVA_DB2_API = process.env.JAVA_DB2_API || "http://127.0.0.1:8080/query";
const JAVA_HEALTH_API = process.env.JAVA_HEALTH_API || "http://127.0.0.1:8080/health";
const JAVA_DB2_STATUS_API = process.env.JAVA_DB2_STATUS_API || "http://127.0.0.1:8080/db2/status";
const DB2_SERVER = process.env.DB2_SERVER || "DALLAS9";

// ============================================================
// ALLOWED DATABASE SCHEMA & SECURITY
// ============================================================
const DATABASE_SCHEMA = {
    EMPTAB: {
        columns: ["EMPID", "EMPNAME", "EMPMOB"],
        description: "Employee information available from the mainframe Db2 database."
    }
};

const MAX_ROWS = 50;
const ALLOWED_OPERATORS = ["="];
const FORBIDDEN_SQL_PATTERN =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|MERGE|GRANT|REVOKE|CALL|EXEC|EXECUTE|COMMIT|ROLLBACK)\b/i;

// In-Memory System Status Cache for Context Maintenance
let lastSystemStatus = null;

// ============================================================
// UTILITIES
// ============================================================
function isValidString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function safeErrorMessage(error) {
    if (!error) return "Unknown error";
    return error.message || String(error);
}

function securityAnswer() {
    return "I can only perform read-only queries on the employee table (EMPTAB). I'm not able to modify, delete, or insert data, and I can't share credentials or connection details.";
}

// ============================================================
// SECURITY & INTENT CHECKS
// ============================================================
function isSecuritySensitiveQuestion(question) {
    const q = question.toLowerCase().trim();
    const patterns = [
        /\bpassword\b/, /\bpasswd\b/, /\bcredential(s)?\b/, /\bsecret(s)?\b/,
        /\bapi[\s_-]?key\b/, /\baccess[\s_-]?token\b/, /\bauth[\s_-]?token\b/,
        /\bprivate[\s_-]?key\b/, /\bconnection[\s_-]?string\b/, /\blogin details\b/,
        /\bdb2 login\b/, /\bmainframe login\b/, /\bmainframe credentials\b/
    ];
    return patterns.some(pattern => pattern.test(q));
}

function isForbiddenMutationQuestion(question) {
    const q = question.toLowerCase().trim();
    const mutationPatterns = [
        /\b(delete|drop|remove|truncate|clear|destroy)\b/,
        /\b(insert|add|create|append|new employee|put)\b/,
        /\b(update|change|modify|set|alter|edit|rename)\b/,
        /\b(grant|revoke)\b/
    ];
    return mutationPatterns.some(pattern => pattern.test(q));
}

// ============================================================
// LOCAL QUESTION CLASSIFICATION (WITH CONTEXT)
// ============================================================
function localQuestionType(question, history = []) {
    const q = question.toLowerCase().trim();

    if (isSecuritySensitiveQuestion(q) || isForbiddenMutationQuestion(q)) {
        return "SECURITY";
    }

    if (/^(hi|hello|hey|hiya|good morning|good afternoon|good evening)\b/i.test(q)) {
        return "GREETING";
    }

    if (/^(bye|goodbye|see you|exit|quit)\b/i.test(q)) {
        return "GOODBYE";
    }

    if (/\b(system status|system health|system health check|health check|check connection|connectivity|is db2 connected|is db2 available|is ddf running|is java api working)\b/i.test(q)) {
        return "SYSTEM_STATUS";
    }

    // Contextual follow-up check (e.g., "now", "again", "what about now")
    if (/^(now|again|status now|check now|what about now|and now)$/i.test(q)) {
        const lastAssistantMsg = [...history].reverse().find(m => m.role === "assistant");
        const lastUserMsg = [...history].reverse().find(m => m.role === "user" && m.content !== question);

        if (
            (lastUserMsg && /\b(health|status|connection|system)\b/i.test(lastUserMsg.content)) ||
            (lastAssistantMsg && /\b(status|health|degraded|operational|up|down)\b/i.test(lastAssistantMsg.content))
        ) {
            return "SYSTEM_STATUS";
        }
    }

    if (/\b(what tables|which tables|what table|tables do i have access|what database tables|show me tables|show tables|list tables)\b/i.test(q)) {
        return "ACCESS_INFO";
    }

    if (/\b(employee|employees|emptab|employee id|employee number|member|record|who is|details of|detail of|info about|find|search|get|show)\b/i.test(q)) {
        return "DATA_QUERY";
    }

    return null;
}

// ============================================================
// NVIDIA API CALL
// ============================================================
async function callNvidia(messages, options = {}) {
    if (!NVIDIA_API_KEY) {
        throw new Error("NVIDIA_API_KEY is not configured");
    }

    const response = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${NVIDIA_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: NVIDIA_MODEL,
            messages: messages,
            temperature: options.temperature ?? 0.1,
            top_p: options.top_p ?? 0.7,
            max_tokens: options.max_tokens ?? 300,
            stream: false
        }),
        signal: AbortSignal.timeout(options.timeout ?? 8000)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NVIDIA API error ${response.status}: ${errorText}`);
    }

    return await response.json();
}

function getNvidiaText(result) {
    const content = result?.choices?.[0]?.message?.content;
    const reasoning = result?.choices?.[0]?.message?.reasoning_content;
    const text = content || reasoning || "";
    if (typeof text !== "string" || text.trim().length === 0) {
        throw new Error("NVIDIA returned an empty response");
    }
    return text.trim();
}

function parseJsonResponse(content) {
    if (!isValidString(content)) throw new Error("Empty JSON response");
    let cleaned = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    try {
        return JSON.parse(cleaned);
    } catch (e) {}

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
            return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
        } catch (e) {}
    }

    throw new Error("NVIDIA returned invalid JSON");
}

// ============================================================
// CLASSIFIER & INTENT GENERATION
// ============================================================
async function classifyQuestion(userQuestion, history = []) {
    const localType = localQuestionType(userQuestion, history);
    if (localType) return { type: localType };

    const systemPrompt = `You classify requests for a read-only mainframe Db2 for z/OS chatbot.
Return ONLY valid JSON.
Allowed types: GREETING, GOODBYE, DATA_QUERY, SYSTEM_STATUS, MAINFRAME_GENERAL, ACCESS_INFO, OUT_OF_SCOPE, SECURITY

Return JSON format: {"type":"DATA_QUERY"}`;

    try {
        const messages = [{ role: "system", content: systemPrompt }];
        if (history.length > 0) {
            messages.push(...history.slice(-3));
        }
        messages.push({ role: "user", content: userQuestion });

        const result = await callNvidia(messages, { temperature: 0, max_tokens: 50, timeout: 5000 });
        const content = getNvidiaText(result);
        const parsed = parseJsonResponse(content);

        const allowedTypes = ["GREETING", "GOODBYE", "DATA_QUERY", "SYSTEM_STATUS", "MAINFRAME_GENERAL", "ACCESS_INFO", "OUT_OF_SCOPE", "SECURITY"];
        if (!allowedTypes.includes(parsed.type)) throw new Error("Invalid type");
        return parsed;
    } catch (error) {
        return fallbackQuestionClassification(userQuestion, history);
    }
}

function fallbackQuestionClassification(question, history = []) {
    const local = localQuestionType(question, history);
    if (local) return { type: local };

    const q = question.toLowerCase();

    if (isForbiddenMutationQuestion(q)) {
        return { type: "SECURITY" };
    }

    if (/\b(employee|employees|emptab|employee id|employee number|member|record|who is|details of|detail of|info about|find|search|get)\b/i.test(q)) {
        return { type: "DATA_QUERY" };
    }

    if (/\b(mainframe|db2|z\/os|zos|jdbc|ddf|java api|database)\b/i.test(q)) {
        return { type: "MAINFRAME_GENERAL" };
    }

    return { type: "OUT_OF_SCOPE" };
}

async function createQueryIntent(userQuestion, history = []) {
    const systemPrompt = `You create a structured read-only query request for a Db2 for z/OS mainframe chatbot.
The ONLY available table is: EMPTAB
The ONLY available columns are: EMPID, EMPNAME, EMPMOB
The ONLY operation is: SELECT

Return ONLY valid JSON:
{
  "operation": "SELECT",
  "table": "EMPTAB",
  "columns": ["EMPID", "EMPNAME", "EMPMOB"],
  "filters": [],
  "limit": 20
}

If the user asks for a specific name, ID, or mobile, add a filter. Search across relevant columns.`;

    try {
        const messages = [{ role: "system", content: systemPrompt }];
        if (history.length > 0) messages.push(...history.slice(-3));
        messages.push({ role: "user", content: userQuestion });

        const result = await callNvidia(messages, { temperature: 0, max_tokens: 200, timeout: 8000 });
        const intent = parseJsonResponse(getNvidiaText(result));
        return normalizeIntent(intent, userQuestion);
    } catch (error) {
        return createFallbackIntent(userQuestion);
    }
}

function createFallbackIntent(question) {
    const intent = {
        operation: "SELECT",
        table: "EMPTAB",
        columns: ["EMPID", "EMPNAME", "EMPMOB"],
        filters: [],
        limit: 20
    };

    const q = question.toLowerCase().trim();

    // Check for ID pattern - "employee id of X" or "id of X"
    const idOfNameMatch = question.match(/\b(?:employee\s+)?id\s+(?:of\s+)?([a-zA-Z]{2,30})\b/i);
    if (idOfNameMatch) {
        const name = idOfNameMatch[1].toUpperCase();
        if (!["THE", "WHAT", "IS", "GET", "SHOW", "ALL"].includes(name)) {
            intent.filters = [{ column: "EMPNAME", operator: "=", value: name }];
            return intent;
        }
    }

    // Check for numeric ID pattern
    const idMatch = question.match(/\b(\d{3,10})\b/);
    if (idMatch && /\b(employee|member|details|record|id|number)\b/i.test(question)) {
        intent.filters = [{ column: "EMPID", operator: "=", value: idMatch[1] }];
        return intent;
    }

    // Check for name - search by EMPNAME (more flexible patterns)
    const namePatterns = [
        /\b(?:who is|details of|detail of|info about|information about|find|search for|get)\s+([a-zA-Z]+)/i,
        /\b([a-zA-Z]{2,30})\s+(?:employee|details|info|record)\b/i,
        /\b(?:employee|emp)\s+([a-zA-Z]{2,30})\b/i,
        /\b(?:name|called)\s+([a-zA-Z]{2,30})\b/i
    ];

    for (const pattern of namePatterns) {
        const match = question.match(pattern);
        if (match && match[1]) {
            const name = match[1].toUpperCase();
            if (!["GET", "SHOW", "ALL", "THE", "DETAILS", "DELETE", "DROP", "UPDATE", "INSERT", "WHO", "IS", "WHAT", "NAME", "CALLED"].includes(name)) {
                intent.filters = [{ column: "EMPNAME", operator: "=", value: name }];
                return intent;
            }
        }
    }

    // Check for mobile
    const mobileMatch = question.match(/\b(\d{10,15})\b/);
    if (mobileMatch && /\b(mobile|phone|contact)\b/i.test(question)) {
        intent.filters = [{ column: "EMPMOB", operator: "=", value: mobileMatch[1] }];
        return intent;
    }

    return intent;
}

function normalizeIntent(intent, userQuestion) {
    if (!intent || typeof intent !== "object") throw new Error("Invalid query intent");
    intent.operation = "SELECT";
    intent.table = "EMPTAB";

    if (!Array.isArray(intent.columns) || intent.columns.length === 0) {
        intent.columns = ["EMPID", "EMPNAME", "EMPMOB"];
    }

    intent.columns = [...new Set(intent.columns.map(c => String(c).toUpperCase().trim()))];
    let limit = Number(intent.limit);
    intent.limit = (!Number.isInteger(limit) || limit < 1) ? 20 : Math.min(limit, MAX_ROWS);
    intent.filters = normalizeFilters(intent.filters);
    return intent;
}

function normalizeFilters(filters) {
    if (!Array.isArray(filters)) return [];
    const normalized = [];
    for (const filter of filters) {
        if (filter && typeof filter === "object" && typeof filter.column === "string") {
            const col = filter.column.toUpperCase().trim();
            if (["EMPID", "EMPNAME", "EMPMOB"].includes(col)) {
                normalized.push({
                    column: col,
                    operator: "=",
                    value: String(filter.value ?? "").trim()
                });
            }
        }
    }
    return normalized;
}

function validateQueryIntent(intent) {
    if (!intent || intent.operation !== "SELECT" || intent.table !== "EMPTAB") {
        throw new Error("Security Violation: Only SELECT on EMPTAB is permitted");
    }
    return intent;
}

function escapeSqlValue(value) {
    return String(value).replace(/'/g, "''");
}

function buildSelect(intent) {
    const columns = intent.columns.join(", ");
    let sql = `SELECT ${columns} FROM EMPTAB`;

    if (intent.filters && intent.filters.length > 0) {
        const conditions = intent.filters.map(filter => {
            if (filter.column === "EMPID") {
                const num = String(filter.value).trim();
                if (!/^\d+$/.test(num)) throw new Error("EMPID must be numeric");
                return `EMPID = ${num}`;
            }
            if (filter.column === "EMPNAME") {
                return `UPPER(EMPNAME) = UPPER('${escapeSqlValue(filter.value)}')`;
            }
            if (filter.column === "EMPMOB") {
                return `EMPMOB = '${escapeSqlValue(filter.value)}'`;
            }
            throw new Error(`Unsupported filter: ${filter.column}`);
        });
        sql += " WHERE " + conditions.join(" AND ");
    }

    sql += ` FETCH FIRST ${intent.limit} ROWS ONLY`;
    return sql;
}

function validateGeneratedSql(sql) {
    if (!isValidString(sql)) throw new Error("Empty SQL");
    const trimmed = sql.trim();
    if (!/^SELECT\b/i.test(trimmed) || FORBIDDEN_SQL_PATTERN.test(trimmed) || !/\bFROM\s+EMPTAB\b/i.test(trimmed) || trimmed.includes(";")) {
        throw new Error("Security violation: Only read-only SELECT queries on EMPTAB are allowed");
    }
    return true;
}

async function executeDb2(sql) {
    validateGeneratedSql(sql);
    let response;
    try {
        response = await fetch(JAVA_DB2_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sql: sql }),
            signal: AbortSignal.timeout(15000)
        });
    } catch (error) {
        throw new Error("Java DB2 API is unreachable: " + safeErrorMessage(error));
    }

    let data;
    try {
        data = await response.json();
    } catch (error) {
        throw new Error("Java DB2 API returned invalid JSON");
    }

    if (!response.ok || !data.success) {
        throw new Error(data.error || "Db2 query failed");
    }

    if (!Array.isArray(data.rows)) data.rows = [];
    return data;
}

// ============================================================
// NATURAL RESPONSE GENERATORS
// ============================================================
async function generateFinalAnswer(userQuestion, queryIntent, dbResult, history = []) {
    const rows = Array.isArray(dbResult.rows) ? dbResult.rows : [];
    
    if (!NVIDIA_API_KEY) return createNaturalDataAnswer(userQuestion, rows, queryIntent);

    const prompt = `You are a helpful mainframe Db2 assistant. Answer naturally and conversationally based on the database results.

User asked: "${userQuestion}"
Query filters used: ${JSON.stringify(queryIntent.filters)}
Database rows returned: ${JSON.stringify(rows, null, 2)}

Rules:
1. Answer in a natural, human-like way - conversational but professional
2. If 0 rows found, say something like "I couldn't find any records matching..." or "No employees found with..."
3. If 1 row found, present the details naturally
4. If multiple rows, summarize count and show in a clean format
5. Never output raw JSON, SQL, or technical jargon
6. Keep responses concise but friendly`;

    try {
        const messages = [{ role: "system", content: "You are a helpful mainframe Db2 assistant. Answer naturally using the provided database data. Be conversational and concise." }];
        if (history.length > 0) messages.push(...history.slice(-3));
        messages.push({ role: "user", content: prompt });

        const result = await callNvidia(messages, { temperature: 0.3, max_tokens: 300, timeout: 8000 });
        return getNvidiaText(result);
    } catch (error) {
        return createNaturalDataAnswer(userQuestion, rows, queryIntent);
    }
}

function createNaturalDataAnswer(question, rows, intent = {}) {
    if (!rows || rows.length === 0) {
        if (intent.filters && intent.filters.length > 0) {
            const f = intent.filters[0];
            return `I couldn't find any employee records matching ${f.column.toLowerCase()} = '${f.value}' in the database.`;
        }
        return "I didn't find any matching records in the employee table.";
    }

    if (rows.length === 1) {
        const r = rows[0];
        const details = [];
        if (r.EMPID != null) details.push(`Employee ID: ${String(r.EMPID).trim()}`);
        if (r.EMPNAME != null) details.push(`Name: ${String(r.EMPNAME).trim()}`);
        if (r.EMPMOB != null && String(r.EMPMOB).trim() !== "") {
            details.push(`Mobile: ${String(r.EMPMOB).trim()}`);
        } else {
            details.push("Mobile: Not available");
        }
        return `Found 1 employee:\n\n${details.join("\n")}`;
    }

    let answer = `Found ${rows.length} employees in the database:\n\n`;
    rows.forEach((r, i) => {
        const id = r.EMPID != null ? String(r.EMPID).trim() : "N/A";
        const name = r.EMPNAME != null ? String(r.EMPNAME).trim() : "N/A";
        const mob = (r.EMPMOB != null && String(r.EMPMOB).trim() !== "") ? String(r.EMPMOB).trim() : "N/A";
        answer += `${i + 1}. **${name}** (ID: ${id}) - Mobile: ${mob}\n`;
    });
    return answer.trim();
}

function greetingAnswer() {
    return "Hi! I'm your mainframe Db2 assistant. I can help you look up employee details, check system health, or show you what data is available. What would you like to know?";
}

function goodbyeAnswer() {
    return "Goodbye! Feel free to come back anytime you need to query the mainframe database.";
}

function accessInfoAnswer() {
    return "You have read-only access to the **EMPTAB** table with these columns:\n- **EMPID** - Employee ID\n- **EMPNAME** - Employee Name\n- **EMPMOB** - Mobile Number\n\nOnly SELECT queries are allowed.";
}

function outOfScopeAnswer() {
    return "I'm specialized for mainframe Db2 queries and system health checks. That's outside what I can help with. Try asking about employees or system status!";
}

async function generateMainframeGeneralAnswer(question, systemStatus, history = []) {
    lastSystemStatus = systemStatus;
    const fallback = createSystemNaturalAnswer(question, systemStatus);
    if (!NVIDIA_API_KEY) return fallback;

    try {
        const messages = [{ role: "system", content: "You are a mainframe assistant. Answer naturally about system status using the provided data. Be conversational and concise." }];
        if (history.length > 0) messages.push(...history.slice(-3));
        messages.push({
            role: "user",
            content: `Question: "${question}"\nSystem Status:\n${JSON.stringify(systemStatus, null, 2)}`
        });

        const result = await callNvidia(messages, { temperature: 0.2, max_tokens: 250, timeout: 8000 });
        return getNvidiaText(result);
    } catch (error) {
        return fallback;
    }
}

function createSystemNaturalAnswer(question, status) {
    if (!status) return "System status information is currently unavailable.";
    
    const parts = [];
    parts.push(`**System Status: ${status.overall}**`);
    parts.push(`- Node.js API: ${status.nodejs?.status || "UNKNOWN"}`);
    parts.push(`- NVIDIA AI: ${status.nvidia?.status || "UNKNOWN"}`);
    parts.push(`- Java DB2 API: ${status.javaApi?.status || "UNKNOWN"}`);
    parts.push(`- Db2 (${status.db2?.server || "DALLAS9"}): ${status.db2?.status || "UNKNOWN"}`);
    if (status.db2?.error) parts.push(`  - Note: ${status.db2.error}`);
    
    return parts.join("\n");
}

// ============================================================
// SYSTEM MONITORING CHECKS
// ============================================================
async function checkNvidia() {
    if (!NVIDIA_API_KEY) return { status: "DOWN", error: "NVIDIA_API_KEY is not configured" };
    const started = Date.now();
    try {
        const response = await fetch(NVIDIA_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${NVIDIA_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ model: NVIDIA_MODEL, messages: [{ role: "user", content: "OK" }], max_tokens: 50 }),
            signal: AbortSignal.timeout(15000)
        });
        const responseTimeMs = Date.now() - started;
        if (!response.ok) return { status: "DOWN", httpStatus: response.status, responseTimeMs };
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        const reasoning = data?.choices?.[0]?.message?.reasoning_content;
        if (!content && !reasoning) {
            return { status: "DOWN", error: "NVIDIA returned an empty response", responseTimeMs };
        }
        return { status: "UP", responseTimeMs };
    } catch (error) {
        return { status: "DOWN", error: safeErrorMessage(error) };
    }
}

async function checkJavaApi() {
    const started = Date.now();
    try {
        const response = await fetch(JAVA_HEALTH_API, { signal: AbortSignal.timeout(5000) });
        const responseTimeMs = Date.now() - started;
        if (!response.ok) return { status: "DOWN", httpStatus: response.status, responseTimeMs };
        const data = await response.json();
        return { status: String(data.status || "UP").toUpperCase(), responseTimeMs };
    } catch (error) {
        return { status: "DOWN", error: safeErrorMessage(error) };
    }
}

async function checkDb2() {
    const started = Date.now();
    try {
        const response = await fetch(JAVA_DB2_STATUS_API, { signal: AbortSignal.timeout(5000) });
        const responseTimeMs = Date.now() - started;
        let data = await response.json();
        if (!response.ok) {
            return {
                status: "DOWN", jdbc: data.jdbc || "DOWN", ddf: data.ddf || "DOWN",
                db2: data.db2 || "DOWN", server: data.server || null, responseTimeMs, error: data.error || "Db2 check failed"
            };
        }
        return {
            status: data.status || "UP", jdbc: data.jdbc || "DOWN", ddf: data.ddf || "DOWN",
            db2: data.db2 || "DOWN", server: data.server || null, responseTimeMs: data.responseTimeMs ?? responseTimeMs, error: data.error || null
        };
    } catch (error) {
        return { status: "DOWN", jdbc: "DOWN", ddf: "DOWN", db2: "DOWN", server: null, responseTimeMs: Date.now() - started, error: safeErrorMessage(error) };
    }
}

async function getSystemStatus() {
    const [nvidia, javaApi, db2] = await Promise.all([checkNvidia(), checkJavaApi(), checkDb2()]);
    const nodejs = { status: "UP" };
    const allUp = nvidia.status === "UP" && javaApi.status === "UP" && db2.status === "UP" && db2.jdbc === "UP" && db2.ddf === "UP" && db2.db2 === "UP";
    const allDown = nvidia.status === "DOWN" && javaApi.status === "DOWN" && db2.status === "DOWN";
    let overall = allUp ? "UP" : allDown ? "DOWN" : "DEGRADED";

    const statusObj = {
        checkedAt: new Date().toISOString(),
        overall, nodejs, nvidia, javaApi,
        jdbc: { status: db2.jdbc },
        ddf: { status: db2.ddf },
        db2: { status: db2.db2, server: db2.server, responseTimeMs: db2.responseTimeMs, error: db2.error }
    };
    lastSystemStatus = statusObj;
    return statusObj;
}

// ============================================================
// CHAT ENDPOINT
// ============================================================
app.post("/chat", async (req, res) => {
    try {
        const userQuestion = req.body?.message;
        const history = Array.isArray(req.body?.history) ? req.body.history : [];

        if (!isValidString(userQuestion)) {
            return res.status(400).json({ success: false, error: "message is required" });
        }

        const question = userQuestion.trim();
        console.log("\n=================================");
        console.log("USER QUESTION:", question);

        // Security check
        if (isSecuritySensitiveQuestion(question) || isForbiddenMutationQuestion(question)) {
            return res.json({
                success: true,
                type: "SECURITY",
                answer: securityAnswer(),
                data: []
            });
        }

        // Classification
        const classification = await classifyQuestion(question, history);
        const type = classification.type;

        if (type === "GREETING") return res.json({ success: true, type, answer: greetingAnswer(), data: [] });
        if (type === "GOODBYE") return res.json({ success: true, type, answer: goodbyeAnswer(), data: [] });
        if (type === "ACCESS_INFO") return res.json({ success: true, type, answer: accessInfoAnswer(), data: [] });
        if (type === "SECURITY") return res.json({ success: true, type, answer: securityAnswer(), data: [] });
        if (type === "OUT_OF_SCOPE") return res.json({ success: true, type, answer: outOfScopeAnswer(), data: [] });

        if (type === "SYSTEM_STATUS" || type === "MAINFRAME_GENERAL") {
            const systemStatus = await getSystemStatus();
            const answer = await generateMainframeGeneralAnswer(question, systemStatus, history);
            return res.json({ success: true, type, answer, data: [], systemStatus });
        }

        if (type === "DATA_QUERY") {
            const intent = await createQueryIntent(question, history);
            validateQueryIntent(intent);
            const sql = buildSelect(intent);
            validateGeneratedSql(sql);

            const dbResult = await executeDb2(sql);
            const answer = await generateFinalAnswer(question, intent, dbResult, history);

            return res.json({
                success: true,
                type: "DATA_QUERY",
                answer: answer,
                data: dbResult.rows,
                query: { operation: "SELECT", table: intent.table, columns: intent.columns, limit: intent.limit }
            });
        }

        return res.json({ success: true, type: "OUT_OF_SCOPE", answer: outOfScopeAnswer(), data: [] });
    } catch (error) {
        console.error("\nCHAT ERROR:", error);
        const message = safeErrorMessage(error);

        if (/only SELECT|security violation|forbidden SQL|not allowed/i.test(message)) {
            return res.json({
                success: true,
                type: "SECURITY",
                answer: securityAnswer(),
                data: []
            });
        }

        return res.status(500).json({
            success: false,
            type: "ERROR",
            answer: "I encountered an error processing your request on the mainframe backend.",
            error: message,
            data: []
        });
    }
});

// ============================================================
// SYSTEM STATUS & ACCESS ENDPOINTS
// ============================================================
app.get("/health", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, status: "UP", timestamp: new Date().toISOString() });
});

app.get("/system-status", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
        const status = await getSystemStatus();
        return res.json({ success: true, status });
    } catch (error) {
        return res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

app.get("/access", (req, res) => {
    res.set("Cache-Control", "no-store");
    return res.json({
        success: true,
        readOnly: true,
        tables: [{ name: "EMPTAB", columns: DATABASE_SCHEMA.EMPTAB.columns }],
        allowedOperations: ["SELECT"]
    });
});

app.listen(PORT, "127.0.0.1", () => {
    console.log(`Mainframe AI Chatbot running at [http://127.0.0.1](http://127.0.0.1):${PORT}`);
});