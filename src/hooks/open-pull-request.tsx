import { BookmarkNameModal } from "../components/modals/BookmarkNameModal"
import { useApplication } from "../context/application"
import { useCommandLog } from "../context/commandlog"
import { DIALOG_SIZE, useDialog } from "../context/dialog"
import { getRepoPath } from "../repo"

export function useOpenPullRequest(onCreated: () => void) {
    const app = useApplication()
    const commandLog = useCommandLog()
    const dialog = useDialog()

    const reportError = (error: unknown) => {
        commandLog.addEntry({
            command: "Open PR",
            success: false,
            exitCode: 1,
            stdout: "",
            stderr: error instanceof Error ? error.message : String(error),
        })
    }

    return async (head: string) => {
        const cwd = getRepoPath()
        try {
            const { repository, branches } = await app.ghPrBaseChoices(head, { cwd })
            // Do not open a dialog for a repository that is no longer active.
            if (cwd !== getRepoPath()) return
            dialog.open(
                () => (
                    <box flexDirection="column" gap={1}>
                        <text>
                            {branches.length === 1
                                ? `Base for ${head}: ${branches[0]}`
                                : `Equally near bases: ${branches.join(", ")}`}
                        </text>
                        <text>Enter the base branch. You can change the suggestion.</text>
                        <BookmarkNameModal
                            initialValue={branches.length === 1 ? branches[0] : ""}
                            onSave={(base) => {
                                void (async () => {
                                    if (cwd !== getRepoPath()) return
                                    const result = await app.ghPrCreateWeb(head, {
                                        cwd,
                                        base,
                                        repository,
                                        observer: commandLog.observer(),
                                    })
                                    commandLog.addEntry(result)
                                    if (result.success) onCreated()
                                })().catch(reportError)
                            }}
                        />
                    </box>
                ),
                {
                    id: "open-pr-base",
                    title: "Choose PR base",
                    ...DIALOG_SIZE.form,
                    hints: [{ key: "enter", label: "open PR" }],
                },
            )
        } catch (error) {
            reportError(error)
        }
    }
}
