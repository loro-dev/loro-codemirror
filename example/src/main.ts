import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
    getTextFromDoc,
    LoroAwarenessPlugin,
    LoroExtensions,
    LoroSyncPlugin,
    LoroUndoPlugin,
} from "loro-codemirror";
import { Awareness, LoroDoc, UndoManager } from "loro-crdt";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";

// Create a Loro document
const doc1 = new LoroDoc();
const awareness1: Awareness = new Awareness(doc1.peerIdStr);
const undoManager1 = new UndoManager(doc1, {});
const doc2 = new LoroDoc();
const awareness2: Awareness = new Awareness(doc2.peerIdStr);
const undoManager2 = new UndoManager(doc2, {});

doc1.subscribeLocalUpdates((update) => {
    doc2.import(update);
});
doc1.getText("codemirror").insert(0, "hello");
doc2.subscribeLocalUpdates((update) => {
    doc1.import(update);
});

awareness1.addListener((updates, origin) => {
    const changes = updates.added
        .concat(updates.removed)
        .concat(updates.updated);
    if (origin === "local") {
        awareness2.apply(awareness1.encode(changes));
    }
});

awareness2.addListener((updates, origin) => {
    const changes = updates.added
        .concat(updates.removed)
        .concat(updates.updated);
    if (origin === "local") {
        awareness1.apply(awareness2.encode(changes));
    }
});

// Create the first editor
new EditorView({
    state: EditorState.create({
        extensions: [
            EditorView.theme({
                "&": { height: "100%", fontSize: "18px" },
            }),
            basicSetup,
            javascript({ typescript: true }),
            LoroExtensions(
                doc1,
                {
                    user: { name: "User 1", colorClassName: "user1" },
                    awareness: awareness1,
                },
                undoManager1,
            ),
        ],
    }),
    parent: document.querySelector("#editor1")!,
});

// Create the second editor
new EditorView({
    state: EditorState.create({
        extensions: [
            EditorView.theme({
                "&": { height: "100%", fontSize: "18px" },
            }),
            basicSetup,
            javascript({ typescript: true }),
            LoroSyncPlugin(doc2),
            LoroAwarenessPlugin(doc2, awareness2, {
                name: "User 2",
                colorClassName: "user2",
            }),
            LoroUndoPlugin(doc2, undoManager2),
        ],
    }),
    parent: document.querySelector("#editor2")!,
});
