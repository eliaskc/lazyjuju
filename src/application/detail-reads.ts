import { Deferred, Effect, Equal, Hash, RcMap, Scope, TxPriorityQueue } from "effect"

export interface DetailReadLimits {
    maxBytes: number
    maxEntries: number
    concurrency: number
    maxQueued: number
}

const defaultLimits: DetailReadLimits = {
    maxBytes: 32 * 1024 * 1024,
    maxEntries: 128,
    concurrency: 4,
    maxQueued: 32,
}

interface Ticket {
    sequence: number
    admitted: Deferred.Deferred<void>
    finished: Deferred.Deferred<void>
}

interface RetainedRead {
    bytes: number
    evict: () => void
}

// Each typed reader owns an RcMap. Identity excludes the effect and estimator,
// so concurrent callers share the first lookup for the same request identity.
class ReadKey<A, E> implements Equal.Equal {
    constructor(
        readonly id: string,
        readonly load: Effect.Effect<A, E>,
        readonly size: (value: A) => number,
        readonly cache: boolean,
        readonly generation: number,
    ) {}

    [Equal.symbol](that: Equal.Equal): boolean {
        return that instanceof ReadKey && this.id === that.id
    }

    [Hash.symbol](): number {
        return Hash.string(this.id)
    }
}

/** Scoped request coordination. RcMap owns consumers and producer lifetimes;
 * Effect workers own concurrency, including subprocess cleanup. The custom
 * policies are newest-first admission and byte-weighted completed-result LRU.
 * Cache alone does not provide last-consumer cancellation or byte capacity.
 */
export const makeDetailReads = Effect.fn("DetailReads.make")(function* (
    limits: DetailReadLimits = defaultLimits,
) {
    const scope = yield* Scope.Scope
    const queue = yield* TxPriorityQueue.empty<Ticket>((a, b) =>
        a.sequence > b.sequence ? -1 : a.sequence < b.sequence ? 1 : 0,
    )
    let sequence = 0
    let readerSequence = 0
    let generation = 0
    let bytes = 0
    const retained = new Map<string, RetainedRead>()

    const invalidate = Effect.fn("DetailReads.invalidate")(function* () {
        yield* Effect.sync(() => {
            generation++
            for (const entry of retained.values()) entry.evict()
            retained.clear()
            bytes = 0
        })
    })
    yield* Effect.addFinalizer(invalidate)

    const work = Effect.gen(function* () {
        const ticket = yield* TxPriorityQueue.take(queue)
        yield* Deferred.succeed(ticket.admitted, undefined)
        // A cancelled producer completes this only after its finalizers finish.
        yield* Deferred.await(ticket.finished)
    }).pipe(Effect.forever)
    for (let index = 0; index < limits.concurrency; index++) {
        yield* Effect.forkScoped(work)
    }

    const schedule = <A, E>(load: Effect.Effect<A, E>): Effect.Effect<A, E> =>
        Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
                const ticket: Ticket = {
                    sequence: sequence++,
                    admitted: yield* Deferred.make<void>(),
                    finished: yield* Deferred.make<void>(),
                }
                const oldest = yield* Effect.gen(function* () {
                    yield* TxPriorityQueue.offer(queue, ticket)
                    if ((yield* TxPriorityQueue.size(queue)) <= limits.maxQueued) return undefined
                    const entries = yield* TxPriorityQueue.toArray(queue)
                    const oldest = entries.at(-1)
                    if (oldest) yield* TxPriorityQueue.removeIf(queue, (entry) => entry === oldest)
                    return oldest
                }).pipe(Effect.tx)
                if (oldest) yield* Deferred.interrupt(oldest.admitted)
                return yield* restore(
                    Deferred.await(ticket.admitted).pipe(Effect.andThen(load)),
                ).pipe(
                    Effect.ensuring(
                        Effect.gen(function* () {
                            yield* TxPriorityQueue.removeIf(queue, (entry) => entry === ticket)
                            yield* Deferred.succeed(ticket.finished, undefined)
                        }),
                    ),
                )
            }),
        )

    // Separate typed readers avoid type erasure of results and errors. They
    // share one worker pool and one byte/count budget.
    const makeReader = <A, E = never>() =>
        Effect.gen(function* () {
            const prefix = readerSequence++
            const completed = new Map<string, { value: A }>()
            const active = yield* RcMap.make({
                lookup: (key: ReadKey<A, E>) =>
                    schedule(key.load).pipe(
                        Effect.tap((value) =>
                            Effect.sync(() => {
                                if (!key.cache || key.generation !== generation) return
                                const cost = key.size(value) + key.id.length * 2 + 128
                                if (cost > limits.maxBytes) return
                                completed.set(key.id, { value })
                                retained.set(key.id, {
                                    bytes: cost,
                                    evict: () => {
                                        completed.delete(key.id)
                                    },
                                })
                                bytes += cost
                                while (
                                    bytes > limits.maxBytes ||
                                    retained.size > limits.maxEntries
                                ) {
                                    const oldest = retained.entries().next().value
                                    if (!oldest) break
                                    oldest[1].evict()
                                    bytes -= oldest[1].bytes
                                    retained.delete(oldest[0])
                                }
                            }),
                        ),
                    ),
                idleTimeToLive: 0,
            })
            return Effect.fn("DetailReads.read")(function* (
                key: string,
                load: Effect.Effect<A, E>,
                size: (value: A) => number,
                cache = true,
            ) {
                const id = `${generation}:${prefix}:${key}`
                const entry = retained.get(id)
                const cached = completed.get(id)
                if (entry && cached) {
                    retained.delete(id)
                    retained.set(id, entry)
                    return cached.value
                }
                return yield* RcMap.get(
                    active,
                    new ReadKey(id, load, size, cache, generation),
                ).pipe(Effect.scoped)
            })
        }).pipe(Scope.provide(scope))

    return { makeReader, invalidate }
})

/** Effect checks interruption between I/O and synchronous preparation. */
export const prepareCurrentRead = <A, E, R, B>(
    load: Effect.Effect<A, E, R>,
    prepare: (value: A) => B,
): Effect.Effect<B, E, R> => Effect.flatMap(load, (value) => Effect.sync(() => prepare(value)))

/** Only explicit full Git commit IDs (or unions of them) are reusable.
 * Symbols, change IDs and range expressions are read again on every visit.
 */
export function isResolvedDetailTarget(
    target: { revision: string } | { from: string; to: string },
) {
    const fullId = /^[a-f0-9]{40}$/
    if ("revision" in target) return target.revision.split(" | ").every((id) => fullId.test(id))
    return fullId.test(target.from) && fullId.test(target.to)
}
