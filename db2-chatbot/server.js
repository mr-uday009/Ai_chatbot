require("dotenv").config();

const express = require("express");

const app = express();

app.use(express.json());

const PORT = 3001;

const NVIDIA_URL =
    "https://integrate.api.nvidia.com/v1/chat/completions";

const NVIDIA_MODEL =
    "openai/gpt-oss-20b";

const JAVA_DB2_API =
    "http://127.0.0.1:8080/query";


// ============================================================
// ALLOWED DATABASE SCHEMA
// ============================================================

const DATABASE_SCHEMA = {

    EMPTAB: {

        columns: [
            "EMPID",
            "EMPNAME",
            "EMPMOB"
        ]
    }
};


// ============================================================
// NVIDIA API
// ============================================================

async function callNvidia(messages) {

    const response = await fetch(
        NVIDIA_URL,
        {
            method: "POST",

            headers: {
                "Authorization":
                    `Bearer ${process.env.NVIDIA_API_KEY}`,

                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({

                model: NVIDIA_MODEL,

                messages: messages,

                temperature: 0.1,

                top_p: 0.7,

                max_tokens: 1000,

                stream: false
            })
        }
    );


    if (!response.ok) {

        const errorText =
            await response.text();

        throw new Error(
            `NVIDIA API error ${response.status}: ${errorText}`
        );
    }


    return await response.json();
}


// ============================================================
// ASK NVIDIA FOR STRUCTURED QUERY
// ============================================================

async function createQueryIntent(userQuestion) {

    const systemPrompt = `
You are a database query planning assistant.

You are connected to a Db2 for z/OS database.

Your ONLY allowed operation is SELECT.

You MUST NOT generate SQL.

You MUST NOT generate INSERT, UPDATE, DELETE,
DROP, ALTER, CREATE, TRUNCATE, MERGE, GRANT,
REVOKE, CALL or EXECUTE.

Return ONLY valid JSON.

Available database schema:

TABLE: EMPTAB

COLUMNS:
- EMPID
- EMPNAME
- EMPMOB

Return exactly this structure:

{
  "operation": "SELECT",
  "table": "EMPTAB",
  "columns": [],
  "filters": [],
  "limit": 20
}

Rules:

1. operation must always be SELECT.
2. table must be EMPTAB.
3. columns must contain only valid EMPTAB columns.
4. If the user asks for all columns, return all columns.
5. limit must be between 1 and 50.
6. filters must contain only safe equality filters.
7. Never return SQL.
8. Return JSON only.
`;


    const result =
        await callNvidia([

            {
                role: "system",
                content: systemPrompt
            },

            {
                role: "user",
                content: userQuestion
            }

        ]);


    const content =
        result.choices?.[0]?.message?.content;


    if (!content) {

        throw new Error(
            "NVIDIA returned an empty response"
        );
    }


    console.log("\nNVIDIA query intent:");
    console.log(content);


    return parseJsonResponse(content);
}


// ============================================================
// PARSE NVIDIA JSON
// ============================================================

function parseJsonResponse(content) {

    let cleaned =
        content.trim();


    // Remove markdown JSON fences if model adds them

    if (cleaned.startsWith("```")) {

        cleaned =
            cleaned
                .replace(/^```json\s*/i, "")
                .replace(/^```\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim();
    }


    try {

        return JSON.parse(cleaned);

    } catch (error) {

        console.error(
            "Invalid NVIDIA JSON:",
            cleaned
        );

        throw new Error(
            "NVIDIA returned invalid JSON"
        );
    }
}


// ============================================================
// VALIDATE QUERY INTENT
// ============================================================

function validateQueryIntent(intent) {

    if (!intent ||
        typeof intent !== "object") {

        throw new Error(
            "Invalid query intent"
        );
    }


    // Operation

    if (intent.operation !== "SELECT") {

        throw new Error(
            "Only SELECT operation is allowed"
        );
    }


    // Table

    if (intent.table !== "EMPTAB") {

        throw new Error(
            "Table is not allowed"
        );
    }


    // Columns

    if (!Array.isArray(intent.columns) ||
        intent.columns.length === 0) {

        throw new Error(
            "No columns requested"
        );
    }


    const allowedColumns =
        DATABASE_SCHEMA.EMPTAB.columns;


    for (const column of intent.columns) {

        if (!allowedColumns.includes(column)) {

            throw new Error(
                `Column not allowed: ${column}`
            );
        }
    }


    // Limit

    let limit =
        Number(intent.limit);


    if (!Number.isInteger(limit)) {

        limit = 20;
    }


    if (limit < 1) {

        limit = 1;
    }


    if (limit > 50) {

        limit = 50;
    }


    intent.limit = limit;


    // Filters

    if (!Array.isArray(intent.filters)) {

        intent.filters = [];
    }


    for (const filter of intent.filters) {

        if (!filter ||
            typeof filter !== "object") {

            throw new Error(
                "Invalid filter"
            );
        }


        if (!allowedColumns.includes(
            filter.column
        )) {

            throw new Error(
                `Filter column not allowed: ${filter.column}`
            );
        }


        if (filter.operator !== "=") {

            throw new Error(
                "Only equality filters are allowed"
            );
        }
    }


    return intent;
}


// ============================================================
// BUILD SAFE SELECT
// ============================================================

function buildSelect(intent) {

    const columns =
        intent.columns.join(", ");


    let sql =
        `SELECT ${columns} FROM EMPTAB`;


    if (intent.filters.length > 0) {

        const conditions =
            intent.filters.map(
                filter => {

                    return `${filter.column} = '${escapeSqlValue(
                        String(filter.value)
                    )}'`;
                }
            );


        sql +=
            " WHERE " +
            conditions.join(" AND ");
    }


    sql +=
        ` FETCH FIRST ${intent.limit} ROWS ONLY`;


    return sql;
}


// ============================================================
// SQL VALUE ESCAPING
// ============================================================

function escapeSqlValue(value) {

    return value.replace(
        /'/g,
        "''"
    );
}


// ============================================================
// CALL JAVA DB2 SERVICE
// ============================================================

async function executeDb2(sql) {

    const response =
        await fetch(
            JAVA_DB2_API,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    sql: sql
                })
            }
        );


    const data =
        await response.json();


    if (!response.ok ||
        !data.success) {

        throw new Error(
            data.error ||
            "Db2 query failed"
        );
    }


    return data;
}


