import {CSS_PREFIX} from "./Utils";

// Generate with "base64 font.png".
export const FONT_IMAGE = "data:image/png;base64,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";

const BASE_CSS = `

/* ---------------- For CanvasScreen.ts ----------------- */

.trs80-emulator-canvas-screen {
    display: inline-block;
    padding: 10px;
    background-color: #334843;
    border-radius: 8px;
}

`;

/**
 * Make a global stylesheet for all TRS-80 emulators on this page. Idempotent.
 */
export function configureStylesheet(): void {
    const styleId = CSS_PREFIX + "-style";
    if (document.getElementById(styleId) !== null) {
        // Already created.
        return;
    }

    const node = document.createElement("style");
    node.id = styleId;
    node.innerHTML = BASE_CSS;
    document.head.appendChild(node);
}
