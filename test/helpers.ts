import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LoroDoc } from "loro-crdt";

// jsdom has no layout: CodeMirror's measure pass calls these on a Range.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
    const rect = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
    Range.prototype.getClientRects = () =>
        Object.assign([], { item: () => null }) as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () =>
        ({ ...rect, toJSON: () => rect }) as DOMRect;
}

export const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

export function makeView(doc: string, extensions: Extension): EditorView {
    return new EditorView({
        state: EditorState.create({ doc, extensions }),
        parent: document.body,
    });
}

export function type(view: EditorView, at: number, insert: string) {
    view.dispatch({ changes: { from: at, insert }, userEvent: "input.type" });
}

/** A second peer that starts from `doc`'s current state. */
export function peerOf(doc: LoroDoc, peer: bigint): LoroDoc {
    const other = LoroDoc.fromSnapshot(doc.export({ mode: "snapshot" }));
    other.setPeerId(peer);
    return other;
}

/** Sends `from`'s changes that `to` lacks. */
export function sync(from: LoroDoc, to: LoroDoc) {
    to.import(from.export({ mode: "update", from: to.version() }));
}
