import { type Extension, Prec } from "@codemirror/state";
import { Awareness, LoroDoc, UndoManager } from "loro-crdt";
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

export { undo, redo } from "./undo.ts";
export { getTextFromDoc } from "./sync.ts";

/**
 * It is used to sync the document with the remote users.
 * 
 * @param doc - LoroDoc instance
 * @returns Extension
 */
export const LoroSyncPlugin = (doc: LoroDoc): Extension => {
    return ViewPlugin.define((view) => new LoroSyncPluginValue(view, doc));
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
    getUserId?: () => string
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
                    getUserId
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
    undoManager: UndoManager
): Extension[] => {
    return [
        undoManagerStateField.init(() => undoManager),
        Prec.high(keymap.of([...undoKeyMap])),
        ViewPlugin.define(
            (view) => new UndoPluginValue(view, doc, undoManager)
        ),
    ];
};

export function LoroExtensions(
    doc: LoroDoc,
    awareness?: { user: UserState; awareness: Awareness; getUserId?: () => string },
    undoManager?: UndoManager
): Extension {
    let extension = [
        ViewPlugin.define((view) => new LoroSyncPluginValue(view, doc))
            .extension,
    ];
    if (undoManager) {
        extension = extension.concat([
            undoManagerStateField.init(() => undoManager),
            Prec.high(keymap.of([...undoKeyMap])),
            ViewPlugin.define(
                (view) => new UndoPluginValue(view, doc, undoManager)
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
                        awareness.getUserId
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
