import { expect, test } from "bun:test"
import { prepareLineTokens, sliceTokens } from "../../src/diff/line-tokens"
import { buildRowWindow } from "../../src/diff/row-window"
import { computeWordDiff } from "../../src/diff/word-diff"

function medianMs(action: () => void, count = 30) {
    for (let i = 0; i < 5; i++) action()
    const times: number[] = []
    for (let i = 0; i < count; i++) {
        const start = performance.now()
        action()
        times.push(performance.now() - start)
    }
    return times.sort((a, b) => a - b)[Math.floor(count / 2)]!
}

for (const words of [500, 1000]) {
    test(`bounded word diff: ${words} unrelated words`, () => {
        const old = Array.from({ length: words }, (_, i) => `a${i}`).join(" ")
        const next = Array.from({ length: words }, (_, i) => `b${i}`).join(" ")
        const ms = medianMs(() => {
            computeWordDiff(old, next)
        })
        console.log(`${words} unrelated words: ${ms.toFixed(3)}ms median`)
        expect(ms).toBeLessThan(10)
    })
}

for (const wrappedRows of [100_000, 2_000_000]) {
    test(`compact reflow and visible preparation: ${wrappedRows} display rows`, () => {
        let made = 0
        const rows = Array.from({ length: 1000 }, (_, i) => i)
        const ms = medianMs(() => {
            const layout = buildRowWindow(
                rows,
                () => wrappedRows / rows.length,
                (row, wrap) => {
                    made++
                    return { row, wrap }
                },
            )
            layout.slice(50_000, 50_130)
        })
        expect(made).toBe(35 * 130)
        console.log(
            `${wrappedRows} display rows: ${ms.toFixed(3)}ms compact reflow + 130 visible rows`,
        )
        expect(ms).toBeLessThan(5)
    })
}

test("large-line token preparation and slicing use one plain token", () => {
    const content = "x".repeat(2_000_000)
    const ms = medianMs(() => {
        const tokens = prepareLineTokens(content, undefined, "added", "white", () => {
            throw new Error("unexpected tokenization")
        })
        sliceTokens(tokens, 1_900_000, 120)
    })
    console.log(`2M-character token fallback + tail slice: ${ms.toFixed(3)}ms median`)
    expect(ms).toBeLessThan(1)
})
