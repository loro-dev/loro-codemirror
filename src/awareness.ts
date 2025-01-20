import {
    EditorView,
    PluginValue,
    ViewUpdate,
    layer,
    LayerMarker,
    Rect,
    Direction,
    RectangleMarker,
} from "@codemirror/view";
import {
    Awareness,
    AwarenessListener,
    Cursor,
    LoroDoc,
    PeerID,
    Subscription,
} from "loro-crdt";
import {
    Annotation,
    EditorSelection,
    Extension,
    Facet,
    SelectionRange,
    StateEffect,
    StateField,
} from "@codemirror/state";
import { getTextFromDoc } from "./sync";

export const loroCursorTheme = EditorView.baseTheme({
    ".loro-cursor": {
        position: "absolute",
        width: "2px",
        display: "inline-block",
        height: "1.2em",
    },
    ".loro-cursor::before": {
        position: "absolute",
        top: "1.3em",
        left: "0",
        content: "var(--name)",
        padding: "2px 6px",
        fontSize: "12px",
        borderRadius: "3px",
        whiteSpace: "nowrap",
        userSelect: "none",
        opacity: "0.7",
    },
    ".loro-selection": {
        opacity: "0.5",
    },
});

export type AwarenessState =
    | {
          type: "update";
          uid: string;
          cursor: { anchor?: Uint8Array; head: Uint8Array };
          user?: {
              name: string;
              colorClassName: string;
          };
      }
    | {
          type: "delete";
          uid: string;
      };

export interface UserState {
    name: string;
    colorClassName: string;
}

type CursorEffect =
    | {
          type: "update";
          peer: string;
          cursor: { anchor?: number; head: number };
          user?: UserState;
      }
    | {
          type: "delete";
          peer: string;
      }
    | {
          type: "checkout";
          checkout: boolean;
      };

// We should use layer https://github.com/codemirror/dev/issues/989
export const remoteAwarenessAnnotation = Annotation.define<undefined>();
export const remoteAwarenessEffect = StateEffect.define<CursorEffect>();
export const remoteAwarenessStateField = StateField.define<{
    remoteCursors: Map<string, CursorPosition>;
    isCheckout: boolean;
}>({
    create() {
        return { remoteCursors: new Map(), isCheckout: false };
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(remoteAwarenessEffect)) {
                switch (effect.value.type) {
                    case "update":
                        const { peer: uid, user, cursor } = effect.value;
                        value.remoteCursors.set(uid, {
                            uid,
                            cursor,
                            user,
                        });
                        break;
                    case "delete":
                        value.remoteCursors.delete(effect.value.peer);
                        break;
                    case "checkout":
                        value.isCheckout = effect.value.checkout;
                }
            }
        }
        return value;
    },
});

const isRemoteCursorUpdate = (update: ViewUpdate): boolean => {
    const effect = update.transactions
        .flatMap((transaction) => transaction.effects)
        .filter((effect) => effect.is(remoteAwarenessEffect));
    return update.docChanged || update.viewportChanged || effect.length > 0;
};

