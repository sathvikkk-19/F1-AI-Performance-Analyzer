/* =========================================================
   APPLICATION STATE STORE
========================================================= */

export const state = {
    selectedOtherTeam: null,
    currentStrategies: [],
    currentRecommendedName: "",
    selectedStrategyIndex: 0,
    currentAIExplanation: null,
    lastStrategyInputs: {},
    selectedCareerDriver: null,
    careerRaceTab: "current",
    careerData: null
};

export function resetStrategyState() {
    state.currentStrategies = [];
    state.currentRecommendedName = "";
    state.selectedStrategyIndex = 0;
    state.currentAIExplanation = null;
    state.lastStrategyInputs = {};
}
