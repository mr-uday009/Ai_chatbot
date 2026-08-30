import streamlit as st
import requests
from datetime import datetime

# -----------------------------
# Configuration
# -----------------------------
NODE_API = "http://127.0.0.1:3001"
CHAT_URL = f"{NODE_API}/chat"
HEALTH_URL = f"{NODE_API}/health"

st.set_page_config(
    page_title="AI Chatbot for Mainframe Data",
    page_icon="🖥️",
    layout="wide",
)

# -----------------------------
# Styling
# -----------------------------
st.markdown("""
<style>
    .main-title {
        font-size: 30px;
        font-weight: 700;
        margin-bottom: 0;
    }
    .subtitle {
        color: #6b7280;
        margin-bottom: 20px;
    }
    .status-card {
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 12px;
        background: #fafafa;
        margin-bottom: 8px;
    }
    .status-ok {
        color: #16803c;
        font-weight: 600;
    }
    .status-bad {
        color: #b42318;
        font-weight: 600;
    }
    .small-muted {
        color: #6b7280;
        font-size: 12px;
    }
</style>
""", unsafe_allow_html=True)

# -----------------------------
# Session state
# -----------------------------
if "messages" not in st.session_state:
    st.session_state.messages = []

if "last_status" not in st.session_state:
    st.session_state.last_status = None

# -----------------------------
# Backend helpers
# -----------------------------
def check_backend():
    try:
        r = requests.get(HEALTH_URL, timeout=5)
        r.raise_for_status()
        data = r.json()

        return {
            "Node.js": "Connected",
            "NVIDIA": "Available",
            "Java DB2 API": "Connected",
            "Db2": "Available",
            "Db2 Server": data.get("db2Server", "DALLAS9"),
        }
    except Exception as e:
        return {
            "Node.js": "Unavailable",
            "NVIDIA": "Unknown",
            "Java DB2 API": "Unknown",
            "Db2": "Unknown",
            "Db2 Server": "Unknown",
            "error": str(e),
        }


def ask_chatbot(question):
    # Pass past message history so short context prompts (e.g., "now") maintain context
    payload = {
        "message": question,
        "history": [
            {"role": m["role"], "content": m["content"]}
            for m in st.session_state.messages[-6:]  # Send last 6 messages
        ]
    }
    response = requests.post(
        CHAT_URL,
        json=payload,
        timeout=120,
    )
    response.raise_for_status()
    return response.json()
# -----------------------------
# Header
# -----------------------------
st.markdown(
    '<div class="main-title">🖥️ AI Chatbot for Mainframe Data</div>',
    unsafe_allow_html=True,
)
st.markdown(
    '<div class="subtitle">Natural-language access to read-only Db2 for z/OS data</div>',
    unsafe_allow_html=True,
)

# -----------------------------
# Sidebar: system status
# -----------------------------
with st.sidebar:
    st.header("System Status")

    if st.button("🔄 Check Connection", use_container_width=True):
        st.session_state.last_status = check_backend()

    if st.session_state.last_status is None:
        st.session_state.last_status = check_backend()

    status = st.session_state.last_status

    services = [
        ("Node.js", status.get("Node.js")),
        ("NVIDIA API", status.get("NVIDIA")),
        ("Java DB2 API", status.get("Java DB2 API")),
        ("Db2", status.get("Db2")),
    ]

    for name, value in services:
        ok = value in ("Connected", "Available")
        css = "status-ok" if ok else "status-bad"
        icon = "●" if ok else "●"
        st.markdown(
            f'<div class="status-card">{icon} <b>{name}</b><br>'
            f'<span class="{css}">{value}</span></div>',
            unsafe_allow_html=True,
        )

    st.markdown(
        f"**Db2 Server:** `{status.get('Db2 Server', 'Unknown')}`"
    )

    st.markdown("---")
    st.caption("Security")
    st.write("🔒 SELECT-only database access")
    st.write("🔒 LLM has no direct Db2 access")
    st.write("🔒 Java API validates queries")

    if st.button("🗑️ Clear Chat", use_container_width=True):
        st.session_state.messages = []
        st.rerun()

# -----------------------------
# Chat history
# -----------------------------
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

        if message.get("data"):
            st.dataframe(
                message["data"],
                use_container_width=True,
                hide_index=True,
            )

# -----------------------------
# Chat input
# -----------------------------
question = st.chat_input(
    "Ask about your mainframe data..."
)

if question:
    st.session_state.messages.append({
        "role": "user",
        "content": question,
    })

    with st.chat_message("user"):
        st.markdown(question)

    with st.chat_message("assistant"):
        with st.spinner("Querying mainframe data..."):
            try:
                result = ask_chatbot(question)

                if not result.get("success"):
                    raise RuntimeError(
                        result.get("error", "Chatbot request failed")
                    )

                # This is the natural-language answer generated by NVIDIA.
                answer = result.get(
                    "answer",
                    "I could not generate an answer."
                )

                st.markdown(answer)

                # JSON data is used internally only to render a table.
                rows = result.get("data", [])

                if rows:
                    st.dataframe(
                        rows,
                        use_container_width=True,
                        hide_index=True,
                    )

                    st.caption(
                        f"{len(rows)} row(s) returned from Db2."
                    )

                st.session_state.messages.append({
                    "role": "assistant",
                    "content": answer,
                    "data": rows,
                })

            except requests.exceptions.RequestException as e:
                error = (
                    "I couldn't reach the chatbot backend. "
                    "Please check that the Node.js service is running "
                    f"on {NODE_API}."
                )

                st.error(error)
                st.session_state.messages.append({
                    "role": "assistant",
                    "content": error,
                })

            except Exception as e:
                error = f"I couldn't complete the request: {e}"
                st.error(error)
                st.session_state.messages.append({
                    "role": "assistant",
                    "content": error,
                })
