import { useEffect, useRef, useState } from "react";
import "./App.css";
import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import {
    getTextFromDoc,
    LoroEphemeralPlugin,
    LoroExtensions,
    LoroSyncPlugin,
    LoroUndoPlugin,
    type UserState,
} from "loro-codemirror";
import { EphemeralStore, LoroDoc, UndoManager } from "loro-crdt";
import { getUserEphemeralKey } from "../../dist/ephemeral";

type EditorVariant = "primary" | "secondary";

interface CollaborativeEditorProps {
    title: string;
    user: UserState;
    doc: LoroDoc;
    ephemeral: EphemeralStore;
    undoManager: UndoManager;
    variant: EditorVariant;
}

const baseExtensions = [
    EditorView.theme({
        "&": { height: "100%", fontSize: "18px" },
    }),
    basicSetup,
    javascript({ typescript: true }),
];

const USER1: UserState = { name: "User 1", colorClassName: "user1" };
const USER2: UserState = { name: "User 2", colorClassName: "user2" };

const CollaborativeEditor = ({
    title,
    user,
    doc,
    ephemeral,
    undoManager,
    variant,
}: CollaborativeEditorProps) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!containerRef.current) {
            return undefined;
        }

        const variantExtensions =
            variant === "primary"
                ? [
                      LoroExtensions(
                          doc,
                          {
                              user,
                              ephemeral,
                          },
                          undoManager
                      ),
                  ]
                : [
                      LoroSyncPlugin(doc),
                      LoroEphemeralPlugin(doc, ephemeral, user),
                      LoroUndoPlugin(doc, undoManager),
                  ];

        const view = new EditorView({
            state: EditorState.create({
                extensions: [...baseExtensions, ...variantExtensions],
            }),
            parent: containerRef.current,
        });

        return () => {
            view.destroy();
        };
    }, [doc, ephemeral, undoManager, user.name, user.colorClassName, variant]);

    return (
        <div className="editor-wrapper">
            <h2 className="editor-heading">
                {title}
                <span className={`editor-badge ${user.colorClassName}`}>
                    {user.name}
                </span>
            </h2>
            <div ref={containerRef} className="editor" />
        </div>
    );
};

const doc1 = new LoroDoc();
const doc2 = new LoroDoc();
const ephemeral1 = new EphemeralStore();
const ephemeral2 = new EphemeralStore();
const undoManager1 = new UndoManager(doc1, {});
const undoManager2 = new UndoManager(doc2, {});

// @ts-ignore
const unsubscribeDoc1 = doc1.subscribeLocalUpdates((update) => {
    doc2.import(update);
});

getTextFromDoc(doc1).insert(0, "hello");
doc1.commit();

// @ts-ignore
const unsubscribeDoc2 = doc2.subscribeLocalUpdates((update) => {
    doc1.import(update);
});

// @ts-ignore
const unsubscribeEphemeral1 = ephemeral1.subscribeLocalUpdates((update) => {
    ephemeral2.apply(update);
});

// @ts-ignore
const unsubscribeEphemeral2 = ephemeral2.subscribeLocalUpdates((update) => {
    ephemeral1.apply(update);
});

const App = () => {
    const [user2, setUser2] = useState(
        ephemeral2.get(getUserEphemeralKey(doc2)) as UserState | undefined
    );

    return (
        <>
            <div className="header">
                <h1>Loro CodeMirror Plugin</h1>
                <p>
                    Two synchronized editors using the Loro collaborative
                    editing extensions for CodeMirror.
                </p>
                <button
                    onClick={() => {
                        const changeUser = {
                            name: "Changed User",
                            colorClassName: "user3",
                        };
                        ephemeral2.set(getUserEphemeralKey(doc2), changeUser);
                        setUser2(changeUser);
                    }}
                >
                    Change User2 Info
                </button>
            </div>
            <div className="editor-container">
                <CollaborativeEditor
                    title="Editor 1"
                    user={USER1}
                    doc={doc1}
                    ephemeral={ephemeral1}
                    undoManager={undoManager1}
                    variant="primary"
                />
                <CollaborativeEditor
                    title="Editor 2"
                    user={user2 || USER2}
                    doc={doc2}
                    ephemeral={ephemeral2}
                    undoManager={undoManager2}
                    variant="secondary"
                />
            </div>
        </>
    );
};

export default App;
