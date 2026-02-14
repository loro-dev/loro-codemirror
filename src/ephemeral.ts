import {
    layer,
    RectangleMarker,
    type EditorView,
    type PluginValue,
    type ViewUpdate,
} from "@codemirror/view";
import {
    Cursor,
    EphemeralStore,
    LoroDoc,
    LoroText,
    type Subscription,
} from "loro-crdt";
import {
    getCursorState,
    type UserState,
    type CursorState,
    RemoteCursorMarker,
} from "./awareness.ts";
import {
    EditorSelection,
    SelectionRange,
    StateEffect,
    StateField,
    type Extension,
} from "@codemirror/state";

export const ephemeralEffect = StateEffect.define<EphemeralEffect>();
export const ephemeralStateField = StateField.define<{
    remoteCursors: Map<string, { anchor: number; head?: number }[]>;
    remoteUsers: Map<string, UserState | undefined>;
    isCheckout: boolean;
}>({
    create() {
        return {
            remoteCursors: new Map(),
            remoteUsers: new Map(),
            isCheckout: false,
        };
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(ephemeralEffect)) {
                switch (effect.value.type) {
                    case "delete":
                        value.remoteCursors.delete(effect.value.peer);
                        break;
                    case "cursor":
                        const { peer, cursors } = effect.value;
                        value.remoteCursors.set(peer, cursors);
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

type EphemeralEffect =
    | {
          type: "delete";
          peer: string;
      }
    | {
          type: "cursor";
          peer: string;
          cursors: { anchor: number; head?: number }[];
      }
    | {
          type: "user";
          peer: string;
          user?: UserState;
      }
    | {
          type: "checkout";
          checkout: boolean;
      };

const getCursorEffect = (
    doc: LoroDoc,
    peer: string,
    states: CursorState[]
): StateEffect<EphemeralEffect> | undefined => {
    let cursors = states.map(
        (state) => {
            const anchor = Cursor.decode(state.anchor);
            const anchorPos = doc.getCursorPos(anchor).offset;
            let headPos = anchorPos;
            if (state.head) {
                // range
                const head = Cursor.decode(state.head);
                headPos = doc.getCursorPos(head).offset;
            }
            
            return { anchor: anchorPos, head: headPos }
        }
    );
    
    return ephemeralEffect.of({
        type: "cursor",
        peer,
        cursors,
    });
};

export type EphemeralState = {
    [key: `${string}-cm-cursor`]: CursorState[];
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
            return Array.from(remoteCursors.entries()).flatMap(
          ([s, states]) => {
                        return states.map(
                            (state): [string, { anchor: number; head?: number; }] => [s, state]
                        )
                    }
                ).flatMap(
                ([peer, state]) => {
                    const selectionRange = EditorSelection.cursor(state.anchor);
                    const user = remoteUsers.get(peer);
                    return RemoteCursorMarker.createCursor(
                        view,
                        selectionRange,
                        user?.name || "unknown",
                        user?.colorClassName || ""
                    );
                }
            );
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
                .flatMap(
                    ([s, states]) => {
                        return states.map(
                            (state): [string, { anchor: number; head?: number; }] => [s, state]
                        )
                    }
                )
                .filter(
                    ([_, state]) =>
                        state.head !== undefined && state.anchor !== state.head
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
                    const states = this.ephemeralStore.get(`${peer}-cm-cursor`);
                    if (states && states.length > 0) {
                        const effect = getCursorEffect(this.doc, peer, states);
                        if (effect) {
                            effects.push(effect);
                        }
                    } else {
                        effects.push(
                            ephemeralEffect.of({
                                type: "delete",
                                peer,
                            })
                        );
                    }
                }
                if (effects.length > 0) {
                    // Defer the dispatch to avoid conflicts with ongoing updates
                    setTimeout(() => {
                        this.view.dispatch({
                            effects,
                        });
                    });
                }
            } else if (e.by === "checkout") {
                setTimeout(() => {
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
                if (key.endsWith(CURSOR_KEY)) {
                    const states = this.ephemeralStore.get(
                        key as keyof EphemeralState
                    )! as CursorState[];
                    
                    const effect = getCursorEffect(this.doc, peer, states);
                    if (effect) {
                        effects.push(effect);
                    }
                }
                if (key.endsWith(USER_KEY)) {
                    const user = this.ephemeralStore.get(
                        key as keyof EphemeralState
                    )! as UserState;
                    effects.push(
                        ephemeralEffect.of({
                            type: "user",
                            peer,
                            user,
                        })
                    );
                }
            }

            for (const key of e.removed) {
                const peer = key.split("-")[0];
                if (key.endsWith(CURSOR_KEY)) {
                    effects.push(
                        ephemeralEffect.of({
                            type: "delete",
                            peer,
                        })
                    );
                }
            }

            if (effects.length > 0) {
                // Defer the dispatch to avoid conflicts with ongoing updates
                setTimeout(() => {
                    this.view.dispatch({
                        effects,
                    });
                });
            }
        });
    }

    update(update: ViewUpdate): void {
        if (
            !update.selectionSet &&
            !update.focusChanged &&
            !update.docChanged
        ) {
            return;
        }
        
        if (this.view.hasFocus && !this.doc.isDetached()) {
            const cursors = update.state.selection.ranges.map(
                (selection) => {
                    return getCursorState(
                        this.doc,
                        selection.anchor,
                        selection.head,
                        this.getTextFromDoc
                    )
                }
            )
            
            this.ephemeralStore.set(
                getCursorEphemeralKey(this.doc),
                cursors
            );
            
            if (!this.initUser) {
                this.ephemeralStore.set(
                    getUserEphemeralKey(this.doc),
                    this.user
                );
                this.initUser = true;
            }
            
        } else {
            // when checkout or blur
            this.ephemeralStore.delete(getCursorEphemeralKey(this.doc));
        }
    }

    destroy(): void {
        this.sub?.();
        this.ephemeralSub?.();
        this.ephemeralStore.delete(getCursorEphemeralKey(this.doc));
        this.ephemeralStore.delete(getUserEphemeralKey(this.doc));
    }
}

const USER_KEY = "-cm-user";
const CURSOR_KEY = "-cm-cursor";
export const getUserEphemeralKey = (doc: LoroDoc) => {
    return `${doc.peerIdStr}${USER_KEY}` as const;
};
export const getCursorEphemeralKey = (doc: LoroDoc) => {
    return `${doc.peerIdStr}${CURSOR_KEY}` as const;
};