// ============================================================
// GENERATE FINAL NATURAL LANGUAGE RESPONSE
// ============================================================

async function generateFinalAnswer(
    userQuestion,
    queryIntent,
    dbResult
) {

    const prompt = `
You are a helpful mainframe database assistant.

The user asked:

${userQuestion}

The system executed a READ-ONLY SELECT query.

Query intent:

${JSON.stringify(queryIntent)}

Database result:

${JSON.stringify(dbResult.rows)}

Answer the user's question using ONLY the returned database data.

Do not invent values.

If no rows were returned, clearly say that no matching records were found.

Keep the answer concise and easy to understand.
`;


    const result =
        await callNvidia([

            {
                role: "system",
                content:
                    "Answer questions using only supplied database results."
            },

            {
                role: "user",
                content: prompt
            }

        ]);


    return (
        result.choices?.[0]?.message?.content ||
        "No answer generated."
    );
}


// ============================================================
// CHAT ENDPOINT
// ============================================================

app.post(
    "/chat",
    async (req, res) => {

        try {

            const userQuestion =
                req.body?.message;


            if (!userQuestion ||
                typeof userQuestion !== "string") {

                return res.status(400).json({

                    success: false,

                    error:
                        "message is required"
                });
            }


            console.log("\n=================================");
            console.log("USER QUESTION");
            console.log("=================================");
            console.log(userQuestion);


            // 1. NVIDIA → structured intent

            const intent =
                await createQueryIntent(
                    userQuestion
                );


            // 2. Validate intent

            validateQueryIntent(
                intent
            );


            console.log(
                "\nValidated intent:"
            );

            console.log(
                JSON.stringify(
                    intent,
                    null,
                    2
                )
            );


            // 3. Build safe SELECT

            const sql =
                buildSelect(intent);


            console.log(
                "\nGenerated SELECT:"
            );

            console.log(sql);


            // 4. Java → Db2

            const dbResult =
                await executeDb2(sql);


            console.log(
                "\nDb2 rows:",
                dbResult.rows.length
            );


            // 5. NVIDIA → natural language

            const answer =
                await generateFinalAnswer(
                    userQuestion,
                    intent,
                    dbResult
                );


            // 6. Return

            res.json({

                success: true,

                answer: answer,

                data: dbResult.rows,

                query: {
                    operation:
                        intent.operation,

                    table:
                        intent.table,

                    columns:
                        intent.columns,

                    limit:
                        intent.limit
                }
            });


        } catch (error) {

            console.error(
                "\nCHAT ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                error:
                    error.message
            });
        }
    }
);


// ============================================================
// HEALTH
// ============================================================

app.get(
    "/health",
    (req, res) => {

        res.json({

            success: true,

            service:
                "Mainframe AI Chatbot",

            model:
                NVIDIA_MODEL,

            db2Api:
                JAVA_DB2_API
        });
    }
);


// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    "127.0.0.1",
    () => {

        console.log(
            "================================="
        );

        console.log(
            " Mainframe AI Chatbot"
        );

        console.log(
            "================================="
        );

        console.log(
            `Server: http://127.0.0.1:${PORT}`
        );

        console.log(
            `NVIDIA: ${NVIDIA_MODEL}`
        );

        console.log(
            `Db2 API: ${JAVA_DB2_API}`
        );

        console.log(
            "================================="
        );
    }
);