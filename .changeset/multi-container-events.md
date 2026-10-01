---
"loro-codemirror": patch
---

Keep an editor in step with a document that holds more than one container.

Three fixes, all of which only show up when the `LoroDoc` holds more than one
container -- a `LoroMap` of `LoroText`s, one per file, for example, where a
batch carries the map's event alongside the text's:

- The import handler returned from its event loop on the first event that was
  not this editor's text, so a batch carrying a map event dropped the text
  change with it. It now skips the foreign event and carries on.
- That loop dispatched inside itself while accumulating `changes` and `pos`
  outside, so a second event for the same text applied the whole accumulated
  list again -- the second application landing past the end of the document.
  It now dispatches once for the batch.
- `UndoPluginValue` walked an undo's events the same way, with the same two
  faults. An undo that never reached the view left the document and the view
  out of step by exactly the text taken back, so every later edit was computed
  against a view longer than the document.

Also: `update()` decided from `transactions[0]` whether a change came from the
plugin. A `ViewUpdate` can carry several transactions -- `dispatch(tr1, tr2)`
makes one, and CodeMirror queues a dispatch made while another update is
running -- and the annotated one need not be first. With one of the plugin's own
writes and one user edit in the same update, deciding once from the first
either wrote the change to the document twice or discarded the user's edit,
depending on order. It now decides per transaction.
