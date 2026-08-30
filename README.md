# AI Chatbot for Mainframe Data

A secure, natural-language chatbot for querying Db2 for z/OS mainframe data with multiple frontend interfaces (React + Streamlit) and a Java-based security gateway.

## Architecture Overview

### Architecture V1

![AI Chatbot Architecture V1](images/Ai%20ChatBot%20Architecture%20-%20V1.png)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Node.js API   │────▶│   Java DB2 API  │
│  (React/Streamlit)     (Port 3001)      │     (Port 8080)   │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                          │
                                                 ┌────────▼────────┐
                                                 │   Db2 for z/OS  │
                                                 │   (Mainframe)   │
                                    w             └─────────────────┘
```

### Security Layers
1. **Node.js** - Classifies intent, builds parameterized SELECT queries, calls NVIDIA LLM for natural responses
2. **Java API** - Validates SQL against strict regex patterns, executes only approved SELECT queries on `EMPTAB`
3. **Database** - Read-only credentials, `FETCH FIRST 50 ROWS ONLY` enforced

### Video Demo

<video src="https://github.com/user-attachments/assets/608369e6-361d-4ea7-af63-d0bda34d8bac" controls width="100%" poster="images/Ai%20ChatBot%20Architecture%20-%20V1.png">
  Your browser does not support the video tag. <a href="images/Db2%20AI%20Assistant%20Demo.webm">Download or view the demo video directly</a>.
</video>

> **Note:** If inline video playback is not supported by your Markdown renderer, click [here to open or download the WebM video directly](images/Db2%20AI%20Assistant%20Demo.webm).

## Features

- **Natural Language Queries**: Ask questions like "Show me employee John" or "What's the mobile for ID 1001"
- **System Health Monitoring**: Real-time status of Node.js, NVIDIA API, Java DB2 API, JDBC, DDF, and Db2
- **Read-Only Access**: Only SELECT on `EMPTAB` (EMPID, EMPNAME, EMPMOB) permitted
- **Context Awareness**: Follow-up questions like "now" or "again" maintain conversation context
- **Security Guards**: Blocks credential requests, mutation attempts, and out-of-scope queries
- **Dual Frontend**: Modern React (Vite + TypeScript + Tailwind) and Streamlit Python UI

## Project Structure

```
Ai_chatbot/
├── server.js                 # Node.js Express API (port 3001)
├── package.json              # Node.js dependencies
├── .env                      # Environment variables
├── images/
│   ├── Ai ChatBot Architecture - V1.png    # Architecture diagram
│   └── Db2 AI Assistant Demo.html          # Interactive demo
├── frontend/
│   ├── app.py               # Streamlit UI (port 8501)
│   └── requirements.txt     # Python dependencies
├── React_frontend/          # React + Vite + TypeScript UI
│   ├── src/
│   │   ├── components/      # Chat UI components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # API utilities
│   │   └── main.tsx         # Entry point
│   └── package.json
└── db2jdbc/
    ├── Db2RestServer.java   # Java HTTP server (port 8080)
    ├── Db2Test.java         # Connection test utility
    └── db2jcc4.jar          # Db2 JDBC driver
```

## Prerequisites

- **Node.js** 18+
- **Java** 17+ (for Db2 JDBC driver)
- **Python** 3.9+ (for Streamlit frontend)
- **Db2 for z/OS** accessible via DDF (host:port/database)
- **NVIDIA API Key** for LLM integration

## Quick Start

### 1. Configure Environment

Create `.env` file in project root:

```env
# NVIDIA LLM (required for natural language responses)
NVIDIA_API_KEY=your_nvidia_api_key
NVIDIA_URL=https://integrate.api.nvidia.com/v1/chat/completions
NVIDIA_MODEL=openai/gpt-oss-20b

# Java DB2 API
JAVA_DB2_API=http://127.0.0.1:8080/query
JAVA_HEALTH_API=http://127.0.0.1:8080/health
JAVA_DB2_STATUS_API=http://127.0.0.1:8080/db2/status

# Db2 Connection (used by Java API)
DB2_URL=jdbc:db2://your-mainframe-host:5025/DALLAS9
DB2_USER=IBMUSER
DB2_PASSWORD=your_db2_password
DB2_SERVER=DALLAS9

# Node.js API
PORT=3001
```

### 2. Start Java DB2 API

```bash
cd db2jdbc
# Compile
javac -cp ".:db2jcc4.jar" Db2RestServer.java
# Run
java -cp ".:db2jcc4.jar" Db2RestServer
```

Server starts on `http://127.0.0.1:8080`

