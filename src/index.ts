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

export const LoroSyncPlugin = (doc: LoroDoc): Extension => {
    return ViewPlugin.define((view) => new LoroSyncPluginValue(view, doc));
};

export const LoroAwarenessPlugin = (
    doc: LoroDoc,
    awareness: Awareness,
    user: UserState
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
                    awareness as Awareness<AwarenessState>
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
    awareness?: { user: UserState; awareness: Awareness },
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
                        awareness.awareness as Awareness<AwarenessState>
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
