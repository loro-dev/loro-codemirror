import {
    ChangeSpec,
    EditorSelection,
    StateEffect,
    StateField,
} from "@codemirror/state";
import { EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { Cursor, LoroDoc, Subscription, UndoManager } from "loro-crdt";
import { getTextFromDoc, loroSyncAnnotation } from "./sync";

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
        private undoManager: UndoManager
    ) {
        this.sub = doc.subscribe((e) => {
            if (e.origin !== "undo") return;

            let changes: ChangeSpec[] = [];
            let pos = 0;
            for (let { diff } of e.events) {
                if (diff.type !== "text") return;
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
                this.view.dispatch({
                    selection: EditorSelection.single(anchorPos, headPos),
                });
            }, 0);
        });

        this.undoManager.setOnPush((isUndo, counterRange) => {
            const cursors = [];
            let selection = this.lastSelection;
            if (!isUndo) {
                const stateSelection = this.view.state.selection.main;
                selection.anchor = getTextFromDoc(this.doc).getCursor(
                    stateSelection.anchor
                );
                selection.head = getTextFromDoc(this.doc).getCursor(
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
                anchor: getTextFromDoc(this.doc).getCursor(
                    update.state.selection.main.anchor
                ),
                head: getTextFromDoc(this.doc).getCursor(
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
