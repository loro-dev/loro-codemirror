import { Annotation, type ChangeSpec } from "@codemirror/state";
import { EditorView, type PluginValue, ViewUpdate } from "@codemirror/view";
import {
    LoroDoc,
    type LoroEventBatch,
    LoroText,
    type Subscription,
} from "loro-crdt";

export const loroSyncAnnotation = Annotation.define();

export const getTextFromDoc = (doc: LoroDoc): LoroText => {
    return doc.getText("codemirror");
};

export class LoroSyncPluginValue implements PluginValue {
    sub?: Subscription;
    constructor(private view: EditorView, private doc: LoroDoc) {
        this.sub = doc.subscribe(this.onRemoteUpdate);
    }

    onRemoteUpdate = (e: LoroEventBatch) => {
        if (e.by === "local") {
            return;
        }
        if (e.by === "checkout") {
            // TODO: better handle checkout
            this.view.dispatch({
                changes: [
                    {
                        from: 0,
                        to: this.view.state.doc.length,
                        insert: getTextFromDoc(this.doc).toString(),
                    },
                ],
                annotations: [loroSyncAnnotation.of(this)],
            });
            return;
        }
        if (e.by === "import") {
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
                    annotations: [loroSyncAnnotation.of(this)],
                });
            }
        }
    };

    update(update: ViewUpdate): void {
        if (
            !update.docChanged ||
            (update.transactions.length > 0 &&
                (update.transactions[0].annotation(loroSyncAnnotation) ===
                    this ||
                    update.transactions[0].annotation(loroSyncAnnotation) ===
                        "undo"))
        ) {
            return;
        }
        let adj = 0;
        update.changes.iterChanges((fromA, toA, fromB, toB, insert) => {
            const insertText = insert.sliceString(0, insert.length, "\n");
            if (fromA !== toA) {
                getTextFromDoc(this.doc).delete(fromA + adj, toA - fromA);
            }
            if (insertText.length > 0) {
                getTextFromDoc(this.doc).insert(fromA + adj, insertText);
            }
            adj += insertText.length - (toA - fromA);
        });
        this.doc.commit();
    }

    destroy(): void {
        this.sub?.();
        this.sub = undefined;
    }
}
