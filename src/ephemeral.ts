import { layer, RectangleMarker, type EditorView, type PluginValue, type ViewUpdate } from "@codemirror/view";
import { Cursor, EphemeralStore, LoroDoc, LoroText, type Subscription } from "loro-crdt";
import { getCursorState, type UserState, type CursorState, remoteAwarenessEffect, type CursorPosition, RemoteCursorMarker } from "./awareness.ts";
import { EditorSelection, StateEffect, StateField, type Extension } from "@codemirror/state";


export const ephemeralEffect = StateEffect.define<EphemeralEffect>();
export const ephemeralStateField = StateField.define<{
    remoteCursors: Map<string, CursorPosition>;
    isCheckout: boolean;
}>({
    create() {
        return { remoteCursors: new Map(), isCheckout: false };
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(ephemeralEffect)) {
                switch (effect.value.type) {
                    case "update":
                        const { peer, cursor, user } = effect.value;
                        if (cursor) {
                            value.remoteCursors.set(peer, { cursor, user });
                        } else {
                            value.remoteCursors.delete(peer);
                        }
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
    type: "update";
    peer: string;
    cursor?: { anchor: number; head?: number };
    user?: UserState;
} | {
    type: "checkout";
    checkout: boolean;
}

const getCursorEffect = (
    doc: LoroDoc,
    peer: string,
    state: CursorState,
    user?: UserState,
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
        type: "update",
        peer,
        cursor: { anchor: anchorPos, head: headPos },
        user,
    });
}

const STATE_KEY = "cm-state";
export type EphemeralState = {
    [key: `${string}-cm-state`]: { cursor: CursorState, user?: UserState };
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
            const { remoteCursors: remoteStates, isCheckout } =
                view.state.field(ephemeralStateField);
            if (isCheckout) {
                return [];
            }
            console.log("remoteStates:", remoteStates)
            return Array.from(remoteStates.values()).flatMap((state) => {
                const selectionRange = EditorSelection.cursor(
                    state.cursor.anchor
                );
                return RemoteCursorMarker.createCursor(
                    view,
                    selectionRange,
                    state.user?.name || "unknown",
                    state.user?.colorClassName || ""
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
            const { remoteCursors: remoteStates, isCheckout } =
                view.state.field(ephemeralStateField);
            if (isCheckout) {
                return [];
            }
            return Array.from(remoteStates.entries())
                .filter(
                    ([_, state]) =>
                        state.cursor.head !== undefined &&
                        state.cursor.anchor !== state.cursor.head
                )
                .flatMap(([_, state]) => {
                    const selectionRange = EditorSelection.range(
                        state.cursor.anchor,
                        state.cursor.head!
                    );
                    const markers = RectangleMarker.forRange(
                        view,
                        `loro-selection ${state.user?.colorClassName || ""}`,
                        selectionRange
                    );
                    return markers;
                });
        },
    });

export class EphemeralPlugin implements PluginValue {
    sub: Subscription;
    ephemeralSub: Subscription;

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
                const effects = [];
                for (const peer of remoteStates.keys()) {
                    if (peer === this.doc.peerIdStr) {
                        continue;
                    }
                    const state = this.ephemeralStore.get(`${peer}-${STATE_KEY}`);
                    if (state) {
                        const effect = getCursorEffect(this.doc, peer, state.cursor, state.user);
                        if (effect) {
                            effects.push(effect);
                        }
                    } else {
                        effects.push(ephemeralEffect.of({
                            type: "update",
                            peer,
                            cursor: undefined,
                        }));
                    }
                }
                this.view.dispatch({
                    effects,
                });
            } else if (e.by === "checkout") {
                // TODO: better way
                this.view.dispatch({
                    effects: [
                        remoteAwarenessEffect.of({
                            type: "checkout",
                            checkout: this.doc.isDetached(),
                        }),
                    ],
                });
            }
        });

        this.ephemeralSub = this.ephemeralStore.subscribe((e) => {
            if (e.by === "local") return;
            const effects = [];
            for (const key of e.added.concat(e.updated)) {
                const peer = key.split("-")[0];
                if (key.endsWith(`-${STATE_KEY}`)) {
                    const state = this.ephemeralStore.get(key as keyof EphemeralState)!;
                    const effect = getCursorEffect(this.doc, peer, state.cursor, state.user);
                    if (effect) {
                        effects.push(effect);
                    }
                }
            }

            for (const key of e.removed) {
                const peer = key.split("-")[0];
                if (key.endsWith(`-${STATE_KEY}`)) {
                    effects.push(ephemeralEffect.of({
                        type: "update",
                        peer,
                        cursor: undefined,
                        user: undefined,
                    }));
                }
            }

            this.view.dispatch({
                effects
            })
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
            this.ephemeralStore.set(`${this.doc.peerIdStr}-${STATE_KEY}`, { cursor: cursorState, user: this.user });
        } else {
            // when checkout or blur
            // this.ephemeralStore.delete(`${this.doc.peerIdStr}-${STATE_KEY}`);
        }
    }

    destroy(): void {
        this.sub?.();
        this.ephemeralSub?.();
        this.ephemeralStore.delete(`${this.doc.peerIdStr}-${STATE_KEY}`);
    }
}
