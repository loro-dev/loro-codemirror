// @vitest-environment jsdom
import { LoroDoc, UndoManager } from "loro-crdt";
import { afterEach, describe, expect, test } from "vitest";
import { LoroExtensions, redo, undo } from "../src/index.ts";
import { makeView, peerOf, sync, tick, type } from "./helpers.ts";

const text = (doc: LoroDoc) => doc.getText("codemirror");

describe("undo", () => {
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => errors.push(e.error);
    afterEach(() => {
        window.removeEventListener("error", onError);
        errors.length = 0;
        document.body.innerHTML = "";
    });

    test("undo after a remote edit keeps the editor equal to the doc", async () => {
        window.addEventListener("error", onError);
        const doc = new LoroDoc();
        doc.setPeerId(1n);
        text(doc).insert(0, "hello");
        doc.commit();
        const undoManager = new UndoManager(doc, {});
        const view = makeView("", LoroExtensions(doc, undefined, undoManager));
        await tick();
        expect(view.state.doc.toString()).toBe("hello");

        type(view, 5, " world");
        const remote = peerOf(doc, 2n);
        text(remote).insert(0, ">> ");
        remote.commit();
        sync(remote, doc);
        expect(view.state.doc.toString()).toBe(">> hello world");

        expect(undo(view)).toBe(true);
        await tick();
        expect(text(doc).toString()).toBe(">> hello");
        expect(view.state.doc.toString()).toBe(text(doc).toString());

        expect(redo(view)).toBe(true);
        await tick();
        expect(text(doc).toString()).toBe(">> hello world");
        expect(view.state.doc.toString()).toBe(text(doc).toString());

        // The editor still works afterwards.
        type(view, view.state.doc.length, "!");
        expect(text(doc).toString()).toBe(">> hello world!");
        expect(errors).toEqual([]);
    });

    test("the browser's own undo and redo go through Loro", async () => {
        const doc = new LoroDoc();
        const view = makeView(
            "",
            LoroExtensions(doc, undefined, new UndoManager(doc, {}))
        );
        await tick();
        type(view, 0, "hello");

        const input = (inputType: string) => {
            const event = new InputEvent("beforeinput", {
                inputType,
                bubbles: true,
                cancelable: true,
            });
            view.contentDOM.dispatchEvent(event);
            return event.defaultPrevented;
        };
        expect(input("historyUndo")).toBe(true);
        await tick();
        expect(text(doc).toString()).toBe("");
        expect(view.state.doc.toString()).toBe("");

        expect(input("historyRedo")).toBe(true);
        await tick();
        expect(text(doc).toString()).toBe("hello");
        expect(view.state.doc.toString()).toBe("hello");
    });
});