export const createCursorLayer = (): Extension => {
    return layer({
        above: true,
        class: "loro-cursor-layer",
        update: isRemoteCursorUpdate,
        markers: (view) => {
            const { remoteCursors: remoteStates, isCheckout } =
                view.state.field(remoteAwarenessStateField);
            if (isCheckout) {
                return [];
            }
            return Array.from(remoteStates.values()).flatMap((state) => {
                const selectionRange = EditorSelection.cursor(
                    state.cursor.head
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
                view.state.field(remoteAwarenessStateField);
            if (isCheckout) {
                return [];
            }
            return Array.from(remoteStates.entries())
                .filter(
                    ([_, state]) =>
                        state.cursor.anchor !== undefined &&
                        state.cursor.anchor !== state.cursor.head
                )
                .flatMap(([_, state]) => {
                    const selectionRange = EditorSelection.range(
                        state.cursor.anchor as number,
                        state.cursor.head
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

/**
 * Renders a blinking cursor to indicate the cursor of another user.
 */
export class RemoteCursorMarker implements LayerMarker {
    constructor(
        private left: number,
        private top: number,
        private height: number,
        private name: string,
        private colorClassName: string
    ) {}

    draw(): HTMLElement {
        const elt = document.createElement("div");
        this.adjust(elt);
        return elt;
    }

    update(elt: HTMLElement): boolean {
        this.adjust(elt);
        return true;
    }

    adjust(element: HTMLElement) {
        element.style.left = `${this.left}px`;
        element.style.top = `${this.top}px`;
        element.style.height = `${this.height}px`;
        element.className = `loro-cursor ${this.colorClassName}`;
        element.style.setProperty("--name", `"${this.name}"`);
    }

    eq(other: RemoteCursorMarker): boolean {
        return (
            this.left === other.left &&
            this.top === other.top &&
            this.height === other.height &&
            this.name === other.name
        );
    }

    public static createCursor(
        view: EditorView,
        position: SelectionRange,
        displayName: string,
        colorClassName: string
    ): RemoteCursorMarker[] {
        const absolutePosition = this.calculateAbsoluteCursorPosition(
            position,
            view
        );
        if (!absolutePosition) {
            return [];
        }
        const rect = view.scrollDOM.getBoundingClientRect();
        const left =
            view.textDirection == Direction.LTR
                ? rect.left
                : rect.right - view.scrollDOM.clientWidth;
        const baseLeft = left - view.scrollDOM.scrollLeft;
        const baseTop = rect.top - view.scrollDOM.scrollTop;
        return [
            new RemoteCursorMarker(
                absolutePosition.left - baseLeft,
                absolutePosition.top - baseTop,
                absolutePosition.bottom - absolutePosition.top,
                displayName,
                colorClassName
            ),
        ];
    }

    private static calculateAbsoluteCursorPosition(
        position: SelectionRange,
        view: EditorView
    ): Rect | null {
        const cappedPositionHead = Math.max(
            0,
            Math.min(view.state.doc.length, position.head)
        );
        return view.coordsAtPos(cappedPositionHead, position.assoc || 1);
    }
}

const parseAwarenessUpdate = (
    doc: LoroDoc,
    awareness: Awareness<AwarenessState>,
    arg: {
        updated: PeerID[];
        added: PeerID[];
        removed: PeerID[];
    }
): StateEffect<CursorEffect>[] => {
    const effects = [];
    const { updated, added, removed } = arg;
    for (const update of updated.concat(added)) {
        const effect = getEffects(doc, awareness, update);
        if (effect) {
            effects.push(effect);
        }
    }
    return effects;
};

const getEffects = (
    doc: LoroDoc,
    awareness: Awareness<AwarenessState>,
    peer: PeerID
): StateEffect<CursorEffect> | undefined => {
    const states = awareness.getAllStates();
    const state = states[peer];
    if (!state) {
        return;
    }
    if (peer === doc.peerIdStr) {
        return;
    }

    if (state.type === "delete") {
        return remoteAwarenessEffect.of({
            type: "delete",
            peer: state.uid,
        });
    }

    const head = Cursor.decode(state.cursor.head);
    const headPos = doc.getCursorPos(head).offset;
    let anchorPos = headPos;
    if (state.cursor.anchor) {
        // range
        const anchor = Cursor.decode(state.cursor.anchor);
        anchorPos = doc.getCursorPos(anchor).offset;
    }
    return remoteAwarenessEffect.of({
        type: "update",
        peer: state.uid,
        cursor: { anchor: anchorPos, head: headPos },
        user: state.user,
    });
};

export interface CursorPosition {
    uid: string;
    cursor: { anchor?: number; head: number };
    user?: UserState;
}

export class LoroAwarenessPlugin implements PluginValue {
    sub: Subscription;

    constructor(
        public view: EditorView,
        public doc: LoroDoc,
        public user: UserState,
        public awareness: Awareness<AwarenessState>
    ) {
        // const selection = this.view.state.selection.main;
        // const cursorState = getCursorState(
        //     doc,
        //     selection.head,
        //     selection.anchor
        // );
        // this.awareness.setLocalState({
        //     type: "update",
        //     uid: this.doc.peerIdStr,
        //     cursor: cursorState,
        //     user,
        // });
        this.sub = this.doc.subscribe((e) => {
            if (e.by === "local") {
                // update remote cursor position
                const effects = [];
                for (const peer of this.awareness.peers()) {
                    const effect = getEffects(this.doc!, this.awareness, peer);
                    if (effect) {
                        effects.push(effect);
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
                selection.head,
                selection.anchor
            );
            this.awareness.setLocalState({
                type: "update",
                uid: this.doc.peerIdStr,
                cursor: cursorState,
                user: this.user,
            });
        } else {
            // when checkout or blur
            this.awareness.setLocalState({
                type: "delete",
                uid: this.doc.peerIdStr,
            });
        }
    }

    destroy(): void {
        this.sub?.();
        this.awareness.setLocalState({
            type: "delete",
            uid: this.doc.peerIdStr,
        });
    }
}
export class RemoteAwarenessPlugin implements PluginValue {
    _awarenessListener?: AwarenessListener;
    constructor(
        public view: EditorView,
        public doc: LoroDoc,
        public awareness: Awareness<AwarenessState>
    ) {
        const listener: AwarenessListener = async (arg, origin) => {
            if (origin === "local") return;
            this.view.dispatch({
                effects: parseAwarenessUpdate(this.doc, this.awareness, arg),
            });
        };
        this._awarenessListener = listener;
        this.awareness.addListener(listener);
    }

    destroy(): void {
        if (this._awarenessListener)
            this.awareness.removeListener(this._awarenessListener);
    }
}

const getCursorState = (doc: LoroDoc, head: number, anchor?: number) => {
    if (anchor === head) {
        anchor = undefined;
    }
    const headCursor = getTextFromDoc(doc).getCursor(head)?.encode();
    if (!headCursor) {
        throw new Error("cursor head not found");
    }
    let anchorCursor = undefined;
    if (anchor) {
        anchorCursor = getTextFromDoc(doc).getCursor(anchor)?.encode();
    }
    return {
        anchor: anchorCursor,
        head: headCursor,
    };
};
