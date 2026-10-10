/* =========================================================
   STRATEGY ENGINE & VISUALIZATION
========================================================= */

import { getMyTeam, STRATEGY_API_URL } from "./config.js";
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";

export const COMPONENT_LABELS = {
    pace: "Race Pace",
    tyre_management: "Tyre Management",
    weather_adaptation: "Weather Adaptation",
    aero: "Aero Suitability",
    straight_line: "Straight-Line Speed",
    cornering: "Cornering",
    energy: "Energy Efficiency",
    overtaking: "Overtaking"
};

export function showLoading(track) {
    const resultEl = document.getElementById("result");
    if (!resultEl) return;
    resultEl.innerHTML = `
        <div class="loading-wrap">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
            <p>Analyzing ${escapeHtml(track)} strategy</p>
        </div>
    `;
}

export function renderComponentBars(strategy) {
    const components =
        strategy.components ||
        strategy.performance_components ||
        strategy.performanceComponents ||
        strategy.scores ||
        {};

    const aliases = {
        pace: ["pace", "race_pace", "racePace"],
        tyre_management: [
            "tyre_management", "tire_management",
            "tyreManagement", "tireManagement",
            "tyre_score", "tire_score"
        ],
        weather_adaptation: [
            "weather_adaptation", "weatherAdaptation", "weather_score"
        ],
        aero: ["aero", "aero_suitability", "aeroSuitability", "aero_score"],
        straight_line: [
            "straight_line", "straight_line_speed",
            "straightLineSpeed", "straight_line_score"
        ],
        cornering: ["cornering", "cornering_score"],
        energy: [
            "energy", "energy_efficiency",
            "energyEfficiency", "energy_score"
        ],
        overtaking: ["overtaking", "overtaking_score"]
    };

    function numeric(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function clamp(value) {
        return Math.max(0, Math.min(100, Number(value) || 0));
    }

    function readComponent(key) {
        const names = aliases[key] || [key];
        for (const name of names) {
            if (Object.prototype.hasOwnProperty.call(components, name)) {
                const raw = numeric(components[name]);
                if (raw !== null) {
                    return raw <= 1 ? raw * 100 : raw;
                }
            }
        }
        return null;
    }

    function setupLevel(name, fallback = 75) {
        const values = {
            "Very Low": 25,
            "Low": 50,
            "Medium": 75,
            "High": 100,
            "Very High": 100
        };
        return values[state.lastStrategyInputs[name]] ?? fallback;
    }

    function deriveFallback(key) {
        const carPace = numeric(strategy.car_pace);
        const driverPace = numeric(strategy.driver_pace);
        const strategyFit = numeric(strategy.strategy_fit);
        const stops = numeric(strategy.stops) ?? 1;
        const compounds = Array.isArray(strategy.compounds)
            ? strategy.compounds.map(v => String(v).toLowerCase())
            : [];
        const weather = String(state.lastStrategyInputs.weather || "Dry").toLowerCase();

        const metrics = strategy.strategy_metrics || strategy.strategyMetrics || {};
        const tyreLife = numeric(metrics.tyre_life);
        const weatherPenalty = numeric(metrics.weather_penalty);
        const pitPenalty = numeric(metrics.pit_stop_penalty);
        const riskPenalty = numeric(metrics.risk_penalty);

        if (key === "pace") {
            const tyrePace = {
                soft: 100,
                medium: 94,
                hard: 88,
                intermediate: 72,
                "full wet": 58
            };

            if (compounds.length) {
                const values = compounds.map(c => tyrePace[c] ?? 88);
                const tyreAverage = values.reduce((a, b) => a + b, 0) / values.length;
                const driverFactor = driverPace !== null ? clamp(driverPace * 100) : 75;
                const carFactor = carPace !== null ? clamp(carPace * 100) : 75;
                return clamp(tyreAverage * 0.55 + carFactor * 0.25 + driverFactor * 0.20);
            }
        }

        if (key === "tyre_management") {
            if (tyreLife !== null) {
                return clamp(tyreLife * 1.55 - stops * 2);
            }
            if (compounds.length) {
                const life = { soft: 18, medium: 28, hard: 38, intermediate: 24, "full wet": 20 };
                const averageLife = compounds.reduce((sum, c) => sum + (life[c] ?? 24), 0) / compounds.length;
                return clamp((averageLife / 40) * 100 - stops * 3);
            }
        }

        if (key === "weather_adaptation") {
            if (weatherPenalty !== null) {
                return clamp(100 - weatherPenalty * 10);
            }
            if (compounds.length) {
                const wetTyres = compounds.filter(c =>
                    c.includes("intermediate") || c.includes("wet")
                ).length;
                if (weather === "wet") return clamp(wetTyres ? 92 + wetTyres * 4 : 35);
                if (weather === "mixed") return clamp(wetTyres ? 90 : 78);
                return clamp(wetTyres ? 55 : 96);
            }
        }

        const setupAero = setupLevel("downforce");
        const setupStraight = setupLevel("straight_line_speed");
        const setupCornering = setupLevel("cornering");
        const setupEnergy = setupLevel("energy_efficiency");
        const strategyAdjustment = clamp(100 - (pitPenalty || 0) - (riskPenalty || 0)) / 100;

        if (key === "aero") return clamp(setupAero * (0.96 + strategyAdjustment * 0.04));
        if (key === "straight_line") return clamp(setupStraight * (0.97 + strategyAdjustment * 0.03));
        if (key === "cornering") return clamp(setupCornering * (0.97 + strategyAdjustment * 0.03));
        if (key === "energy") return clamp(setupEnergy * (0.98 + strategyAdjustment * 0.02));

        if (key === "overtaking") {
            let value = 62;
            if (strategy.strategy_type === "recovery") value += 8;
            if (strategy.strategy_type === "attack") value += 14;
            if (strategy.strategy_type === "conservative") value -= 5;
            if (stops >= 2) value += 4;
            if (strategyFit !== null) value += (strategyFit - 0.70) * 18;
            if (riskPenalty !== null) value -= riskPenalty * 1.5;
            return clamp(value);
        }

        return null;
    }

    return Object.entries(COMPONENT_LABELS)
        .map(([key, label]) => {
            let value = readComponent(key);
            let derived = false;
            if (value === null) {
                value = deriveFallback(key);
                derived = value !== null;
            }
            const available = value !== null;
            value = available ? clamp(value) : 0;

            return `
                <div class="score-row">
                    <div class="score-row-name">${label}</div>
                    <div class="score-track">
                        <div class="score-fill" style="width:${value}%"></div>
                    </div>
                    <div class="score-value" title="${derived ? "Derived from live race-strategy output" : "Strategy engine component"}">
                        ${available ? value.toFixed(1) : "--"}
                    </div>
                </div>
            `;
        })
        .join("");
}

export function selectStrategy(index) {
    if (!state.currentStrategies[index]) return;
    state.selectedStrategyIndex = index;
    renderStrategyResults();
}

export function renderAIEngineerPanel(recommended) {
    if (!state.currentAIExplanation) return "";

    const explanation = state.currentAIExplanation.explanation || "";
    const mode = state.currentAIExplanation.mode || "unknown";
    const success = state.currentAIExplanation.success !== false;

    if (!success) {
        return `
            <div class="ai-engineer-panel">
                <div class="ai-engineer-header">
                    <div>
                        <div class="ai-engineer-title">Strategy Engineer</div>
                        <div class="ai-engineer-subtitle">Strategy briefing layer</div>
                    </div>
                    <div class="ai-mode-badge">${escapeHtml(mode)}</div>
                </div>
                <div class="ai-engineer-body ai-engineer-error">
                    Strategy briefing unavailable for this analysis.
                </div>
            </div>
        `;
    }

    const modeLabel = mode === "mock" ? "Development Mode" : "Live Simulation";

    return `
        <div class="ai-engineer-panel">
            <div class="ai-engineer-header">
                <div>
                    <div class="ai-engineer-title">Strategy Engineer</div>
                    <div class="ai-engineer-subtitle">Engineering briefing based on the strategy engine output</div>
                </div>
                <div class="ai-mode-badge">${escapeHtml(modeLabel)}</div>
            </div>

            <div class="ai-engineer-recommendation">
                <div class="ai-engineer-medal">#1</div>
                <div>
                    <div class="ai-engineer-rec-label">Engine Recommendation</div>
                    <div class="ai-engineer-rec-name">${escapeHtml(recommended.name)}</div>
                </div>
            </div>

            <div class="ai-engineer-body">${escapeHtml(explanation)}</div>

            <div class="ai-engineer-footer">
                The strategy engine remains the source of truth. The briefing explains the calculated recommendation.
            </div>
        </div>
    `;
}

export function renderStrategyResults() {
    const container = document.getElementById("result");
    if (!container) return;

    if (!state.currentStrategies.length) {
        container.innerHTML = `
            <div class="error-msg">
                No candidate strategies were returned by the strategy engine.
            </div>
        `;
        return;
    }

    const selected = state.currentStrategies[state.selectedStrategyIndex] || state.currentStrategies[0];
    const recommended = state.currentStrategies.find(
        strategy => strategy.name === state.currentRecommendedName
    ) || state.currentStrategies[0];

    const recommendedIndex = state.currentStrategies.findIndex(
        strategy => strategy.name === recommended.name
    );

    const compounds = (selected.compounds || []).map(escapeHtml).join(" -> ");
    const recommendedCompounds = (recommended.compounds || []).map(escapeHtml).join(" -> ");

    const recommendedHtml = `
        <div class="recommended-card">
            <div class="recommended-rank">#1 Recommended</div>
            <div class="recommended-header">
                <div>
                    <div class="recommended-label">Engine Recommendation</div>
                    <div class="recommended-name">${escapeHtml(recommended.name)}</div>
                </div>
                <div class="score-badge">
                    <div class="score-number">${Number(recommended.score).toFixed(2)}</div>
                    <div class="score-label">Strategy Score</div>
                </div>
            </div>
            <div class="recommended-meta">
                <div class="meta-pill">Tyres: ${recommendedCompounds}</div>
                <div class="meta-pill">Pit Stops: ${recommended.stops}</div>
                <div class="meta-pill">Risk: ${escapeHtml(recommended.risk)}</div>
            </div>
        </div>
    `;

    const candidateHtml = state.currentStrategies.map((strategy, index) => {
        const isRecommended = strategy.name === recommended.name;
        const isSelected = index === state.selectedStrategyIndex;
        const strategyCompounds = (strategy.compounds || []).map(escapeHtml).join(" -> ");

        return `
            <button
                type="button"
                class="candidate-card ${isSelected ? "selected" : ""} ${isRecommended ? "recommended" : ""}"
                onclick="selectStrategy(${index})"
                aria-pressed="${isSelected}"
            >
                <div class="candidate-rank">${isRecommended ? "#1" : `#${index + 1}`}</div>
                <div class="candidate-name">${escapeHtml(strategy.name)}</div>
                ${isRecommended ? `<div class="candidate-recommended">Recommended</div>` : ""}
                <div class="candidate-score">${Number(strategy.score).toFixed(2)}</div>
                <div class="candidate-details">
                    <div class="candidate-detail">
                        <span>Tyres</span>
                        <strong>${strategyCompounds}</strong>
                    </div>
                    <div class="candidate-detail">
                        <span>Pit Stops</span>
                        <strong>${strategy.stops}</strong>
                    </div>
                    <div class="candidate-detail">
                        <span>Risk</span>
                        <strong>${escapeHtml(strategy.risk)}</strong>
                    </div>
                </div>
            </button>
        `;
    }).join("");

    const selectedIsRecommended = selected.name === recommended.name;

    const componentHtml = `
        <div class="component-panel ${selectedIsRecommended ? "recommended-panel" : ""}">
            <div class="component-panel-header">
                <div>
                    <div class="component-panel-title">Strategy Component Analysis</div>
                    <div class="component-panel-name">${escapeHtml(selected.name)}</div>
                </div>
                <div class="component-panel-score">Score ${Number(selected.score).toFixed(2)}</div>
            </div>

            <div class="recommended-meta">
                <div class="meta-pill">Tyres: ${compounds}</div>
                <div class="meta-pill">Pit Stops: ${selected.stops}</div>
                <div class="meta-pill">Risk: ${escapeHtml(selected.risk)}</div>
                ${selectedIsRecommended ? `
                    <div class="meta-pill" style="color:var(--gold);border-color:rgba(255,215,0,0.3);background:rgba(255,215,0,0.08);">
                        Recommended
                    </div>` : ""}
            </div>

            <div class="score-section">
                <div class="score-section-title">Performance Components</div>
                ${renderComponentBars(selected)}
            </div>

            ${selected.reasoning && selected.reasoning.length ? `
                <div class="reasoning-section">
                    <div class="reasoning-title">Engineering Telemetry & Simulation Reasoning</div>
                    <ul class="reasoning-list">
                        ${selected.reasoning.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}
                    </ul>
                </div>` : ""}
        </div>
    `;

    container.innerHTML = `
        ${recommendedHtml}
        <div>
            <div class="strategy-selector-title">Select a strategy to inspect its components</div>
            <div class="strategy-selector">${candidateHtml}</div>
        </div>
        ${componentHtml}
        ${renderAIEngineerPanel(recommended)}
    `;

    if (recommendedIndex >= 0) {
        const recommendedCard = container.querySelectorAll(".candidate-card")[recommendedIndex];
        if (recommendedCard) {
            recommendedCard.setAttribute("title", "Engine recommended strategy");
        }
    }
}

export function showGeneratedStrategyScrollCard() {
    const scene = document.getElementById("sceneGeneratedStrategy");
    const mount = document.getElementById("strategyResultStackMount");
    const result = document.getElementById("result");
    if (!scene || !mount || !result) return;
    if (result.parentElement !== mount) mount.appendChild(result);
    scene.style.display = "block";
    requestAnimationFrame(() => scene.scrollIntoView({ behavior: "smooth", block: "start" }));
}

export function renderError(message, debugText = "") {
    const debugHtml = debugText ? `
        <div class="debug-box" style="display:block;">
            ${escapeHtml(debugText)}
        </div>
    ` : "";

    const resultEl = document.getElementById("result");
    if (resultEl) {
        resultEl.innerHTML = `
            <div class="error-msg">
                Strategy generation failed.<br>
                <small style="opacity:.65;margin-top:7px;display:block;">
                    ${escapeHtml(message)}
                </small>
            </div>
            ${debugHtml}
        `;
    }
    showGeneratedStrategyScrollCard();
}

export function renderResult(result) {
    const candidates = Array.isArray(result.candidate_strategies) ? result.candidate_strategies : [];
    const recommended = result.recommended_strategy;

    if (!recommended || !candidates.length) {
        renderError("Strategy engine returned incomplete strategy data.", JSON.stringify(result, null, 2));
        return;
    }

    state.currentStrategies = candidates;
    state.currentRecommendedName = recommended.name;
    state.currentAIExplanation = result.ai_explanation || null;

    const recommendedIndex = state.currentStrategies.findIndex(
        strategy => strategy.name === state.currentRecommendedName
    );

    state.selectedStrategyIndex = recommendedIndex >= 0 ? recommendedIndex : 0;
    renderStrategyResults();
    showGeneratedStrategyScrollCard();
}

export async function analyze() {
    const button = document.getElementById("generateBtn");
    const spinner = document.getElementById("spinner");
    const label = document.getElementById("generateLabel");
    const track = document.getElementById("track").value;

    const payload = {
        team: getMyTeam(),
        track: track,
        downforce: document.getElementById("downforce").value,
        drag: document.getElementById("drag").value,
        tire_degradation: document.getElementById("tire").value,
        energy_efficiency: document.getElementById("energy_efficiency").value,
        straight_line_speed: document.getElementById("straight_line_speed").value,
        cornering: document.getElementById("cornering").value,
        weather: document.getElementById("weather").value
    };

    state.lastStrategyInputs = { ...payload };

    if (button) button.disabled = true;
    if (spinner) spinner.style.display = "block";
    if (label) label.textContent = "Analyzing…";

    showLoading(track);

    try {
        console.log("Sending strategy request:", payload);
        const response = await fetch(STRATEGY_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const rawText = await response.text();
        let data = null;

        try {
            data = JSON.parse(rawText);
        } catch {
            throw new Error("Server returned an invalid JSON response.");
        }

        console.log("Strategy API response:", data);

        if (!response.ok) {
            throw new Error(data.error || `Server error ${response.status}`);
        }

        if (!data.success) {
            throw new Error(data.error || "Strategy analysis failed.");
        }

        renderResult(data);
    } catch (error) {
        console.error("Strategy analysis error:", error);
        renderError(error.message, error.stack || "");
    } finally {
        if (button) button.disabled = false;
        if (spinner) spinner.style.display = "none";
        if (label) label.textContent = "Run Strategy Simulation";
    }
}
