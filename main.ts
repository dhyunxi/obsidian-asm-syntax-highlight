import { Plugin } from "obsidian";

type TokenType =
	| "comment"
	| "keyword"
	| "register"
	| "decimal"
	| "memory"
	| "hexadecimal"
	| "label"
	| "directive"
	| "constant"
	| "string"
	| "separator";

interface TokenRule {
	regex: RegExp;
	token: TokenType;
}

const ASM_RULES: TokenRule[] = [
	{ regex: /^;.*/, token: "comment" },
	{ regex: /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/, token: "string" },
	{ regex: /^\b(?:mov|add|sub|imul|idiv|mul|div|and|or|xor|not|neg|inc|dec|cmp|test|jmp|je|jne|jz|jnz|jg|jl|jge|jle|call|ret|push|pop|leave|lea|nop|int|syscall|cld|std|rep|repe|repne)\b/i, token: "keyword" },
	{ regex: /^\b(?:rax|rbx|rcx|rdx|rsi|rdi|rsp|rbp|eax|ebx|ecx|edx|esi|edi|esp|ebp|ax|bx|cx|dx|si|di|sp|bp|al|bl|cl|dl|ah|bh|ch|dh|r8|r9|r1[0-5]|r8d|r9d|r1[0-5]d|r8w|r9w|r1[0-5]w|r8b|r9b|r1[0-5]b)\b/i, token: "register" },
	{ regex: /^\b(?:(?:byte|word|dword|qword|tword|oword|xmmword|ymmword|zmmword)\s+(?:ptr\s+)?)?\[.*?\]/i, token: "memory" },
	{ regex: /^\b[A-Z_][A-Z0-9_]*\b/, token: "constant" },
	{ regex: /^\.(?:text|data|bss|rodata|section|globl|global|extern|align|balign|p2align|org|type|size|endp|proc|code|stack|model|assume|byte|word|long|quad|octa|ascii|asciz|string|zero|space|skip|fill|db|dw|dd|dq|dt|equ|set|define|segment|ends|include)\b/i, token: "directive" },
	{ regex: /^,/, token: "separator" },
	{ regex: /^\b(?:0x[0-9A-Fa-f]+|(?:0[0-9A-Fa-f]*|[1-9][0-9A-Fa-f]*)h)\b/i, token: "hexadecimal" },
	{ regex: /^-?\d[\d_]*(?:\.\d[\d_]*)?(?:[Ee]-?\d[\d_]*)?/, token: "decimal" },
];

const LEGACY_ASM_RULES: TokenRule[] = [
	{ regex: /;.*/, token: "comment" },
	{ regex: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'):/, token: "label" },
	{ regex: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/, token: "string" },
	...ASM_RULES.filter((rule) => rule.token !== "comment" && rule.token !== "string").map((rule) => ({
		regex: new RegExp(rule.regex.source.slice(1), rule.regex.flags),
		token: rule.token,
	})),
];

export default class AsmSyntaxHighlightPlugin extends Plugin {
	private legacyModeInterval: number | null = null;

	async onload() {
		this.registerMarkdownCodeBlockProcessor("asm", (source, el) => {
			this.renderAsmCodeBlock(source, el);
		});

		this.registerLegacyCodeMirrorMode();
	}

	onunload() {
		if (this.legacyModeInterval !== null) {
			window.clearInterval(this.legacyModeInterval);
			this.legacyModeInterval = null;
		}

		const codeMirror = this.getLegacyCodeMirror();
		if (codeMirror?.modes?.asm) {
			delete codeMirror.modes.asm;
		}
	}

	private renderAsmCodeBlock(source: string, el: HTMLElement) {
		el.empty();
		el.addClass("asm-highlight");

		const pre = document.createElement("pre");
		const code = document.createElement("code");
		code.addClass("language-asm");

		const lines = source.split("\n");
		lines.forEach((line, index) => {
			this.appendHighlightedLine(code, line);
			if (index < lines.length - 1) {
				code.appendChild(document.createTextNode("\n"));
			}
		});

		pre.appendChild(code);
		el.appendChild(pre);
	}

	private appendHighlightedLine(parent: HTMLElement, line: string) {
		let remaining = line;
		const labelMatch = remaining.match(/^(\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[a-zA-Z_.$@?][a-zA-Z0-9_.$@?]*):)/);

		if (labelMatch?.[0]) {
			this.appendToken(parent, labelMatch[0], "label");
			remaining = remaining.slice(labelMatch[0].length);
		}

		while (remaining.length > 0) {
			const whitespace = remaining.match(/^\s+/);
			if (whitespace?.[0]) {
				parent.appendChild(document.createTextNode(whitespace[0]));
				remaining = remaining.slice(whitespace[0].length);
				continue;
			}

			const match = this.matchToken(remaining);
			if (match) {
				this.appendToken(parent, match.text, match.token);
				remaining = remaining.slice(match.text.length);
				continue;
			}

			const plainText = remaining.match(/^[a-zA-Z_.$@?][a-zA-Z0-9_.$@?]*/);
			if (plainText?.[0]) {
				parent.appendChild(document.createTextNode(plainText[0]));
				remaining = remaining.slice(plainText[0].length);
				continue;
			}

			parent.appendChild(document.createTextNode(remaining[0]));
			remaining = remaining.slice(1);
		}
	}

	private matchToken(text: string): { text: string; token: TokenType } | null {
		for (const rule of ASM_RULES) {
			const match = text.match(rule.regex);
			if (match?.[0]) {
				return { text: match[0], token: rule.token };
			}
		}

		return null;
	}

	private appendToken(parent: HTMLElement, text: string, token: TokenType) {
		const span = document.createElement("span");
		span.addClass(`cm-${token}`);
		span.setText(text);
		parent.appendChild(span);
	}

	private registerLegacyCodeMirrorMode() {
		const register = () => {
			const codeMirror = this.getLegacyCodeMirror();
			if (!codeMirror?.defineSimpleMode) {
				return false;
			}

			if (!codeMirror.modes?.asm) {
				codeMirror.defineSimpleMode("asm", {
					start: LEGACY_ASM_RULES,
				});
			}

			this.refreshLegacyEditors();
			return true;
		};

		if (register()) {
			return;
		}

		let attempts = 0;
		this.legacyModeInterval = window.setInterval(() => {
			if (register() && this.legacyModeInterval !== null) {
				window.clearInterval(this.legacyModeInterval);
				this.legacyModeInterval = null;
				return;
			}

			attempts += 1;
			if (attempts >= 50 && this.legacyModeInterval !== null) {
				window.clearInterval(this.legacyModeInterval);
				this.legacyModeInterval = null;
			}
		}, 100);

		this.registerInterval(this.legacyModeInterval);
	}

	private refreshLegacyEditors() {
		const workspace = this.app.workspace as unknown as {
			iterateCodeMirrors?: (callback: (cm: { getOption: (key: string) => unknown; setOption: (key: string, value: unknown) => void }) => void) => void;
		};

		workspace.iterateCodeMirrors?.((cm) => {
			cm.setOption("mode", cm.getOption("mode"));
		});
	}

	private getLegacyCodeMirror(): {
		defineSimpleMode?: (name: string, mode: unknown) => void;
		modes?: Record<string, unknown>;
	} | null {
		return (window as unknown as { CodeMirror?: { defineSimpleMode?: (name: string, mode: unknown) => void; modes?: Record<string, unknown> } }).CodeMirror ?? null;
	}
}
