import React, { useEffect, useState, useRef } from "react";
import { WS_URL, API_BASE } from "./apiConfig";

export default function App() {
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem("rcv_user");
    return saved ? "dashboard" : "login";
  });

  const [language, setLanguage] = useState("javascript");

  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("rcv_user");
    return saved ? JSON.parse(saved) : null;
  });

  // Start editor as blank
  const [code, setCode] = useState("");

  const [status, setStatus] = useState("Not connected");
  const [diag, setDiag] = useState("— waiting —");

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const [wsConnected, setWsConnected] = useState(false);

  const editorRef = useRef(null);
  const lineNumbersRef = useRef(null);

  // remembers language at send time
  const pendingLanguageRef = useRef("javascript");

  // history: array of { id, timestamp, code, resultText, language }
  const [history, setHistory] = useState([]);

  // snapshot of the code that was sent for the *current* validation
  const pendingCodeRef = useRef("");

  // selected history items (for selective clear)
  const [selectedIds, setSelectedIds] = useState([]);

  // ---------- helpers ----------

  function historyKey(email) {
    return `rcv_history_${email}`;
  }

  // ---------- load history for logged in user ----------

  useEffect(() => {
    if (!user || mode !== "dashboard") return;
    const key = historyKey(user.email);
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const normalized = parsed.map((item) =>
          item.language ? item : { ...item, language: "javascript" } // old entries default to JS
        );
        setHistory(normalized);
      } catch {
        setHistory([]);
      }
    } else {
      setHistory([]);
    }
    setSelectedIds([]);
  }, [user, mode]);

  function addToHistoryEntry(codeText, resultText, lang) {
    if (!user) return; // only store when logged in
    const entry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      code: codeText,
      resultText,
      language: lang || "javascript",
    };

    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 50); // keep max 50
      const key = historyKey(user.email);
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }

  function clearHistory() {
    if (!user) return;
    const key = historyKey(user.email);
    localStorage.removeItem(key);
    setHistory([]);
    setSelectedIds([]);
  }

  function clearSelectedHistory() {
    if (!user || selectedIds.length === 0) return;
    const key = historyKey(user.email);
    setHistory((prev) => {
      const next = prev.filter((item) => !selectedIds.includes(item.id));
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
    setSelectedIds([]);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // ---------- WebSocket + auto-reconnect ----------

  function openWebSocket() {
    // if already open or connecting, don't create a second socket
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setStatus("Connecting…");

    ws.onopen = () => {
      setWsConnected(true);
      setStatus("Connected");
    };

    ws.onclose = () => {
      setWsConnected(false);
      setStatus("Disconnected");

      // 🔁 Try to reconnect after a short delay *only* while on dashboard
      reconnectTimerRef.current = setTimeout(() => {
        if (mode === "dashboard") {
          openWebSocket();
        }
      }, 2000);
    };

    ws.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        console.log("WS message from server:", payload);

        // Always try to interpret the message as validation result
        renderDiagnostics(payload);
      } catch (e) {
        console.error("WS parse error:", e, ev.data);
        setDiag("Invalid JSON from server");
      }
    };
  }

  useEffect(() => {
    if (mode !== "dashboard") return;

    // open socket when we enter dashboard
    openWebSocket();

    return () => {
      // cleanup when leaving dashboard
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      setStatus("Not connected");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function renderDiagnostics(payload) {
    // Try to find "result" in different possible shapes
    let r = payload.result;

    // Some backends wrap data in "body"
    if (!r && payload.body) {
      try {
        const inner =
          typeof payload.body === "string"
            ? JSON.parse(payload.body)
            : payload.body;
        if (inner && inner.result) {
          r = inner.result;
        }
      } catch {
        // ignore JSON parse errors here
      }
    }

    // If still nothing, just show a generic message
    if (!r) {
      setDiag("No validation result from server.");
      return;
    }

    let resultText = "";

    if (r.ok) {
      resultText = "✔ No syntax errors";
    } else if (Array.isArray(r.errors) && r.errors.length) {
      resultText = r.errors
        .map(
          (e) =>
            `Line ${e.loc?.line ?? "?"}:${e.loc?.column ?? "?"} — ${e.message}`
        )
        .join("\n");
    } else {
      resultText = r.message || "Unknown error";
    }

    setDiag(resultText);
    // ✅ history uses the language at send-time, not the current dropdown
    addToHistoryEntry(
      pendingCodeRef.current,
      resultText,
      pendingLanguageRef.current
    );
  }

  async function handleSignupOrLogin(kind) {
    try {
      setAuthError("");
      const res = await fetch(`${API_BASE}/auth/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.message || "Internal Server Error");
        return;
      }

      const userObj = { email: data.email || authForm.email };
      setUser(userObj);
      localStorage.setItem("rcv_user", JSON.stringify(userObj));
      setMode("dashboard");
    } catch (err) {
      console.error(`${kind} error`, err);
      setAuthError("Network error");
    }
  }

  function logout() {
    if (user) {
      const key = historyKey(user.email);
      // keep their history in localStorage even after logout
    }
    setUser(null);
    localStorage.removeItem("rcv_user");
    setMode("login");
    setStatus("Not connected");
    setDiag("— waiting —");
    setHistory([]);
    setSelectedIds([]);
  }

  function handleEditorScroll(e) {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.target.scrollTop;
    }
  }

  function sendCode() {
    // If socket is not open, try to reconnect instead of just failing
    if (
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      openWebSocket();
      alert(
        "WebSocket was disconnected. Reconnecting to validator… please click Validate again in a moment."
      );
      return;
    }

    const codeSnapshot = code;
    const langSnapshot = language; // snapshot at click time

    pendingCodeRef.current = codeSnapshot;
    pendingLanguageRef.current = langSnapshot;

    const msg = {
      action: "validate",
      language: langSnapshot,
      code: codeSnapshot,
      requestId: Date.now().toString(),
    };
    wsRef.current.send(JSON.stringify(msg));
  }

  function startNewSnippet() {
    setCode("");
    setDiag("— waiting —");
  }

  // ---------- UI for signup / login / dashboard ----------

  if (mode === "signup") {
    return (
      <div className="app-shell">
        <div className="card auth-card">
          <h1 className="app-title">Realtime Code Validator</h1>
          <h2 className="screen-title">Create Account</h2>
          <AuthForm
            title="Sign up"
            authForm={authForm}
            setAuthForm={setAuthForm}
            error={authError}
            onSubmit={() => handleSignupOrLogin("signup")}
            switchText="Already have an account?"
            onSwitch={() => {
              setAuthError("");
              setMode("login");
            }}
          />
        </div>
      </div>
    );
  }

  if (mode === "login") {
    return (
      <div className="app-shell">
        <div className="card auth-card">
          <h1 className="app-title">Realtime Code Validator</h1>

          <AuthForm
            title="Login"
            authForm={authForm}
            setAuthForm={setAuthForm}
            error={authError}
            onSubmit={() => handleSignupOrLogin("login")}
            switchText="New here?"
            onSwitch={() => {
              setAuthError("");
              setMode("signup");
            }}
          />
        </div>
      </div>
    );
  }

  // ---------- Dashboard ----------
  return (
    <div className="app-shell">
      <div className="card dashboard-card">
        <header className="dashboard-header">
          <div>
            <h1 className="app-title">Realtime Code Validator</h1>
            <p className="subtitle">Serverless, real-time syntax checking</p>
          </div>
          <div className="user-badge">
            <span className="user-email">{user ? user.email : "Guest"}</span>
            {/* status pill removed from UI but logic still works */}
            <button className="btn-secondary" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        <div className="dashboard-layout">
          {/* Left: editor & result */}
          <section className="editor-panel">
            <div className="editor-header-row">
              <div className="editor-header-left">
                <label className="field-label">Code</label>
                <select
                  className="language-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                </select>
              </div>

              <button
                type="button"
                className="btn-secondary editor-new-btn"
                onClick={startNewSnippet}
              >
                New snippet
              </button>
            </div>

            <div className="editor-wrapper">
              <div className="line-numbers" ref={lineNumbersRef}>
                {code.split("\n").map((_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>

              <textarea
                ref={editorRef}
                className="code-editor"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onScroll={handleEditorScroll}
                spellCheck="false"
              />
            </div>

            <div className="editor-actions">
              <button className="btn-primary" onClick={sendCode}>
                Validate now
              </button>
              <span className="hint">
                Tip: introduce a syntax error to see detailed diagnostics.
              </span>
            </div>

            <div className="diagnostics">
              <h3>Diagnostics</h3>
              <pre className="diagnostics-output">{diag}</pre>
            </div>
          </section>

          {/* Right: history */}
          <aside className="history-panel">
            <div className="history-header">
              <h3>History</h3>
              <div className="history-actions">
                {selectedIds.length > 0 && (
                  <button
                    className="btn-link"
                    type="button"
                    onClick={clearSelectedHistory}
                  >
                    Delete selected
                  </button>
                )}
                {history.length > 0 && (
                  <button
                    className="btn-link"
                    type="button"
                    onClick={clearHistory}
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {selectedIds.length > 0 && (
              <p className="history-select-info">
                {selectedIds.length} selected
              </p>
            )}

            {history.length === 0 ? (
              <p className="history-empty">
                No previous validations yet. Run <b>Validate now</b> to start
                building your history.
              </p>
            ) : (
              <ul className="history-list">
                {history.map((item) => (
                  <li
                    key={item.id}
                    className="history-item"
                    onClick={() => {
                      setLanguage(item.language || "javascript");
                      setCode(item.code);
                      setDiag(item.resultText);
                    }}
                  >
                    <div className="history-item-top">
                      <div className="history-left">
                        <input
                          type="checkbox"
                          className="history-checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelect(item.id);
                          }}
                        />
                        <span className="history-title">
                          {item.code.split("\n")[0] || "(empty snippet)"}
                        </span>
                        <span
                          className={
                            "history-lang-badge " +
                            (item.language === "python"
                              ? "history-lang-badge--py"
                              : "history-lang-badge--js")
                          }
                        >
                          {item.language === "python" ? "PY" : "JS"}
                        </span>
                      </div>

                      <span className="history-time">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="history-result-preview">
                      {item.resultText.substring(0, 80)}
                      {item.resultText.length > 80 ? " …" : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function AuthForm({
  title,
  authForm,
  setAuthForm,
  error,
  onSubmit,
  switchText,
  onSwitch,
}) {
  return (
    <div>
      <h3 className="section-title">{title}</h3>
      <div className="form-field">
        <label className="field-label">Email</label>
        <input
          type="email"
          className="text-input"
          value={authForm.email}
          onChange={(e) =>
            setAuthForm({ ...authForm, email: e.target.value })
          }
        />
      </div>
      <div className="form-field">
        <label className="field-label">Password</label>
        <input
          type="password"
          className="text-input"
          value={authForm.password}
          onChange={(e) =>
            setAuthForm({ ...authForm, password: e.target.value })
          }
        />
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="auth-actions">
        <button className="btn-primary" onClick={onSubmit}>
          {title}
        </button>
        <button className="btn-secondary" type="button" onClick={onSwitch}>
          {switchText}
        </button>
      </div>
    </div>
  );
}
