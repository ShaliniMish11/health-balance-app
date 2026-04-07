import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "health_balance_logs_v1";
const STARTING_BALANCE = 1000;

const INDULGENCE_OPTIONS = [
  { value: "none", label: "None", cost: 0 },
  { value: "mild", label: "Mild", cost: 10 },
  { value: "moderate", label: "Moderate", cost: 15 },
  { value: "heavy", label: "Heavy", cost: 25 },
];

function getTodayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sortLogs(logs) {
  return [...logs].sort((a, b) => a.date.localeCompare(b.date));
}

function isGoodDay(log) {
  return Boolean(
    log.workout || log.stepsMet || log.stretchYogaCore || log.mentalReset
  );
}

function calculateConsistencyScore(previousLogs) {
  return previousLogs.slice(-7).filter(isGoodDay).length;
}

function calculatePenaltyLoad(previousLogs) {
  return previousLogs
    .slice(-3)
    .filter((log) => log.indulgenceLevel && log.indulgenceLevel !== "none").length;
}

function getIndulgenceCost(level) {
  return INDULGENCE_OPTIONS.find((item) => item.value === level)?.cost ?? 0;
}

function calculateDelta({
  balanceStart,
  workout,
  stepsMet,
  stretchYogaCore,
  mentalReset,
  indulgenceLevel,
  consistencyScore,
  penaltyLoad,
}) {
  const maxBoost = 0.3;

  const workoutBoost = Math.min(0.05 * consistencyScore, maxBoost);
  const stepsBoost = Math.min(0.03 * consistencyScore, maxBoost);
  const stretchBoost = Math.min(0.025 * consistencyScore, maxBoost);
  const mentalBoost = Math.min(0.02 * consistencyScore, maxBoost);

  const workoutPoints = workout ? 10 * (1 + workoutBoost) : 0;
  const stepsPoints = stepsMet ? 5 * (1 + stepsBoost) : 0;
  const stretchPoints = stretchYogaCore ? 4 * (1 + stretchBoost) : 0;
  const mentalPoints = mentalReset ? 3 * (1 + mentalBoost) : 0;

  const baseIndulgence = getIndulgenceCost(indulgenceLevel);
  const indulgenceMultiplier = Math.min(1 + 0.3 * penaltyLoad, 2);
  const indulgenceRaw = baseIndulgence * indulgenceMultiplier;
  const indulgenceCap = balanceStart * 0.07;
  const indulgenceCost = Math.min(indulgenceRaw, indulgenceCap);

  const decay = 1;

  const delta =
    workoutPoints +
    stepsPoints +
    stretchPoints +
    mentalPoints -
    indulgenceCost -
    decay;

  return {
    delta: Number(delta.toFixed(1)),
    workoutPoints: Number(workoutPoints.toFixed(1)),
    stepsPoints: Number(stepsPoints.toFixed(1)),
    stretchPoints: Number(stretchPoints.toFixed(1)),
    mentalPoints: Number(mentalPoints.toFixed(1)),
    indulgenceCost: Number(indulgenceCost.toFixed(1)),
    decay,
  };
}

function recalculateLogs(inputLogs) {
  const sorted = sortLogs(inputLogs);
  const enriched = [];
  let runningBalance = STARTING_BALANCE;

  for (const log of sorted) {
    const consistencyScore = calculateConsistencyScore(enriched);
    const penaltyLoad = calculatePenaltyLoad(enriched);
    const balanceStart = Number(runningBalance.toFixed(1));

    const calc = calculateDelta({
      balanceStart,
      workout: log.workout,
      stepsMet: log.stepsMet,
      stretchYogaCore: log.stretchYogaCore,
      mentalReset: log.mentalReset,
      indulgenceLevel: log.indulgenceLevel,
      consistencyScore,
      penaltyLoad,
    });

    const endingBalance = Number((balanceStart + calc.delta).toFixed(1));

    enriched.push({
      ...log,
      consistencyScore,
      penaltyLoad,
      balanceStart,
      delta: calc.delta,
      endingBalance,
      ...calc,
    });

    runningBalance = endingBalance;
  }

  return enriched;
}

function formatSigned(value) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function getTone(delta) {
  if (delta >= 12) return "Strong gain";
  if (delta > 0) return "Mild gain";
  if (delta === 0) return "Neutral";
  if (delta > -10) return "Moderate drop";
  return "Heavy drop";
}

