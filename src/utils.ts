import type { LoroDoc, LoroText } from "loro-crdt";

/**
 * Get the text from the document
 */
export const defaultGetTextFromDoc = (doc: LoroDoc): LoroText => {
    return doc.getText("codemirror");
};
