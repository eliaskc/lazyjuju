import type { ScrollBoxRenderable } from "@opentui/core"
import { batch, createSignal, onCleanup } from "solid-js"

/** Listen to native scroll changes, including wheel, keys, and scrollbar dragging. */
export function createScrollViewport() {
    const [top, setTop] = createSignal(0)
    const [height, setHeight] = createSignal(30)
    const [width, setWidth] = createSignal(80)
    let detach: (() => void) | undefined
    let current: ScrollBoxRenderable | undefined
    const sync = () => {
        if (!current || current.isDestroyed) return
        batch(() => {
            setTop(Math.max(0, current!.scrollTop))
            setHeight(Math.max(1, current!.viewport.height))
            setWidth(Math.max(1, current!.viewport.width))
        })
    }
    const attach = (ref: ScrollBoxRenderable) => {
        detach?.()
        current = ref
        ref.verticalScrollBar.on("change", sync)
        ref.viewport.on("resize", sync)
        detach = () => {
            ref.verticalScrollBar.off("change", sync)
            ref.viewport.off("resize", sync)
        }
        sync()
        queueMicrotask(sync)
    }
    onCleanup(() => {
        detach?.()
        current = undefined
    })
    return { top, height, width, attach, sync }
}
