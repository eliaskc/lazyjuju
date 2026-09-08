import { describe, expect, test } from "bun:test"
import { nearestRemoteAncestorBookmarks } from "../../../src/commander/pr-base"

function graph(...rows: string[][]) {
    return rows.map((row) => row.join("\0")).join("\n") + "\n"
}

describe("nearest remote PR base", () => {
    test("selects a release branch before main", () => {
        expect(
            nearestRemoteAncestorBookmarks(
                graph(
                    ["head", "work", "feature"],
                    ["work", "release"],
                    ["release", "main", "release/1.0"],
                    ["main", "", "main"],
                ),
                "feature",
            ),
        ).toEqual(["release/1.0"])
    })

    test("excludes bookmarks at the head and the head branch at an older remote position", () => {
        expect(
            nearestRemoteAncestorBookmarks(
                graph(
                    ["head", "older", "feature", "same-position"],
                    ["older", "main", "feature"],
                    ["main", "", "main"],
                ),
                "feature",
            ),
        ).toEqual(["main"])
    })

    test("returns all equally near branches across merge parents", () => {
        expect(
            nearestRemoteAncestorBookmarks(
                graph(
                    ["head", "left right"],
                    ["left", "root", "release", "alias"],
                    ["right", "root", "other"],
                    ["root", "", "main"],
                ),
                "feature",
            ),
        ).toEqual(["alias", "other", "release"])
    })

    test("uses shortest parent distance, not log order", () => {
        expect(
            nearestRemoteAncestorBookmarks(
                graph(
                    ["head", "left right"],
                    ["left", "deep"],
                    ["deep", "root", "far"],
                    ["right", "root", "near"],
                    ["root", ""],
                ),
                "feature",
            ),
        ).toEqual(["near"])
    })

    test("returns no suggestion without a remote ancestor", () => {
        expect(
            nearestRemoteAncestorBookmarks(graph(["head", "root"], ["root", ""]), "feature"),
        ).toEqual([])
        expect(nearestRemoteAncestorBookmarks("", "feature")).toEqual([])
    })

    test("preserves punctuation in branch names", () => {
        expect(
            nearestRemoteAncestorBookmarks(
                graph(["head", "base"], ["base", "", "release,a|b"]),
                "feature",
            ),
        ).toEqual(["release,a|b"])
    })
})
