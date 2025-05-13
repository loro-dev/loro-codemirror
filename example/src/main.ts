import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
    getTextFromDoc,
    LoroEphemeralPlugin,
    LoroExtensions,
    LoroSyncPlugin,
    LoroUndoPlugin,
} from "loro-codemirror";
import { EphemeralStore, LoroDoc, UndoManager } from "loro-crdt";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";

// Create a Loro document
const doc1 = new LoroDoc();
const ephemeral1: EphemeralStore = new EphemeralStore();
const undoManager1 = new UndoManager(doc1, {});
const doc2 = new LoroDoc();
const ephemeral2: EphemeralStore = new EphemeralStore();
const undoManager2 = new UndoManager(doc2, {});

doc1.subscribeLocalUpdates((update) => {
    doc2.import(update);
});
// Initialize the document
getTextFromDoc(doc1).insert(0, "hello");
doc1.commit();
doc2.subscribeLocalUpdates((update) => {
    doc1.import(update);
});

// @ts-ignore
const _sub1 = ephemeral1.subscribeLocalUpdates((update) => {
    ephemeral2.apply(update);
});

// @ts-ignore
const _sub2 = ephemeral2.subscribeLocalUpdates((update) => {
    ephemeral1.apply(update);
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
                    ephemeral: ephemeral1
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
            LoroEphemeralPlugin(doc2, ephemeral2, {
                name: "User 2",
                colorClassName: "user2",
            }),
            LoroUndoPlugin(doc2, undoManager2),
        ],
    }),
    parent: document.querySelector("#editor2")!,
});
