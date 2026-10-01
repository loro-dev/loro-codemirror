import {
    Annotation,
    type ChangeSpec,
    type Transaction,
} from "@codemirror/state";
import { EditorView, type PluginValue, ViewUpdate } from "@codemirror/view";
import {
    LoroDoc,
    type LoroEventBatch,
    LoroText,
    type Subscription,
} from "loro-crdt";

export const loroSyncAnnotation = Annotation.define();

export class LoroSyncPluginValue implements PluginValue {
    sub?: Subscription;
    constructor(
        private view: EditorView,
        private doc: LoroDoc,
        private getTextFromDoc: (doc: LoroDoc) => LoroText
    ) {
        this.sub = doc.subscribe(this.onRemoteUpdate);
        Promise.resolve().then(() => {
            const currentText = this.view.state.doc.toString();
            const text = this.getTextFromDoc(this.doc);
            if (currentText === text.toString()) {
                return;
            }
            view.dispatch({
                changes: [
                    {
                        from: 0,
                        to: this.view.state.doc.length,
                        insert: text.toString(),
                    },
                ],
                // Marks this as our own write, so `update` skips it instead of
                // applying it back to the document.
                annotations: [loroSyncAnnotation.of(this)],
            });
        });
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
                        insert: this.getTextFromDoc(this.doc).toString(),
                    },
                ],
                annotations: [loroSyncAnnotation.of(this)],
            });
            return;
        }
        if (e.by === "import") {
            // A batch can carry events for containers other than this text --
            // a document that holds a map of texts emits the map's event
            // alongside the text's -- and it can carry more than one event
            // for this text. So skip an event that is not ours instead of
            // abandoning the rest of the batch, and dispatch once after
            // collecting all of them: `changes` and `pos` accumulate across
            // events, so a dispatch inside the loop applies the earlier
            // changes a second time.
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
                    annotations: [loroSyncAnnotation.of(this)],
                });
            }
        }
    };

    // A dispatch this plugin made itself, or that the undo plugin made from a
    // document event. Either is already in the document.
    private isOwn(transaction: Transaction): boolean {
        const mark = transaction.annotation(loroSyncAnnotation);
        return mark === this || mark === "undo";
    }

    update(update: ViewUpdate): void {
        if (!update.docChanged) {
            return;
        }
        // Transaction by transaction, not the update as a whole. A ViewUpdate
        // can carry several transactions -- CodeMirror queues a dispatch made
        // while another update is running and applies them together -- and
        // deciding once for the whole update from `transactions[0]` is wrong.
        // With one of this plugin's own writes and one user edit in the same
        // update, that either copies the write into the document a second
        // time, or throws the edit away, depending on which came first.
        //
        // Each transaction's changes are in the coordinates of the document
        // it started from, and that document is what the text holds after the
        // transactions before it have been written or skipped. So walking
        // them in order and writing only the ones that are not ours keeps the
        // two in step.
        let written = false;
        for (const transaction of update.transactions) {
            if (!transaction.docChanged || this.isOwn(transaction)) {
                continue;
            }
            const text = this.getTextFromDoc(this.doc);
            let adj = 0;
            transaction.changes.iterChanges((fromA, toA, fromB, toB, insert) => {
                const insertText = insert.sliceString(0, insert.length, "\n");
                if (fromA !== toA) {
                    text.delete(fromA + adj, toA - fromA);
                }
                if (insertText.length > 0) {
                    text.insert(fromA + adj, insertText);
                }
                adj += insertText.length - (toA - fromA);
            });
            written = true;
        }
        if (written) {
            this.doc.commit();
        }
    }

    destroy(): void {
        this.sub?.();
        this.sub = undefined;
    }
}
