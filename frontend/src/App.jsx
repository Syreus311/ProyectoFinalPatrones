import React, { useState, useRef } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const SYNC_DELAY_SECONDS = 10;

function SyncBadge({ status }) {
  const styles = {
    waiting: { background: "#f4f6f8", color: "#667085", border: "1px solid #d0d5dd" },
    pending: { background: "#fffaeb", color: "#b54708", border: "1px solid #f9c96a" },
    synced:  { background: "#ecfdf3", color: "#027a48", border: "1px solid #6ce9a6" },
  };
  const labels = {
    waiting: "Sin datos",
    pending: "Pendiente en NoSQL",
    synced:  "Sincronizado en NoSQL",
  };
  const s = styles[status] || styles.waiting;
  return (
    <span style={{
      display: "inline-block",
      padding: "4px 12px",
      borderRadius: "999px",
      fontWeight: "bold",
      fontSize: "13px",
      ...s
    }}>
      {labels[status] || "Sin datos"}
    </span>
  );
}

function CountdownBar({ seconds, total }) {
  const pct = Math.max(0, Math.min(100, ((total - seconds) / total) * 100));
  return (
    <div style={{ margin: "10px 0" }}>
      <div style={{ fontSize: "12px", color: "#667085", marginBottom: 4 }}>
        Sincronizacion esperada en ~{seconds}s
      </div>
      <div style={{ background: "#f2f4f7", borderRadius: 99, height: 8, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          background: "#155eef",
          borderRadius: 99,
          transition: "width 1s linear"
        }} />
      </div>
    </div>
  );
}

