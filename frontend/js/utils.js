/* =========================================================
   DOM & FORMATTING UTILITIES
========================================================= */

export function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function show(id, visible, displayType) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = visible ? (displayType || "block") : "none";
}
