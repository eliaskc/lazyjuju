import { afterEach, describe, expect, it } from "bun:test"
import {
    getEditorArguments,
    getPreferredEditor,
    shouldSuspendForEditor,
} from "../../../src/utils/editor"

const originalVisual = process.env.VISUAL
const originalEditor = process.env.EDITOR
const originalSuspend = process.env.KAJJI_EDITOR_SUSPEND

afterEach(() => {
    if (originalVisual === undefined) delete process.env.VISUAL
    else process.env.VISUAL = originalVisual

    if (originalEditor === undefined) delete process.env.EDITOR
    else process.env.EDITOR = originalEditor

    if (originalSuspend === undefined) delete process.env.KAJJI_EDITOR_SUSPEND
    else process.env.KAJJI_EDITOR_SUSPEND = originalSuspend
})

describe("getPreferredEditor", () => {
    it("uses VISUAL when both VISUAL and EDITOR are set", () => {
        process.env.VISUAL = "code --wait"
        process.env.EDITOR = "nvim"

        expect(getPreferredEditor()).toBe("code --wait")
    })

    it("uses EDITOR when VISUAL is not set", () => {
        delete process.env.VISUAL
        process.env.EDITOR = "nvim"

        expect(getPreferredEditor()).toBe("nvim")
    })

    it("falls back to vi when neither VISUAL nor EDITOR is set", () => {
        delete process.env.VISUAL
        delete process.env.EDITOR

        expect(getPreferredEditor()).toBe("vi")
    })
})

describe("getEditorArguments", () => {
    it("uses +line for Vim-style editors", () => {
        expect(getEditorArguments(["src/app.ts"], "nvim", 42)).toEqual(["+42", "src/app.ts"])
    })

    it("uses --goto for VS Code-style editors", () => {
        expect(getEditorArguments(["src/app.ts"], "code --wait", 42)).toEqual([
            "--goto",
            "src/app.ts:42",
        ])
    })

    it("does not apply one position to multiple files", () => {
        expect(getEditorArguments(["one.ts", "two.ts"], "nvim", 42)).toEqual(["one.ts", "two.ts"])
    })
})

describe("shouldSuspendForEditor", () => {
    it("does not suspend for GUI editors", () => {
        expect(shouldSuspendForEditor("code --wait")).toBe(false)
    })

    it("suspends for terminal editors", () => {
        expect(shouldSuspendForEditor("nvim")).toBe(true)
    })
})