export default function HealthBalance() {
  const [logs, setLogs] = useState([]);
  const [workout, setWorkout] = useState(false);
  const [stepsMet, setStepsMet] = useState(false);
  const [stretchYogaCore, setStretchYogaCore] = useState(false);
  const [mentalReset, setMentalReset] = useState(false);
  const [indulgenceLevel, setIndulgenceLevel] = useState("none");

  const today = getTodayISO();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setLogs(recalculateLogs(parsed));
      }
    } catch (e) {
      console.error("Failed to load logs", e);
    }
  }, []);

  useEffect(() => {
    const minimalLogs = logs.map(
      ({
        date,
        workout,
        stepsMet,
        stretchYogaCore,
        mentalReset,
        indulgenceLevel,
      }) => ({
        date,
        workout,
        stepsMet,
        stretchYogaCore,
        mentalReset,
        indulgenceLevel,
      })
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(minimalLogs));
  }, [logs]);

  useEffect(() => {
    const existing = logs.find((log) => log.date === today);
    if (existing) {
      setWorkout(existing.workout);
      setStepsMet(existing.stepsMet);
      setStretchYogaCore(existing.stretchYogaCore);
      setMentalReset(existing.mentalReset);
      setIndulgenceLevel(existing.indulgenceLevel);
    }
  }, [logs, today]);

  const latestLog = logs[logs.length - 1] || null;
  const currentBalance = latestLog?.endingBalance ?? STARTING_BALANCE;
  const consistencyToday = latestLog?.consistencyScore ?? 0;
  const penaltyToday = latestLog?.penaltyLoad ?? 0;

  const previousLogsForToday = logs.filter((log) => log.date < today);
  const previewConsistency = calculateConsistencyScore(previousLogsForToday);
  const previewPenalty = calculatePenaltyLoad(previousLogsForToday);

  const preview = calculateDelta({
    balanceStart: currentBalance,
    workout,
    stepsMet,
    stretchYogaCore,
    mentalReset,
    indulgenceLevel,
    consistencyScore: previewConsistency,
    penaltyLoad: previewPenalty,
  });

  const last7Delta = useMemo(() => {
    return Number(
      logs
        .slice(-7)
        .reduce((sum, log) => sum + (log.delta || 0), 0)
        .toFixed(1)
    );
  }, [logs]);

  function handleUpdateDay() {
    const baseLogs = logs
      .filter((log) => log.date !== today)
      .map(
        ({
          date,
          workout,
          stepsMet,
          stretchYogaCore,
          mentalReset,
          indulgenceLevel,
        }) => ({
          date,
          workout,
          stepsMet,
          stretchYogaCore,
          mentalReset,
          indulgenceLevel,
        })
      );

    const nextLogs = recalculateLogs([
      ...baseLogs,
      {
        date: today,
        workout,
        stepsMet,
        stretchYogaCore,
        mentalReset,
        indulgenceLevel,
      },
    ]);

    setLogs(nextLogs);
  }

  function handleReset() {
    localStorage.removeItem(STORAGE_KEY);
    setLogs([]);
    setWorkout(false);
    setStepsMet(false);
    setStretchYogaCore(false);
    setMentalReset(false);
    setIndulgenceLevel("none");
  }

  const cardStyle = {
    background: "#ffffff",
    border: "1px solid #e7e4dd",
    borderRadius: 24,
    padding: 20,
    boxSizing: "border-box",
  };

  const mutedCard = {
    background: "#ece9e2",
    borderRadius: 20,
    padding: 18,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f4f1",
        color: "#1f1f1f",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              letterSpacing: 3,
              fontSize: 14,
              textTransform: "uppercase",
              color: "#5f5b57",
              marginBottom: 12,
            }}
          >
            Health Balance
          </div>
          <div
            style={{
              fontSize: 84,
              lineHeight: 1,
              fontWeight: 300,
              marginBottom: 12,
            }}
          >
            {Math.round(currentBalance)}
          </div>
          <div
            style={{
              display: "inline-block",
              background: "#e9e4dc",
              padding: "8px 16px",
              borderRadius: 999,
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            {formatSigned(preview.delta)} today
          </div>
          <div style={{ color: "#6d6862", fontStyle: "italic" }}>
            {getTone(preview.delta)}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div style={mutedCard}>
            <div style={{ color: "#5f5b57", marginBottom: 8 }}>Consistency</div>
            <div style={{ fontSize: 38, fontWeight: 300 }}>
              {consistencyToday} / 7
            </div>
            <div style={{ color: "#5f5b57" }}>good days</div>
          </div>
          <div style={mutedCard}>
            <div style={{ color: "#5f5b57", marginBottom: 8 }}>Penalty load</div>
            <div style={{ fontSize: 38, fontWeight: 300 }}>
              {penaltyToday} / 3
            </div>
            <div style={{ color: "#5f5b57" }}>indulgence days</div>
          </div>
        </div>

        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div
            style={{
              textTransform: "uppercase",
              letterSpacing: 2,
              fontSize: 13,
              color: "#5f5b57",
              marginBottom: 18,
            }}
          >
            Log today
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Workout done (+10)</span>
              <input
                type="checkbox"
                checked={workout}
                onChange={(e) => setWorkout(e.target.checked)}
              />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Steps goal met (+5)</span>
              <input
                type="checkbox"
                checked={stepsMet}
                onChange={(e) => setStepsMet(e.target.checked)}
              />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Stretch / Yoga / Core (+4)</span>
              <input
                type="checkbox"
                checked={stretchYogaCore}
                onChange={(e) => setStretchYogaCore(e.target.checked)}
              />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Mental Reset (+3)</span>
              <input
                type="checkbox"
                checked={mentalReset}
                onChange={(e) => setMentalReset(e.target.checked)}
              />
            </label>
          </div>

          <div style={{ marginTop: 22 }}>
            <div
              style={{
                textTransform: "uppercase",
                letterSpacing: 2,
                fontSize: 13,
                color: "#5f5b57",
                marginBottom: 12,
              }}
            >
              Indulgence level
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {INDULGENCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setIndulgenceLevel(option.value)}
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border:
                      indulgenceLevel === option.value
                        ? "1px solid #111"
                        : "1px solid #d8d3cc",
                    background:
                      indulgenceLevel === option.value ? "#111" : "#fff",
                    color: indulgenceLevel === option.value ? "#fff" : "#111",
                    cursor: "pointer",
                  }}
                >
                  {option.label}
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    {option.cost === 0 ? "0" : `-${option.cost}`}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 22,
              background: "#f1ede5",
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Impact preview</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>Workout: {formatSigned(preview.workoutPoints)}</div>
              <div>Steps: {formatSigned(preview.stepsPoints)}</div>
              <div>Stretch/Core: {formatSigned(preview.stretchPoints)}</div>
              <div>Mental Reset: {formatSigned(preview.mentalPoints)}</div>
              <div>Indulgence: -{preview.indulgenceCost}</div>
              <div>Decay: -{preview.decay}</div>
            </div>
            <div style={{ marginTop: 12, fontWeight: 700 }}>
              Today’s delta: {formatSigned(preview.delta)}
            </div>
            <div style={{ marginTop: 8, color: "#5f5b57" }}>
              Last 7 days: {formatSigned(last7Delta)} HU
            </div>
          </div>

          <button
            onClick={handleUpdateDay}
            style={{
              marginTop: 18,
              width: "100%",
              padding: "14px 18px",
              borderRadius: 18,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Update Day
          </button>
        </div>

        <div style={{ ...cardStyle, marginBottom: 18 }}>
          <div
            style={{
              textTransform: "uppercase",
              letterSpacing: 2,
              fontSize: 13,
              color: "#5f5b57",
              marginBottom: 14,
            }}
          >
            Recent history
          </div>

          {logs.length === 0 ? (
            <div style={{ color: "#6d6862" }}>No entries yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {[...logs].reverse().slice(0, 7).map((log) => (
                <div
                  key={log.date}
                  style={{
                    border: "1px solid #ece7df",
                    borderRadius: 16,
                    padding: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{log.date}</div>
                    <div style={{ color: "#6d6862", fontSize: 14 }}>
                      {log.workout ? "Workout" : "No workout"} •{" "}
                      {log.stepsMet ? "Steps met" : "Steps missed"} •{" "}
                      {log.stretchYogaCore ? "Stretch/Core" : "No stretch"} •{" "}
                      {log.mentalReset ? "Mental reset" : "No reset"} •{" "}
                      {log.indulgenceLevel}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>{formatSigned(log.delta)}</div>
                    <div style={{ color: "#6d6862", fontSize: 14 }}>
                      {Math.round(log.endingBalance)} HU
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleReset}
          style={{
            width: "100%",
            padding: "14px 18px",
            borderRadius: 18,
            border: "1px solid #d9d3cb",
            background: "transparent",
            color: "#111",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reset all data
        </button>
      </div>
    </div>
  );
}