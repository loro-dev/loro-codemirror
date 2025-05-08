import { type Extension, Prec } from "@codemirror/state";
import { Awareness, LoroDoc, LoroText, UndoManager } from "loro-crdt";
import {
    createCursorLayer,
    createSelectionLayer,
    AwarenessPlugin,
    remoteAwarenessStateField,
    RemoteAwarenessPlugin,
    type UserState,
    type AwarenessState,
    loroCursorTheme,
} from "./awareness.ts";
import { LoroSyncPluginValue } from "./sync.ts";
import { keymap, ViewPlugin } from "@codemirror/view";
import { undoKeyMap, undoManagerStateField, UndoPluginValue } from "./undo.ts";
import { defaultGetTextFromDoc } from "./utils.ts";

export { undo, redo } from "./undo.ts";

export { defaultGetTextFromDoc as getTextFromDoc };

/**
 * It is used to sync the document with the remote users.
 *
 * @param doc - LoroDoc instance
 * @returns Extension
 */
export const LoroSyncPlugin = (
    doc: LoroDoc,
    getTextFromDoc?: (doc: LoroDoc) => LoroText
): Extension => {
    return ViewPlugin.define(
        (view) =>
            new LoroSyncPluginValue(
                view,
                doc,
                getTextFromDoc ?? defaultGetTextFromDoc
            )
    );
};

/**
 * LoroAwarenessPlugin is a plugin that adds awareness to the editor.
 * It is used to sync the cursor position and selection of the editor with the remote users.
 *
 * @param doc - LoroDoc instance
 * @param awareness - Awareness instance
 * @param user - User info
 * @param getUserId - Function to get the user id. If not provided, the doc's peerId will be used.
 * @returns Extension[]
 */
export const LoroAwarenessPlugin = (
    doc: LoroDoc,
    awareness: Awareness,
    user: UserState,
    getUserId?: () => string,
    getTextFromDoc?: (doc: LoroDoc) => LoroText
): Extension[] => {
    return [
        remoteAwarenessStateField,
        createCursorLayer(),
        createSelectionLayer(),
        ViewPlugin.define(
            (view) =>
                new AwarenessPlugin(
                    view,
                    doc,
                    user,
                    awareness as Awareness<AwarenessState>,
                    getUserId,
                    getTextFromDoc ?? defaultGetTextFromDoc
                )
        ),
        ViewPlugin.define(
            (view) =>
                new RemoteAwarenessPlugin(
                    view,
                    doc,
                    awareness as Awareness<AwarenessState>
                )
        ),
        loroCursorTheme,
    ];
};

/**
 * LoroUndoPlugin is a plugin that adds undo/redo to the editor.
 *
 * @param doc - LoroDoc instance
 * @param undoManager - UndoManager instance
 * @returns Extension[]
 */
export const LoroUndoPlugin = (
    doc: LoroDoc,
    undoManager: UndoManager,
    getTextFromDoc?: (doc: LoroDoc) => LoroText
): Extension[] => {
    getTextFromDoc = getTextFromDoc ?? defaultGetTextFromDoc;
    return [
        undoManagerStateField.init(() => undoManager),
        Prec.high(keymap.of([...undoKeyMap])),
        ViewPlugin.define(
            (view) =>
                new UndoPluginValue(view, doc, undoManager, getTextFromDoc)
        ),
    ];
};

export function LoroExtensions(
    doc: LoroDoc,
    awareness?: {
        user: UserState;
        awareness: Awareness;
        getUserId?: () => string;
    },
    undoManager?: UndoManager,
    getTextFromDoc?: (doc: LoroDoc) => LoroText
): Extension {
    getTextFromDoc = getTextFromDoc ?? defaultGetTextFromDoc;

    let extension = [
        ViewPlugin.define(
            (view) => new LoroSyncPluginValue(view, doc, getTextFromDoc)
        ).extension,
    ];
    if (undoManager) {
        extension = extension.concat([
            undoManagerStateField.init(() => undoManager),
            Prec.high(keymap.of([...undoKeyMap])),
            ViewPlugin.define(
                (view) =>
                    new UndoPluginValue(view, doc, undoManager, getTextFromDoc)
            ).extension,
        ]);
    }
    if (awareness) {
        extension = extension.concat([
            remoteAwarenessStateField,
            createCursorLayer(),
            createSelectionLayer(),
            ViewPlugin.define(
                (view) =>
                    new AwarenessPlugin(
                        view,
                        doc,
                        awareness.user,
                        awareness.awareness as Awareness<AwarenessState>,
                        awareness.getUserId,
                        getTextFromDoc
                    )
            ),
            ViewPlugin.define(
                (view) =>
                    new RemoteAwarenessPlugin(
                        view,
                        doc,
                        awareness.awareness as Awareness<AwarenessState>
                    )
            ),
            loroCursorTheme,
        ]);
    }

    return extension;
}
