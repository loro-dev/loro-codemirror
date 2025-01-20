import { Extension } from "@codemirror/state";
import { Awareness, LoroDoc, UndoConfig } from "loro-crdt";
import {
    createCursorLayer,
    createSelectionLayer,
    LoroAwarenessPlugin,
    remoteAwarenessStateField,
    RemoteAwarenessPlugin as RemoteAwarenessPlugin,
    UserState,
    AwarenessState,
    loroCursorTheme,
} from "./awareness";
import { LoroSyncPluginValue } from "./sync";
import { keymap, ViewPlugin } from "@codemirror/view";
import { undoKeyMap, undoManagerStateField, UndoPluginValue } from "./undo";

export function loroExtension(
    doc: LoroDoc,
    awareness?: { user: UserState; awareness: Awareness },
    undoConfig?: UndoConfig
): Extension {
    let extension = [
        ViewPlugin.define((view) => new LoroSyncPluginValue(view, doc))
            .extension,
    ];
    if (undoConfig) {
        extension = extension.concat([
            undoManagerStateField.extension,
            keymap.of([...undoKeyMap]),
            ViewPlugin.define(
                (view) => new UndoPluginValue(view, doc, undoConfig)
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
                    new LoroAwarenessPlugin(
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
    console.log(extension);

    return extension;
}
