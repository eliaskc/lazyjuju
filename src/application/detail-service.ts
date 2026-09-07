import { Context, Effect, Layer } from "effect"
import { Jj, type JjDiffOptions, type JjDiffTarget, type JjService } from "../commander/jj"
import type { FlattenedFile } from "../diff/parser"
import { isResolvedDetailTarget, makeDetailReads, prepareCurrentRead } from "./detail-reads"

export interface DetailService extends Pick<
    JjService,
    "diff" | "files" | "commitDetails" | "showDescription" | "logPage"
> {
    readonly preparedDiff: (
        target: JjDiffTarget,
        options: JjDiffOptions,
    ) => Effect.Effect<FlattenedFile[], Effect.Error<ReturnType<JjService["diff"]>>>
    readonly invalidate: () => Effect.Effect<void>
}

export class Details extends Context.Service<Details, DetailService>()("kajji/Details") {}

const detailKey = (kind: string, target: string | JjDiffTarget, options: JjDiffOptions) =>
    JSON.stringify([
        kind,
        options.cwd,
        target,
        options.paths,
        options.color ?? false,
        options.columns,
        options.timeoutMs,
        // Immutable content is reusable across operations; symbolic requests are not.
        isResolvedDetailTarget(typeof target === "string" ? { revision: target } : target)
            ? undefined
            : options.atOperation,
    ])

export const DetailsLive = Layer.effect(
    Details,
    Effect.gen(function* () {
        const jj = yield* Jj
        const reads = yield* makeDetailReads()
        const diff = yield* reads.makeReader<string, Effect.Error<ReturnType<JjService["diff"]>>>()
        const prepared = yield* reads.makeReader<
            FlattenedFile[],
            Effect.Error<ReturnType<JjService["diff"]>>
        >()
        const files = yield* reads.makeReader<
            Effect.Success<ReturnType<JjService["files"]>>,
            Effect.Error<ReturnType<JjService["files"]>>
        >()
        const description = yield* reads.makeReader<
            Effect.Success<ReturnType<JjService["commitDetails"]>>,
            Effect.Error<ReturnType<JjService["commitDetails"]>>
        >()
        const plainDescription = yield* reads.makeReader<
            Effect.Success<ReturnType<JjService["showDescription"]>>,
            Effect.Error<ReturnType<JjService["showDescription"]>>
        >()
        const logPage = yield* reads.makeReader<
            Effect.Success<ReturnType<JjService["logPage"]>>,
            Effect.Error<ReturnType<JjService["logPage"]>>
        >()
        const descriptionSize = (value: { subject: string; body: string }) =>
            (value.subject.length + value.body.length) * 2 + 128

        return Details.of({
            invalidate: reads.invalidate,
            diff: Effect.fn("Details.diff")((target, options) =>
                diff(
                    detailKey("raw-diff", target, options),
                    jj.diff(target, options),
                    (text) => text.length * 2,
                    isResolvedDetailTarget(target),
                ),
            ),
            preparedDiff: Effect.fn("Details.preparedDiff")((target, options) =>
                prepared(
                    detailKey("prepared-diff", target, { ...options, color: false }),
                    Effect.promise(() => import("../diff/parser")).pipe(
                        Effect.flatMap(({ parseDiffString, flattenDiff }) =>
                            prepareCurrentRead(
                                jj.diff(target, { ...options, color: false }),
                                (text) => flattenDiff(parseDiffString(text)),
                            ),
                        ),
                    ),
                    (files) =>
                        files.reduce(
                            (bytes, file) =>
                                bytes +
                                512 +
                                (file.name.length + (file.prevName?.length ?? 0)) * 2 +
                                file.hunks.reduce(
                                    (sum, hunk) =>
                                        sum +
                                        256 +
                                        (hunk.context?.length ?? 0) * 2 +
                                        hunk.lines.reduce(
                                            (total, line) => total + 256 + line.content.length * 2,
                                            0,
                                        ),
                                    0,
                                ),
                            0,
                        ),
                    isResolvedDetailTarget(target),
                ),
            ),
            files: Effect.fn("Details.files")((target, options) =>
                files(
                    detailKey("files", target, options),
                    jj.files(target, options),
                    () => 0,
                    // Binary detection can degrade; completed metadata reuse remains P12.
                    false,
                ),
            ),
            commitDetails: Effect.fn("Details.commitDetails")((revision, options) =>
                description(
                    detailKey("description", revision, options),
                    jj.commitDetails(revision, options),
                    descriptionSize,
                    isResolvedDetailTarget({ revision }),
                ),
            ),
            showDescription: Effect.fn("Details.showDescription")((revision, options) =>
                plainDescription(
                    detailKey("plain-description", revision, options),
                    jj.showDescription(revision, options),
                    descriptionSize,
                    isResolvedDetailTarget({ revision }),
                ),
            ),
            logPage: Effect.fn("Details.logPage")((options) =>
                logPage(
                    JSON.stringify([
                        "log-page",
                        options.cwd,
                        options.revset,
                        options.limit,
                        options.timeoutMs,
                        options.atOperation,
                    ]),
                    jj.logPage(options),
                    () => 0,
                    false,
                ),
            ),
        })
    }),
)
