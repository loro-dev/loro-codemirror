import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { loroExtension } from "loro-codemirror";
import { Awareness, LoroDoc } from "loro-crdt";

// Create a Loro document
const doc1 = new LoroDoc();
const awareness1: Awareness = new Awareness(doc1.peerIdStr);
const doc2 = new LoroDoc();
const awareness2: Awareness = new Awareness(doc2.peerIdStr);

doc1.subscribeLocalUpdates((update) => {
    doc2.import(update);
});
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
                "&": { height: "100%" },
            }),
            loroExtension(
                doc1,
                {
                    user: { name: "Editor 1", colorClassName: "user1" },
                    awareness: awareness1,
                },
                {}
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
                "&": { height: "100%" },
            }),
            loroExtension(
                doc2,
                {
                    user: { name: "Editor 2", colorClassName: "user2" },
                    awareness: awareness2,
                },
                {}
            ),
        ],
    }),
    parent: document.querySelector("#editor2")!,
});
