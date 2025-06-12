import { layer, RectangleMarker, type EditorView, type PluginValue, type ViewUpdate } from "@codemirror/view";
import { Cursor, EphemeralStore, LoroDoc, LoroText, type Subscription } from "loro-crdt";
import { getCursorState, type UserState, type CursorState, remoteAwarenessEffect, type CursorPosition, RemoteCursorMarker } from "./awareness.ts";
import { EditorSelection, StateEffect, StateField, type Extension } from "@codemirror/state";

export const ephemeralEffect = StateEffect.define<EphemeralEffect>();
export const ephemeralStateField = StateField.define<{
    remoteCursors: Map<string, { anchor: number; head?: number }>;
    remoteUsers: Map<string, UserState | undefined>;
    isCheckout: boolean;
}>({
    create() {
        return { remoteCursors: new Map(), remoteUsers: new Map(), isCheckout: false };
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(ephemeralEffect)) {
                switch (effect.value.type) {
                    case "delete":
                        value.remoteCursors.delete(effect.value.peer);
                        break;
                    case "cursor":
                        const { peer, cursor } = effect.value;
                        value.remoteCursors.set(peer, cursor);
                        break;
                    case "user":
                        const { peer: uid, user } = effect.value;
                        value.remoteUsers.set(uid, user);
                        break;
                    case "checkout":
                        value.isCheckout = effect.value.checkout;
                }
            }
        }
        return value;
    },
});

type EphemeralEffect = {
    type: "delete";
    peer: string;
} | {
    type: "cursor";
    peer: string;
    cursor: { anchor: number; head?: number };
} | {
    type: "user";
    peer: string;
    user?: UserState;
} | {
    type: "checkout";
    checkout: boolean;
}

const getCursorEffect = (
    doc: LoroDoc,
    peer: string,
    state: CursorState,
): StateEffect<EphemeralEffect> | undefined => {
    const anchor = Cursor.decode(state.anchor);
    const anchorPos = doc.getCursorPos(anchor).offset;
    let headPos = anchorPos;
    if (state.head) {
        // range
        const head = Cursor.decode(state.head);
        headPos = doc.getCursorPos(head).offset;
    }
    return ephemeralEffect.of({
        type: "cursor",
        peer,
        cursor: { anchor: anchorPos, head: headPos },
    });
}

export type EphemeralState = {
    [key: `${string}-cm-cursor`]: CursorState;
    [key: `${string}-cm-user`]: UserState | undefined;
};

const isRemoteCursorUpdate = (update: ViewUpdate): boolean => {
    const effect = update.transactions
        .flatMap((transaction) => transaction.effects)
        .filter((effect) => effect.is(ephemeralEffect));
    return update.docChanged || update.viewportChanged || effect.length > 0;
};

export const createCursorLayer = (): Extension => {
    return layer({
        above: true,
        class: "loro-cursor-layer",
        update: isRemoteCursorUpdate,
        markers: (view) => {
            const { remoteCursors, remoteUsers, isCheckout } =
                view.state.field(ephemeralStateField);
            if (isCheckout) {
                return [];
            }
            return Array.from(remoteCursors.entries()).flatMap(([peer, state]) => {
                const selectionRange = EditorSelection.cursor(
                    state.anchor
                );
                const user = remoteUsers.get(peer);
                return RemoteCursorMarker.createCursor(
                    view,
                    selectionRange,
                    user?.name || "unknown",
                    user?.colorClassName || ""
                );
            });
        },
    });
};

export const createSelectionLayer = (): Extension =>
    layer({
        above: false,
        class: "loro-selection-layer",
        update: isRemoteCursorUpdate,
        markers: (view) => {
            const { remoteCursors, remoteUsers, isCheckout } =
                view.state.field(ephemeralStateField);
            if (isCheckout) {
                return [];
            }
            return Array.from(remoteCursors.entries())
                .filter(
                    ([_, state]) =>
                        state.head !== undefined &&
                        state.anchor !== state.head
                )
                .flatMap(([peer, state]) => {
                    const user = remoteUsers.get(peer);
                    const selectionRange = EditorSelection.range(
                        state.anchor,
                        state.head!
                    );
                    const markers = RectangleMarker.forRange(
                        view,
                        `loro-selection ${user?.colorClassName || ""}`,
                        selectionRange
                    );
                    return markers;
                });
        },
    });

