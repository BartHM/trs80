import {FlipCardSideAdapter} from "./FlipCard.js";
import {CanvasScreen} from "./CanvasScreen.js";
import {ControlPanel} from "./ControlPanel.js";
import {LinePrinter, Printer } from "trs80-emulator";
import {addPrinterCssFontToPage, PRINTER_REGULAR_FONT_FAMILY} from "./PrinterFonts.js";

// Holes on sides. See assets/README.md.
const BACKGROUND_LEFT_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAQAAACROWYpAAABH0lEQVQ4y+XUvU7DMBhG4cdJoECFQPwIRjbukAtlRowsIH6KgCZpbAZAIq1LUBYGPNrfsY/ez3YwYlyw49xlMQZG7VocC287YSyc7CrGwnNXf6ldrV3eNFHo1Np12nl4x7Hpp1Xn2a06oz3LwQdOtB40ksLE1Jkbz7/R3nPk0UwjSoLSzL5TC29DaW848OTeq1Yn6jRe3Hl12As3m/ZU60kjfZuLao8KW8vafTjY9LKEfuFzkyFtGfQj83pVu1op6rIwnfCzdrLolfTHYki7UWTxIGiG0q5RZuBS7F3T7JOMGtXKlqXKvJfFmrRbnerb6UGp0uh6Vdm0P/BCqZAkQUArLtX88CSj+IklKdu6gZ8kiaK4puv/9gP8E+0th9I7ord+FFKRmsMAAAAASUVORK5CYII=";
const BACKGROUND_RIGHT_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAQAAACROWYpAAABKklEQVQ4y+XUwU7cMBRG4S9OyoDQdFGKQGx4gz4eD9E3rFR1XyEhQCWaZGK7m6EicTIt0xXiLm0d6dj/vbe6qX3xTfvV6ytIfugOIBFw4eRQOFjLh8LJd5u3pt3s0f5gpZZ0+iWYC9GvyfnKubUaJE9utXPwnPbalexRJ6kcOXXtp7t/0T5xqXWvE2WV4NFHn0UPf9MOzrTudNLuJBoMkk9a2/2/fSy4f4FC1nuwdTqNaqq9spmgz/iTI9UYnjZJ0IkzueQysFI7zqLk8qbUHixVZRiHWmr3qvHL/qBhKl5qb6VdZ42rZro0Su1soynwoNFPM5gbyajXqF/I1xpx3CAs9XaU1YIs735gKJK3PJJJ2mFZXpr3fZskS5K0vCre4wL8T+3szPFh8G8+SIOIlEKP2QAAAABJRU5ErkJggg==";

// Amount of time to wait before we'll alert about activity again.
const MIN_ACTIVITY_CALLBACK_MS = 60*1000;

/**
 * A card side to show the output of the printer.
 */
export class WebPrinter extends FlipCardSideAdapter implements Printer {
    private readonly node: HTMLElement;
    private readonly paper: HTMLElement;
    private readonly linePrinter = new class extends LinePrinter {
        constructor(private readonly webPrinter: WebPrinter) {
            super();
        }

        printLine(line: string): void {
            // Pass on to outer class.
            this.webPrinter.printLine(line);
        }
    }(this);
    private activityCallback = () => {};
    private lastActivityCallback = 0;

    constructor(screen: CanvasScreen) {
        super();

        const width = screen.getWidth();
        const height = screen.getHeight();

        this.node = document.createElement("div");
        this.node.style.width = width + "px";
        this.node.style.height = height + "px";
        this.node.style.borderRadius = screen.getBorderRadius() + "px";
        this.node.style.backgroundColor = "#eeeee8";
        this.node.style.boxSizing = "border-box";

        this.paper = document.createElement("div");
        this.paper.style.width = "100%";
        this.paper.style.height = "100%";
        this.paper.style.padding = "20px 0";
        this.paper.style.fontFamily = `"${PRINTER_REGULAR_FONT_FAMILY}", monospace`;
        this.paper.style.fontSize = "12px"; // To get 80 chars across.
        this.paper.style.lineHeight = "1.5";
        this.paper.style.boxSizing = "border-box";
        this.paper.style.color = "#222";
        this.paper.style.overflowY = "scroll";
        this.paper.style.background = "local url(" + BACKGROUND_LEFT_URL + ") top left repeat-y, " +
            "local url(" + BACKGROUND_RIGHT_URL + ") top right repeat-y";
        this.node.append(this.paper);

        const controlPanel = new ControlPanel(this.node);
        controlPanel.addSaveButton(() => this.hide());
    }

    /**
     * The activity callback gets called when a line is printed, the card is not being shown,
     * and it's been a while since we called the callback.
     */
    public setActivityCallback(callback: () => void) {
        this.activityCallback = callback;
    }

    printChar(ch: number): void {
        this.linePrinter.printChar(ch);
    }

    printLine(line: string): void {
        // Figure out scroll space at the bottom:
        const bottomSpace = Math.abs(this.paper.scrollHeight - this.paper.scrollTop - this.paper.clientHeight);
        // There's some rounding, be sloppy:
        const wasAtBottom = bottomSpace < 1;

        // Add the new line.
        const lineNode = document.createElement("div");
        lineNode.style.padding = "0 40px";
        lineNode.textContent = line;
        this.paper.append(lineNode);

        if (wasAtBottom) {
            // Stay scrolled at the bottom.
            this.paper.scrollTop = this.paper.scrollHeight;
        }

        // Call the activity callback.
        const now = Date.now();
        if (now - this.lastActivityCallback > MIN_ACTIVITY_CALLBACK_MS) {
            this.lastActivityCallback = now;
            this.activityCallback();
        }
    }

    public show() {
        addPrinterCssFontToPage();
        this.flipCard?.show(this);
    }

    private hide() {
        this.flipCard?.hide(this);
    }

    save() {
        // Could save printer output.
        return undefined;
    }

    restore(state: any): void {
        // Nothing to do.
    }

    getNode(): HTMLElement {
        return this.node;
    }
}