### 3. Start Node.js API

```bash
npm install
npm start
# or: node server.js
```

Server starts on `http://127.0.0.1:3001`

### 4. Start Frontend (choose one)

**React Frontend:**
```bash
cd React_frontend
npm install
npm run dev
```
Opens at `http://localhost:5173`

**Streamlit Frontend:**
```bash
cd frontend
pip install -r requirements.txt
streamlit run app.py
```
Opens at `http://localhost:8501`

## API Endpoints

### Node.js API (Port 3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat` | Main chat endpoint |
| GET | `/health` | Health check |
| GET | `/system-status` | Full system status |
| GET | `/access` | Available tables/columns |

**Chat Request:**
```json
{
  "message": "Show me employee John",
  "history": [
    {"role": "user", "content": "previous question"},
    {"role": "assistant", "content": "previous answer"}
  ]
}
```

**Chat Response:**
```json
{
  "success": true,
  "type": "DATA_QUERY",
  "answer": "Found 1 employee:\n\nEmployee ID: 1001\nName: JOHN DOE\nMobile: 555-0123",
  "data": [{"EMPID": "1001", "EMPNAME": "JOHN DOE", "EMPMOB": "555-0123"}],
  "query": {"operation": "SELECT", "table": "EMPTAB", "columns": ["EMPID", "EMPNAME", "EMPMOB"], "limit": 20}
}
```

### Java DB2 API (Port 8080)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic service health |
| GET | `/db2/status` | Db2/JDBC/DDF health check |
| POST | `/query` | Execute validated SELECT query |

## Supported Query Types

| Type | Examples |
|------|----------|
| **Greeting** | "Hi", "Hello" |
| **Goodbye** | "Bye", "See you" |
| **Data Query** | "Show employee John", "What's ID 1001 mobile?", "List all employees" |
| **System Status** | "System status", "Is Db2 connected?", "Health check" |
| **Access Info** | "What tables can I access?", "Show schema" |
| **Mainframe General** | "How does the mainframe work?", "Explain DDF" |

## Security Features

- **Input Classification**: Local + LLM-based intent detection
- **SQL Injection Prevention**: Parameterized queries, regex validation on both Node.js and Java layers
- **Mutation Blocking**: INSERT/UPDATE/DELETE/DROP/etc. rejected at both layers
- **Credential Protection**: Detects and blocks requests for passwords, API keys, connection strings
- **Row Limits**: Maximum 50 rows per query
- **Column Whitelist**: Only EMPID, EMPNAME, EMPMOB accessible

## Environment Variables

### Node.js (.env)
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Node.js server port |
| `NVIDIA_API_KEY` | - | **Required** NVIDIA API key |
| `NVIDIA_URL` | NVIDIA integrate endpoint | LLM API URL |
| `NVIDIA_MODEL` | openai/gpt-oss-20b | Model to use |
| `JAVA_DB2_API` | http://127.0.0.1:8080/query | Java query endpoint |
| `JAVA_HEALTH_API` | http://127.0.0.1:8080/health | Java health endpoint |
| `JAVA_DB2_STATUS_API` | http://127.0.0.1:8080/db2/status | Java Db2 status endpoint |
| `DB2_SERVER` | DALLAS9 | Db2 server name for display |

### Java (Environment)
| Variable | Default | Description |
|----------|---------|-------------|
| `JAVA_API_HOST` | 127.0.0.1 | Java server bind address |
| `JAVA_API_PORT` | 8080 | Java server port |
| `DB2_URL` | jdbc:db2://192.168.200.150:5025/DALLAS9 | JDBC connection URL |
| `DB2_USER` | IBMUSER | Db2 username |
| `DB2_PASSWORD` | - | **Required** Db2 password |

## Development

### Run Tests
```bash
# Test Java DB2 connection
cd db2jdbc
javac -cp ".:db2jcc4.jar" Db2Test.java
java -cp ".:db2jcc4.jar" Db2Test
```

### Build React for Production
```bash
cd React_frontend
npm run build
```

### Lint/Typecheck React
```bash
cd React_frontend
npm run lint
npm run typecheck
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "NVIDIA_API_KEY is not configured" | Add key to `.env` |
| "Java DB2 API is unreachable" | Ensure Java server running on port 8080 |
| "DB2_PASSWORD environment variable is not set" | Set `DB2_PASSWORD` in environment |
| "Db2 query failed" | Check DDF connectivity, credentials, table existence |
| CORS errors | Node.js allows all origins (`*`) by default |

## License

MIT