export class EphemeralPlugin implements PluginValue {
    sub: Subscription;
    ephemeralSub: Subscription;
    initUser: boolean = false;

    constructor(
        public view: EditorView,
        public doc: LoroDoc,
        public user: UserState,
        public ephemeralStore: EphemeralStore<EphemeralState>,
        private getTextFromDoc: (doc: LoroDoc) => LoroText
    ) {
        this.sub = this.doc.subscribe((e) => {
            if (e.by === "local") {
                // update remote cursor position
                const { remoteCursors: remoteStates, isCheckout } =
                    view.state.field(ephemeralStateField);
                if (isCheckout) return;
                const effects: StateEffect<EphemeralEffect>[] = [];
                for (const peer of remoteStates.keys()) {
                    if (peer === this.doc.peerIdStr) {
                        continue;
                    }
                    const state = this.ephemeralStore.get(`${peer}-cm-cursor`);
                    if (state) {
                        const effect = getCursorEffect(this.doc, peer, state);
                        if (effect) {
                            effects.push(effect);
                        }
                    } else {
                        effects.push(ephemeralEffect.of({
                            type: "delete",
                            peer,
                        }));
                    }
                }
                if (effects.length > 0) {
                    // Defer the dispatch to avoid conflicts with ongoing updates
                    requestAnimationFrame(() => {
                        this.view.dispatch({
                            effects,
                        });
                    });
                }
            } else if (e.by === "checkout") {
                // TODO: better way
                requestAnimationFrame(() => {
                    this.view.dispatch({
                        effects: [
                            ephemeralEffect.of({
                                type: "checkout",
                                checkout: this.doc.isDetached(),
                            }),
                        ],
                    });
                });
            }
        });

        this.ephemeralSub = this.ephemeralStore.subscribe((e) => {
            if (e.by === "local") return;
            const effects: StateEffect<EphemeralEffect>[] = [];
            for (const key of e.added.concat(e.updated)) {
                const peer = key.split("-")[0];
                if (key.endsWith(`-cm-cursor`)) {
                    const state = this.ephemeralStore.get(key as keyof EphemeralState)! as CursorState;
                    const effect = getCursorEffect(this.doc, peer, state);
                    if (effect) {
                        effects.push(effect);
                    }
                }
                if (key.endsWith(`-cm-user`)) {
                    const user = this.ephemeralStore.get(key as keyof EphemeralState)! as UserState;
                    effects.push(ephemeralEffect.of({
                        type: "user",
                        peer,
                        user
                    }));
                }
            }

            for (const key of e.removed) {
                const peer = key.split("-")[0];
                if (key.endsWith(`-cm-cursor`)) {
                    effects.push(ephemeralEffect.of({
                        type: "delete",
                        peer,
                    }));
                }
            }

            if (effects.length > 0) {
                // Defer the dispatch to avoid conflicts with ongoing updates
                requestAnimationFrame(() => {
                    this.view.dispatch({
                        effects
                    })
                });
            }
        })
    }

    update(update: ViewUpdate): void {
        if (
            !update.selectionSet &&
            !update.focusChanged &&
            !update.docChanged
        ) {
            return;
        }
        const selection = update.state.selection.main;
        if (this.view.hasFocus && !this.doc.isDetached()) {
            const cursorState = getCursorState(
                this.doc,
                selection.anchor,
                selection.head,
                this.getTextFromDoc
            );
            this.ephemeralStore.set(`${this.doc.peerIdStr}-cm-cursor`, cursorState);
            if (!this.initUser) {
                this.ephemeralStore.set(`${this.doc.peerIdStr}-cm-user`, this.user);
                this.initUser = true;
            }
        } else {
            // when checkout or blur
            this.ephemeralStore.delete(`${this.doc.peerIdStr}-cm-cursor`);
        }
    }

    destroy(): void {
        this.sub?.();
        this.ephemeralSub?.();
        this.ephemeralStore.delete(`${this.doc.peerIdStr}-cm-cursor`);
        this.ephemeralStore.delete(`${this.doc.peerIdStr}-cm-user`);
    }
}
