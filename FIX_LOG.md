# 修复日志

## 2026-09-16

### 问题

- 带引号的符号标签没有被当作一个整体识别，例如 `"Derived::calc(int)":`。
- 字符串内容会继续参与指令关键字匹配，导致 `"Derived::calc(int)"` 中的 `int` 被误高亮。
- 字符串里的普通英文也会触发指令匹配，导致 `.quad "typeinfo for Derived"` 中 `for` 的 `or` 被误高亮。
- 普通标识符没有整体跳过，扫描器逐字符前进时存在把标识符内部片段误识别为数字、寄存器或指令的风险。
- `.quad` 等常见汇编伪指令没有被 directive 规则覆盖。
- `QWORD PTR [rbp-8]` 这类内存操作数会被拆成普通大写常量和局部片段，而不是作为完整 memory token。

### 修复

- 新增字符串 token 规则，双引号字符串会一次性作为字符串处理，内部文本不再继续高亮。
- 新增带引号标签规则，支持 `"symbol name":`、`"Derived::calc(int)":` 这类汇编输出中的标签形式。
- 字符串和带引号标签同时支持双引号与单引号形式。
- 普通标识符现在会作为纯文本整体跳过，避免对子串进行误匹配。
- 扩展 directive 列表，加入 `.quad`、`.long`、`.ascii`、`.asciz`、`.string`、`.zero`、`.space`、`.skip`、`.fill` 等常见伪指令。
- 扩展 memory 规则，支持 `BYTE/WORD/DWORD/QWORD/... PTR [...]` 以及裸 `[...]`。
- 旧版 CodeMirror 兼容规则同步加入字符串与带引号标签处理。
- 为字符串 token 增加 `cm-string` 样式。

### 验证

- `npm run build` 通过后会重新生成 `main.js`。
- 重点验证样例：
  - `"Derived::calc(int)":` 中的 `int` 不应被高亮为指令。
  - `.quad "typeinfo for Derived"` 中的 `or` 不应被高亮为指令。
  - `int 0x80` 中独立的 `int` 仍应被高亮为指令。
