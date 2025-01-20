# CodeMirror Plugin Template

这是一个 CodeMirror 6 插件模板项目。

## 安装

```bash
npm install
```

## 开发

```bash
npm run dev
```

## 构建

```bash
npm run build
```

## 使用方法

```typescript
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { myPluginExtension } from "codemirror-plugin-template";

// 创建编辑器
const editor = new EditorView({
    state: EditorState.create({
        extensions: [
            // ... 其他扩展
            myPluginExtension(),
        ],
    }),
    parent: document.body,
});
```

## 自定义开发

1. 在 `src/index.ts` 中实现你的插件逻辑
2. 修改 `package.json` 中的项目信息
3. 根据需要添加其他依赖
