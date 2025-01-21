# Codemirror Binding for Loro

-   Sync document state with Loro
-   Sync cursors with Loro's Awareness and [Cursor](https://loro.dev/docs/tutorial/cursor)
-   Undo/Redo in collaborative editing

https://github.com/user-attachments/assets/eee4c681-f8e7-4f37-b20d-348578e516b8

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

You can find the example [here](https://github.com/loro-dev/loro-codemirror/tree/main/example)
