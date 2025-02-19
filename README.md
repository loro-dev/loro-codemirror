# Codemirror Binding for Loro

-   Sync document state with Loro
-   Sync cursors with Loro's Awareness and [Cursor](https://loro.dev/docs/tutorial/cursor)
-   Undo/Redo in collaborative editing

## Usage

```ts
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LoroExtensions } from "loro-codemirror";
import { Awareness, LoroDoc, UndoManager } from "loro-crdt";

const doc = new LoroDoc();
const awareness = new Awareness(doc.peerIdStr);
const undoManager = new UndoManager(doc, {});

new EditorView({
    state: EditorState.create({
        extensions: [
            // ... other extensions
            LoroExtensions(
                doc,
                // optional LoroAwarenessPlugin
                {
                    awareness: awareness,
                    user: { name: "Bob", colorClassName: "user1" },
                },
                // optional LoroUndoPlugin
                undoManager
            ),
        ],
    }),
    parent: document.querySelector("#editor")!,
});
```

You can find the example [here](https://github.com/loro-dev/loro-codemirror/tree/main/example).

Note that due to limitations of the Codemirror API, you’ll need to set the initial document yourself.
