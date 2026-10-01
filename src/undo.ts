import {
    type ChangeSpec,
    EditorSelection,
    StateEffect,
    StateField,
} from "@codemirror/state";
import { EditorView, type PluginValue, ViewUpdate } from "@codemirror/view";
import {
    Cursor,
    LoroDoc,
    LoroText,
    type Subscription,
    UndoManager,
} from "loro-crdt";
import { loroSyncAnnotation } from "./sync.ts";

export const undoEffect = StateEffect.define();
export const redoEffect = StateEffect.define();
export const undoManagerStateField = StateField.define<UndoManager | undefined>(
    {
        create(state) {
            return undefined;
        },

        update(value, transaction) {
            for (const effect of transaction.effects) {
                if (effect.is(undoEffect)) {
                    queueMicrotask(() => {
                        if (value?.canUndo()) {
                            value.undo();
                        }
                    });
                } else if (effect.is(redoEffect)) {
                    queueMicrotask(() => {
                        if (value?.canRedo()) {
                            value.redo();
                        }
                    });
                }
            }
            return value;
        },
    }
);

export class UndoPluginValue implements PluginValue {
    sub?: Subscription;
    lastSelection: {
        anchor: Cursor | undefined;
        head: Cursor | undefined;
    } = {
        anchor: undefined,
        head: undefined,
    };
    constructor(
        public view: EditorView,
        public doc: LoroDoc,
        private undoManager: UndoManager,
        private getTextFromDoc: (doc: LoroDoc) => LoroText
    ) {
        this.sub = doc.subscribe((e) => {
            if (e.origin !== "undo") return;

            // As in sync.ts: a batch can carry events for other containers,
            // and for this text more than once. An undo step that touches the
            // map as well as the text -- typing into a file just created --
            // puts the map's event first, so returning here meant the undo
            // never reached the view: the document undid and the view did
            // not, leaving the two out of step by exactly the text that had
            // been taken back.
            const changes: ChangeSpec[] = [];
            let pos = 0;
            const text = this.getTextFromDoc(this.doc);
            for (const { diff, target } of e.events) {
                if (diff.type !== "text") continue;
                if (target !== text.id) continue;
                for (const delta of diff.diff) {
                    if (delta.insert) {
                        changes.push({
                            from: pos,
                            to: pos,
                            insert: delta.insert,
                        });
                    } else if (delta.delete) {
                        changes.push({
                            from: pos,
                            to: pos + delta.delete,
                        });
                        pos += delta.delete;
                    } else if (delta.retain != null) {
                        pos += delta.retain;
                    }
                }
            }
            if (changes.length > 0) {
                this.view.dispatch({
                    changes,
                    annotations: [loroSyncAnnotation.of("undo")],
                });
            }
        });

        this.undoManager.setOnPop((isUndo, value, counterRange) => {
            const anchor = value.cursors[0] ?? undefined;
            const head = value.cursors[1] ?? undefined;
            if (!anchor) return;

            setTimeout(() => {
                const anchorPos = this.doc.getCursorPos(anchor)?.offset;
                if (anchorPos === undefined) return;
                const headPos = head
                    ? this.doc.getCursorPos(head)?.offset
                    : anchorPos;
                if (headPos === undefined) return;
                const selection = EditorSelection.single(anchorPos, headPos);
                this.view.dispatch({
                    selection,
                    effects: [EditorView.scrollIntoView(selection.ranges[0])],
                });
            }, 0);
        });

        this.undoManager.setOnPush((isUndo, counterRange) => {
            const cursors = [];
            let selection = this.lastSelection;
            if (!isUndo) {
                const stateSelection = this.view.state.selection.main;
                selection.anchor = this.getTextFromDoc(this.doc).getCursor(
                    stateSelection.anchor
                );
                selection.head = this.getTextFromDoc(this.doc).getCursor(
                    stateSelection.head
                );
            }
            if (selection.anchor) {
                cursors.push(selection.anchor);
            }
            if (selection.head) {
                cursors.push(selection.head);
            }
            return {
                value: null,
                cursors,
            };
        });
    }

    update(update: ViewUpdate): void {
        if (update.selectionSet) {
            this.lastSelection = {
                anchor: this.getTextFromDoc(this.doc).getCursor(
                    update.state.selection.main.anchor
                ),
                head: this.getTextFromDoc(this.doc).getCursor(
                    update.state.selection.main.head
                ),
            };
        }
    }

    destroy(): void {
        this.sub?.();
        this.sub = undefined;
    }
}

export const undo = (view: EditorView): boolean => {
    view.dispatch({
        effects: [undoEffect.of(null)],
    });
    return true;
};

export const redo = (view: EditorView): boolean => {
    view.dispatch({
        effects: [redoEffect.of(null)],
    });
    return true;
};

export const undoKeyMap = [
    {
        key: "Mod-z",
        run: undo,
        preventDefault: true,
    },
    {
        key: "Mod-y",
        mac: "Mod-Shift-z",
        run: redo,
        preventDefault: true,
    },
    {
        key: "Mod-Shift-z",
        run: redo,
        preventDefault: true,
    },
];
