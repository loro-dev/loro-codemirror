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
                    if (value && value.canUndo()) {
                        value.undo();
                    }
                } else if (effect.is(redoEffect)) {
                    if (value && value.canRedo()) {
                        value.redo();
                    }
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

            let changes: ChangeSpec[] = [];
            let pos = 0;
            for (let { diff, target } of e.events) {
                const text = this.getTextFromDoc(this.doc);
                // Skip if the event is not a text event
                if (diff.type !== "text") return;
                // Skip if the event is not for the current document
                if (target !== text.id) return;
                const textDiff = diff.diff;
                for (const delta of textDiff) {
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
                const anchorPos = this.doc!.getCursorPos(anchor).offset;
                const headPos = head
                    ? this.doc!.getCursorPos(head).offset
                    : anchorPos;
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
