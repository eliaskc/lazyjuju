import { For, createMemo, type Accessor, type JSX } from "solid-js"
import { buildRowOffsets, listWindow } from "../utils/list-window"
import { retainEqualItems } from "../utils/stable-items"

interface VirtualListProps<T> {
    items: readonly T[]
    scrollTop: number
    viewportHeight: number
    offsets?: readonly number[]
    itemHeight?: (item: T) => number
    itemKey?: (item: T) => string
    children: (
        item: T,
        index: Accessor<number>,
        from: Accessor<number>,
        to: Accessor<number>,
    ) => JSX.Element
}

/** Spacers retain native scrolling and absolute selection indexes. Overscan is in lines. */
export function VirtualList<T>(props: VirtualListProps<T>) {
    const items = createMemo<readonly T[]>((previous) =>
        props.itemKey ? retainEqualItems(previous ?? [], props.items, props.itemKey) : props.items,
    )
    const offsets = createMemo(
        () => props.offsets ?? buildRowOffsets(items(), props.itemHeight ?? (() => 1)),
    )
    const window = createMemo(() => listWindow(offsets(), props.scrollTop, props.viewportHeight))
    const visible = createMemo(() => items().slice(window().start, window().end))
    return (
        <>
            <box height={window().before} flexShrink={0} />
            <For each={visible()}>
                {(item, index) => {
                    const absoluteIndex = () => window().start + index()
                    const offset = () => offsets()[absoluteIndex()] ?? 0
                    return props.children(
                        item,
                        absoluteIndex,
                        () => Math.max(0, window().from - offset()),
                        () =>
                            Math.min(
                                offsets()[absoluteIndex() + 1]! - offset(),
                                window().to - offset(),
                            ),
                    )
                }}
            </For>
            <box height={window().after} flexShrink={0} />
        </>
    )
}
