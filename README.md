# Codemirror Binding for Loro

- Sync document state with Loro
- Sync cursors with Loro's Awareness and
  [Cursor](https://loro.dev/docs/tutorial/cursor)
- Undo/Redo in collaborative editing

## Usage

```ts
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LoroExtensions } from "loro-codemirror";
import { EphemeralStore, LoroDoc, UndoManager } from "loro-crdt";

const doc = new LoroDoc();
const ephemeral = new EphemeralStore();
const undoManager = new UndoManager(doc, {});

new EditorView({
    state: EditorState.create({
        extensions: [
            // ... other extensions
            LoroExtensions(
                doc,
                // optional LoroAwarenessPlugin
                {
                    ephemeral,
                    user: { name: "Bob", colorClassName: "user1" },
                },
                // optional LoroUndoPlugin
                undoManager,
            ),
        ],
    }),
    parent: document.querySelector("#editor")!,
});
```

You can find the example
[here](https://github.com/loro-dev/loro-codemirror/tree/main/example).
