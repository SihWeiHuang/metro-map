const ROOT_ID = "root";
const WIDTH_MISMATCH_PX = 2;

/** @returns {number} positive when the root is narrower than the viewport */
export function measureRootWidthGap() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return 0;
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  return viewportWidth - root.getBoundingClientRect().width;
}

function readViewportSize() {
  const viewport = window.visualViewport;
  return {
    width: Math.round(viewport?.width ?? window.innerWidth),
    height: Math.round(viewport?.height ?? window.innerHeight),
  };
}

function pinRootToViewport() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const { width, height } = readViewportSize();
  root.style.width = `${width}px`;
  root.style.height = `${height}px`;
}

function releaseRootInlineSize() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.style.removeProperty("width");
  root.style.removeProperty("height");
}

/**
 * Safari (macOS) "Open in New Window" can freeze #root at a stale layout width.
 * Pin to the live viewport, then restore CSS sizing once the gap closes.
 */
export function syncViewportLayout(onAfterSync) {
  const gap = measureRootWidthGap();
  if (gap > WIDTH_MISMATCH_PX) {
    pinRootToViewport();
    void document.getElementById(ROOT_ID)?.offsetHeight;
    if (measureRootWidthGap() <= WIDTH_MISMATCH_PX) {
      releaseRootInlineSize();
    }
  } else {
    releaseRootInlineSize();
  }
  onAfterSync?.();
}

/**
 * @param {(() => void) | undefined} onAfterSync e.g. map.resize()
 * @returns {() => void} cleanup
 */
export function installViewportSync(onAfterSync) {
  let rafId = 0;
  const timerIds = [];

  const run = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => syncViewportLayout(onAfterSync));
  };

  run();
  window.addEventListener("load", run);
  window.addEventListener("pageshow", run);
  window.addEventListener("resize", run);
  window.visualViewport?.addEventListener("resize", run);

  for (const delayMs of [50, 150, 350, 700]) {
    timerIds.push(window.setTimeout(run, delayMs));
  }

  return () => {
    cancelAnimationFrame(rafId);
    timerIds.forEach((id) => window.clearTimeout(id));
    window.removeEventListener("load", run);
    window.removeEventListener("pageshow", run);
    window.removeEventListener("resize", run);
    window.visualViewport?.removeEventListener("resize", run);
    releaseRootInlineSize();
  };
}
