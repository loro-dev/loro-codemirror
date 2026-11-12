// @vitest-environment jsdom
import { LoroDoc } from "loro-crdt";
import { afterEach, describe, expect, test } from "vitest";
import { LoroSyncPlugin } from "../src/index.ts";
import { makeView, tick, type } from "./helpers.ts";

afterEach(() => {
    document.body.innerHTML = "";
});

describe("binding", () => {
    test.each([
        ["the editor already holds the doc's text", "hello", "hello"],
        ["both are empty", "", ""],
        ["the editor is filled from the doc", "", "hello"],
    ])("the first edit reaches the doc when %s", async (_, editor, seed) => {
        const doc = new LoroDoc();
        doc.getText("codemirror").insert(0, seed);
        doc.commit();
        const view = makeView(editor, LoroSyncPlugin(doc));
        await tick();

        type(view, view.state.doc.length, "!");
        expect(doc.getText("codemirror").toString()).toBe(seed + "!");
        expect(view.state.doc.toString()).toBe(seed + "!");
    });
});
