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

});
