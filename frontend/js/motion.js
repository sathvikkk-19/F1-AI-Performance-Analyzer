/* =========================================================
   DASHBOARD MOTION & VIEWPORT CONTROLLER
   Clean, performant viewport alignment without cursor tracking
   or scrolljacking fades.
========================================================= */

export function initMotion() {
    document.body.classList.add("immersive-dashboard");

    // Ensure all scene containers are fully visible and active without scroll-fading
    const scenes = Array.from(document.querySelectorAll("[data-scroll-scene]"));
    scenes.forEach(scene => {
        scene.style.opacity = "1";
        scene.style.transform = "none";
        scene.classList.add("scene-active");
    });
}
