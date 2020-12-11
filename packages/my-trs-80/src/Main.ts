import Navigo from "navigo";
import {createHome} from "./Home";
import {CanvasScreen, Cassette, ControlPanel, PanelType, ProgressBar, SettingsPanel, Trs80} from "trs80-emulator";
import firebase from 'firebase/app';
// These imports load individual services into the firebase namespace.
import 'firebase/auth';
import 'firebase/firestore';
import 'firebase/analytics';
import {makeIcon, makeIconButton} from "./Utils";
import {PanelManager} from "./PanelManager";
import {LibraryPanel} from "./LibraryPanel";
import {Context} from "./Context";

function configureRoutes() {
    const body = document.querySelector("body") as HTMLElement;
    const router = new Navigo(null, true, "#!");
    const s = createHome(router);
    s.classList.add("screen");
    body.append(s);
    router.resolve();
}

class EmptyCassette extends Cassette {
    // Nothing to do.
}

// Fresh IDs for inputs so that we can point labels at them. TODO delete?
let inputIdCounter = 1;
function makeId(): string {
    return "_input" + inputIdCounter++;
}

// For testing.
function addProgramToFirestore(db: firebase.firestore.Firestore, name: string, url: string, note: string) {
    fetch(url)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer =>
            db.collection("files").add({
                uid: "",
                name: name,
                filename: url.split("/").pop(),
                note: note,
                public: false,
                hash: "",
                binary: firebase.firestore.Blob.fromUint8Array(new Uint8Array(arrayBuffer)),
                dateAdded: firebase.firestore.Timestamp.fromDate(new Date()),
                dateModified: firebase.firestore.Timestamp.fromDate(new Date()),
            }))
        .then(function (docRef) {
            console.log("Document written with ID: ", docRef.id);
        })
        .catch(function (error) {
            console.error("Error adding document: ", error);
        });
}

function createNavbar(openLibrary: () => void): HTMLElement {
    const navbar = document.createElement("div");
    navbar.classList.add("navbar");

    const title = document.createElement("span");
    title.textContent = "My TRS-80";
    navbar.append(title);

    const libraryButton = makeIconButton(makeIcon("folder_open"), "Open library (Ctrl-L)", openLibrary);
    navbar.append(libraryButton);

    const themeButton = makeIconButton(makeIcon("brightness_medium"), "Toggle theme", () => {
        const body = document.querySelector("body") as HTMLElement;

        body.classList.toggle("light-mode");
        body.classList.toggle("dark-mode");
    });
    navbar.append(themeButton);

    return navbar;
}

export function main() {
    const app = firebase.initializeApp({
        apiKey: "AIzaSyAfGZY9BaDUmy4qNtg11JHd_kLd1JmgdBI",
        authDomain: "my-trs-80.firebaseapp.com",
        projectId: "my-trs-80",
        storageBucket: "my-trs-80.appspot.com",
        messagingSenderId: "438103442091",
        appId: "1:438103442091:web:0fe42c43917ba1add52dee"
    });
    firebase.analytics();

    const db = firebase.firestore();

    if (false) {
        addProgramToFirestore(db, "Breakdown", "tmp/BREAKDWN.CMD", "Breakout-like game from pski.");
        addProgramToFirestore(db, "Memtest", "tmp/MEMTEST.CMD", "Standard MEMTEST program from TRS-DOS.");
        addProgramToFirestore(db, "Armored Patrol", "tmp/ARMOR.CMD", "Space shoot-em-up.");
        addProgramToFirestore(db, "Ghosts", "tmp/GHOSTS.CMD", "Doesn't seem to work.");
    }

    const panelManager = new PanelManager();

    const navbar = createNavbar(() => panelManager.open());
    const screenDiv = document.createElement("div");
    screenDiv.classList.add("main-computer-screen");

    const screen = new CanvasScreen(screenDiv, false);
    let cassette = new EmptyCassette();
    const trs80 = new Trs80(screen, cassette);

    const reboot = () => {
        trs80.reset();
        trs80.start();
    };

    const hardwareSettingsPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.HARDWARE);
    const viewPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.VIEW);
    const controlPanel = new ControlPanel(screen.getNode());
    controlPanel.addResetButton(reboot);
    controlPanel.addTapeRewindButton(() => {
        // cassette.rewind();
    });
    /*
    if (program !== undefined) {
        controlPanel.addScreenshotButton(() => {
            const screenshot = trs80.getScreenshot();
            program.setScreenshot(screenshot);
            this.tape.saveUserData();
        });
    }*/
    controlPanel.addSettingsButton(hardwareSettingsPanel);
    controlPanel.addSettingsButton(viewPanel);
    // const progressBar = new ProgressBar(screen.getNode());
    // cassette.setProgressBar(progressBar);

    const body = document.querySelector("body") as HTMLElement;
    body.append(navbar);
    body.append(screenDiv);

    let wasTrs80Started = false;
    panelManager.onOpenClose.subscribe(isOpen => {
        if (isOpen) {
            wasTrs80Started = trs80.stop();
        } else {
            if (wasTrs80Started) {
                trs80.start();
            }
        }
    });

    document.addEventListener("keydown", event => {
        if (event.ctrlKey && event.key === "l") {
            panelManager.toggle();
        }
    });

    reboot();

    const context = new Context(trs80, db, panelManager);

    const libraryPanel = new LibraryPanel(context);
    panelManager.pushPanel(libraryPanel);
}