import { execute } from "./executor"

export async function fetchDiff(
	changeId: string,
	cwd?: string,
): Promise<string> {
	const result = await execute(["diff", "-r", changeId, "--color", "always"], {
		cwd,
	})

	if (!result.success) {
		throw new Error(`jj diff failed: ${result.stderr}`)
	}

	return result.stdout
}
