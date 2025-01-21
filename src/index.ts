import { Extension, Prec } from "@codemirror/state";
import { Awareness, LoroDoc, UndoConfig, UndoManager } from "loro-crdt";
import {
    createCursorLayer,
    createSelectionLayer,
    AwarenessPlugin,
    remoteAwarenessStateField,
    RemoteAwarenessPlugin as RemoteAwarenessPlugin,
    UserState,
    AwarenessState,
    loroCursorTheme,
} from "./awareness";
import { LoroSyncPluginValue } from "./sync";
import { keymap, ViewPlugin } from "@codemirror/view";
import {
    undo,
    undoKeyMap,
    redo,
    undoManagerStateField,
    UndoPluginValue,
} from "./undo";

export { undo, redo };

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
        keymap.of([...undoKeyMap]),
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