function App() {
  const [form, setForm] = useState({
    sourceAccount: "CTA-001",
    destinationAccount: "CTA-002",
    amount: 150000,
    currency: "COP"
  });

  const [createdTransfer, setCreatedTransfer] = useState(null);
  const [sqlResult, setSqlResult] = useState(null);
  const [mongoResult, setMongoResult] = useState(null);
  const [syncStatus, setSyncStatus] = useState("waiting");
  const [accountQuery, setAccountQuery] = useState("CTA-001");
  const [accountTransfers, setAccountTransfers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const trackingRef = useRef(false);

  function addLog(message) {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${message}`, ...prev]);
  }

  function updateField(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function createTransfer() {
    setLoading(true);
    setCreatedTransfer(null);
    setSqlResult(null);
    setMongoResult(null);
    setSyncStatus("waiting");
    setAccountTransfers([]);
    setCountdown(null);
    trackingRef.current = false;

    try {
      addLog("Enviando comando de escritura al Write Service via Kong...");

      const response = await fetch(`${API_BASE_URL}/api/commands/transfers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Error creando transferencia");

      setCreatedTransfer(result.data);
      addLog("Transferencia guardada en PostgreSQL.");
      addLog("Evento insertado en tabla outbox_events.");
      addLog(`El Sync Worker la sincronizara a MongoDB en ~${SYNC_DELAY_SECONDS} segundos.`);
      addLog("Consultando SQL para confirmar escritura inmediata...");

      await checkInSql(result.data.id);

      setSyncStatus("pending");
      await checkInMongo(result.data.id, false);

      startAutoTracking(result.data.id);
    } catch (err) {
      addLog(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function checkInSql(transferId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/commands/debug/sql/transfers/${transferId}`);
      const result = await response.json();
      setSqlResult(result);
      if (response.ok) {
        addLog("Confirmado: la transferencia SI existe en PostgreSQL.");
      } else {
        addLog("No encontrada en PostgreSQL.");
      }
    } catch (err) {
      addLog(`Error consultando SQL: ${err.message}`);
    }
  }

  async function checkInMongo(transferId, log = true) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/queries/transfers/${transferId}`);
      const result = await response.json();
      setMongoResult(result);

      if (response.ok) {
        setSyncStatus("synced");
        if (log) addLog("La transferencia YA aparece en MongoDB. Consistencia eventual completada.");
        return true;
      } else {
        if (log) addLog("Todavia NO aparece en MongoDB. Gap de consistencia eventual activo.");
        return false;
      }
    } catch (err) {
      if (log) addLog(`Error consultando MongoDB: ${err.message}`);
      return false;
    }
  }

  async function startAutoTracking(transferId) {
    trackingRef.current = true;
    setTracking(true);
    addLog(`Iniciando seguimiento automatico durante ${SYNC_DELAY_SECONDS + 8} segundos...`);

    const totalSeconds = SYNC_DELAY_SECONDS + 8;
    let elapsed = 0;

    setCountdown(SYNC_DELAY_SECONDS);

    const interval = setInterval(async () => {
      if (!trackingRef.current) {
        clearInterval(interval);
        setTracking(false);
        setCountdown(null);
        return;
      }

      elapsed += 2;
      setCountdown(Math.max(0, SYNC_DELAY_SECONDS - elapsed));
      addLog(`Seguimiento: segundo ${elapsed} — consultando MongoDB...`);

      const found = await checkInMongo(transferId, true);

      if (found) {
        clearInterval(interval);
        setTracking(false);
        setCountdown(null);
        trackingRef.current = false;
        addLog(`Sincronizacion completada en ~${elapsed} segundos.`);
        return;
      }

      if (elapsed >= totalSeconds) {
        clearInterval(interval);
        setTracking(false);
        setCountdown(null);
        trackingRef.current = false;
        addLog("Tiempo de seguimiento agotado. Verifica los logs del sync-worker.");
      }
    }, 2000);
  }

  function stopTracking() {
    trackingRef.current = false;
    setTracking(false);
    setCountdown(null);
  }

  async function queryByAccount() {
    try {
      addLog(`Consultando transferencias de la cuenta ${accountQuery} en MongoDB (NoSQL)...`);
      const response = await fetch(
        `${API_BASE_URL}/api/queries/transfers?account=${encodeURIComponent(accountQuery)}`
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Error");
      setAccountTransfers(result.data);
      addLog(`Consulta NoSQL: ${result.total} resultado(s) encontrados.`);
    } catch (err) {
      addLog(`Error: ${err.message}`);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Banco A — CQRS Demo</p>
          <h1>Sistema de transferencias con consistencia eventual</h1>
          <p>
            Escrituras en <strong>PostgreSQL</strong> (ACID) · Lecturas en <strong>MongoDB</strong> (NoSQL) ·
            API Gateway <strong>Kong</strong> · Sync Worker con delay de <strong>{SYNC_DELAY_SECONDS}s</strong>
          </p>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>1. Crear transferencia</h2>
          <p style={{ color: "#667085", fontSize: 14 }}>
            La escritura va a PostgreSQL via Kong y el Write Service. MongoDB no se actualiza inmediatamente.
          </p>

          <label>
            Cuenta origen
            <input name="sourceAccount" value={form.sourceAccount} onChange={updateField} />
          </label>
          <label>
            Cuenta destino
            <input name="destinationAccount" value={form.destinationAccount} onChange={updateField} />
          </label>
          <label>
            Monto
            <input name="amount" type="number" value={form.amount} onChange={updateField} />
          </label>
          <label>
            Moneda
            <input name="currency" value={form.currency} onChange={updateField} />
          </label>

          <button onClick={createTransfer} disabled={loading || tracking}>
            {loading ? "Creando..." : "Crear transferencia"}
          </button>

          {createdTransfer && (
            <div className="result success">
              <strong>Transferencia creada:</strong>
              <pre style={{ fontSize: 12 }}>{JSON.stringify(createdTransfer, null, 2)}</pre>
            </div>
          )}
        </article>

        <article className="card">
          <h2>2. Consistencia eventual</h2>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#667085", marginBottom: 8 }}>Estado de sincronizacion NoSQL:</div>
            <SyncBadge status={syncStatus} />
          </div>

          {syncStatus === "pending" && countdown !== null && (
            <CountdownBar seconds={countdown} total={SYNC_DELAY_SECONDS} />
          )}

          <p style={{ fontSize: 13, color: "#667085" }}>
            Al crear, la transferencia existe solo en SQL. Tras ~{SYNC_DELAY_SECONDS}s el
            Sync Worker la propaga a MongoDB.
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => createdTransfer && checkInSql(createdTransfer.id)}
              disabled={!createdTransfer}
            >
              Consultar SQL
            </button>
            <button
              onClick={() => createdTransfer && checkInMongo(createdTransfer.id)}
              disabled={!createdTransfer}
            >
              Consultar NoSQL
            </button>
            {tracking && (
              <button onClick={stopTracking} style={{ background: "#d92d20" }}>
                Detener seguimiento
              </button>
            )}
          </div>

          <div className="two-columns" style={{ marginTop: 16 }}>
            <div>
              <h3 style={{ fontSize: 13, color: "#027a48" }}>PostgreSQL (SQL)</h3>
              <pre>{sqlResult ? JSON.stringify(sqlResult.data || sqlResult, null, 2) : "Sin consulta aun"}</pre>
            </div>
            <div>
              <h3 style={{ fontSize: 13, color: syncStatus === "synced" ? "#027a48" : "#b54708" }}>
                MongoDB (NoSQL)
              </h3>
              <pre>{mongoResult ? JSON.stringify(mongoResult.data || mongoResult, null, 2) : "Sin consulta aun"}</pre>
            </div>
          </div>
        </article>

        <article className="card full">
          <h2>3. Consulta optimizada por cuenta (lectura NoSQL)</h2>
          <p style={{ fontSize: 13, color: "#667085" }}>
            Esta consulta va directamente a MongoDB via Kong y el Read Service. Alta velocidad, baja latencia.
          </p>
          <div className="inline-form">
            <input
              value={accountQuery}
              onChange={(e) => setAccountQuery(e.target.value)}
              placeholder="CTA-001"
            />
            <button onClick={queryByAccount}>Consultar en NoSQL</button>
          </div>
          <pre style={{ marginTop: 12 }}>
            {accountTransfers.length > 0
              ? JSON.stringify(accountTransfers, null, 2)
              : "No hay resultados cargados."}
          </pre>
        </article>

        <article className="card full">
          <h2>Logs de demostracion</h2>
          <div className="logs">
            {logs.length === 0 && (
              <div style={{ color: "#667085" }}>Los logs apareceran aqui al crear una transferencia.</div>
            )}
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
