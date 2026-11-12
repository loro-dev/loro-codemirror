---
"loro-codemirror": patch
---

Route the browser's own undo and redo (the Edit or context menu, or a shortcut no keymap took) through the Loro `UndoManager`. They arrive as `beforeinput` events and were not handled.
