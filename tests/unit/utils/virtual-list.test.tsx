import { expect, test } from "bun:test"
import { TextRenderable, type Renderable, type ScrollBoxRenderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { For, createSignal, onCleanup } from "solid-js"
import { AnsiText } from "../../../src/components/AnsiText"
import { VirtualList } from "../../../src/components/VirtualList"
import { ThemeProvider } from "../../../src/context/theme"
import { createScrollViewport } from "../../../src/hooks/scroll-viewport"

// Mount real Solid components and native renderables, not just a window calculation.
test("virtual list bounds mounts, preserves identities, and follows native scroll and resize", async () => {
    const [items, setItems] = createSignal(
        Array.from({ length: 10_000 }, (_, id) => ({ id, text: `row ${id}` })),
    )
    let scroll!: ScrollBoxRenderable
    let mounted = 0
    let created = 0
    let clicked = -1
    const setup = await testRender(
        () => {
            const viewport = createScrollViewport()
            return (
                <scrollbox
                    ref={(ref) => {
                        scroll = ref
                        viewport.attach(ref)
                    }}
                    height="100%"
                    width="100%"
                    scrollbarOptions={{ visible: false }}
                >
                    <VirtualList
                        items={items()}
                        scrollTop={viewport.top()}
                        viewportHeight={viewport.height()}
                        itemKey={(row) => String(row.id)}
                    >
                        {(row, index) => {
                            mounted++
                            created++
                            onCleanup(() => mounted--)
                            return (
                                <text
                                    height={1}
                                    flexShrink={0}
                                    onMouseDown={() => {
                                        clicked = index()
                                    }}
                                >
                                    {row.text}
                                </text>
                            )
                        }}
                    </VirtualList>
                </scrollbox>
            )
        },
        { width: 60, height: 12 },
    )
    try {
        await setup.renderOnce()
        await setup.renderOnce()
        expect(setup.captureCharFrame()).toContain("row 0")
        expect(mounted).toBeLessThanOrEqual(28)
        expect(scroll.scrollHeight).toBe(10_000)
        const initial = created
        setItems(items().map((row) => ({ ...row })))
        await setup.renderOnce()
        expect(created).toBe(initial)
        setItems([...items(), { id: 10_000, text: "new tail" }])
        await setup.renderOnce()
        expect(created).toBe(initial)
        scroll.scrollTo(5000)
        await setup.renderOnce()
        await setup.renderOnce()
        expect(setup.captureCharFrame()).toContain("row 5000")
        expect(mounted).toBeLessThanOrEqual(28)
        await setup.mockMouse.click(2, 0)
        expect(clicked).toBe(5000)
        await setup.mockMouse.scroll(2, 4, "down")
        await setup.renderOnce()
        await setup.renderOnce()
        expect(scroll.scrollTop).toBeGreaterThan(5000)
        expect(setup.captureCharFrame()).toContain(`row ${scroll.scrollTop}`)
        scroll.scrollTo(5000)
        setup.resize(80, 20)
        await setup.renderOnce()
        await setup.renderOnce()
        expect(mounted).toBeLessThanOrEqual(36)
        expect(setup.captureCharFrame()).toContain("row 5000")
        setItems(items().slice(0, 4))
        await setup.renderOnce()
        await setup.renderOnce()
        expect(setup.captureCharFrame()).toContain("row 0")
        expect(mounted).toBe(4)
    } finally {
        setup.renderer.destroy()
    }
    expect(mounted).toBe(0)
}, 15_000)

test("a very tall entry mounts only its visible lines", async () => {
    let mounted = 0
    const lines = Array.from({ length: 10_000 }, (_, index) => `line ${index}`)
    const setup = await testRender(
        () => (
            <VirtualList
                items={[lines]}
                itemHeight={(row) => row.length}
                scrollTop={5000}
                viewportHeight={12}
            >
                {(row, _index, from, to) => (
                    <box flexShrink={0}>
                        <box height={from()} flexShrink={0} />
                        <For each={row.slice(from(), to())}>
                            {(line) => {
                                mounted++
                                onCleanup(() => mounted--)
                                return (
                                    <text height={1} flexShrink={0}>
                                        {line}
                                    </text>
                                )
                            }}
                        </For>
                        <box height={row.length - to()} flexShrink={0} />
                    </box>
                )}
            </VirtualList>
        ),
        { width: 60, height: 12 },
    )
    try {
        await setup.renderOnce()
        expect(mounted).toBe(28)
    } finally {
        setup.renderer.destroy()
    }
    expect(mounted).toBe(0)
}, 15_000)

test("jj-style ANSI output mounts only visible lines and retains horizontal cropping", async () => {
    let scroll!: ScrollBoxRenderable
    const [left, setLeft] = createSignal(0)
    let total = 0
    const content =
        "\x1b[31m" +
        Array.from({ length: 10_000 }, (_, i) => `prefix line-${i} tail`).join("\n") +
        "\x1b[0m"
    const setup = await testRender(
        () => {
            const viewport = createScrollViewport()
            return (
                <ThemeProvider>
                    <scrollbox
                        ref={(ref) => {
                            scroll = ref
                            viewport.attach(ref)
                        }}
                        height="100%"
                        width="100%"
                        scrollbarOptions={{ visible: false }}
                    >
                        <AnsiText
                            content={content}
                            wrapMode="none"
                            scrollTop={viewport.top()}
                            viewportHeight={viewport.height()}
                            cropStart={left()}
                            cropWidth={30}
                            onTotalLines={(n) => {
                                total = n
                            }}
                        />
                    </scrollbox>
                </ThemeProvider>
            )
        },
        { width: 60, height: 12 },
    )
    const texts = (node: Renderable): number =>
        (node instanceof TextRenderable ? 1 : 0) +
        node.getChildren().reduce((sum, child) => sum + texts(child), 0)
    try {
        await setup.renderOnce()
        await setup.renderOnce()
        expect(total).toBe(10_000)
        expect(texts(setup.renderer.root)).toBeLessThanOrEqual(28)
        scroll.scrollTo(5000)
        await setup.renderOnce()
        await setup.renderOnce()
        expect(setup.captureCharFrame()).toContain("prefix line-5000")
        setLeft(7)
        await setup.renderOnce()
        expect(setup.captureCharFrame()).toContain("line-5000 tail")
        expect(setup.captureCharFrame()).not.toContain("prefix")
        expect(texts(setup.renderer.root)).toBeLessThanOrEqual(28)
    } finally {
        setup.renderer.destroy()
    }
}, 15_000)
