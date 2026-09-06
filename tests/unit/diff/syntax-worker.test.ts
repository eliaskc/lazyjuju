import { expect, test } from "bun:test"

test("syntax worker highlights code with both bundled themes", async () => {
    const worker = new Worker(new URL("../../../src/diff/syntax-worker.ts", import.meta.url).href)
    const request = (message: object) =>
        new Promise<{ type: string; tokens: Array<{ content: string; color?: string }> }>(
            (resolve, reject) => {
                worker.onmessage = (event) => {
                    if (event.data.type === "error") reject(new Error(event.data.message))
                    else resolve(event.data)
                }
                worker.onerror = (event) => reject(new Error(event.message))
                worker.postMessage(message)
            },
        )

    try {
        expect((await request({ type: "init" })).type).toBe("ready")
        const longLine = "const long = " + "x".repeat(100_000)
        const fallback = await request({
            type: "tokenize",
            id: 2,
            content: longLine,
            language: "typescript",
            theme: "ayu-dark",
        })
        expect(fallback.tokens).toEqual([{ content: longLine }])
        for (const theme of ["ayu-dark", "github-light"]) {
            const result = await request({
                type: "tokenize",
                id: 1,
                content: "const answer = 42",
                language: "typescript",
                theme,
            })
            expect(result.type).toBe("tokens")
            expect(result.tokens.map((token: { content: string }) => token.content).join("")).toBe(
                "const answer = 42",
            )
            expect(result.tokens.some((token: { color?: string }) => token.color)).toBe(true)
        }
    } finally {
        worker.terminate()
    }
})
