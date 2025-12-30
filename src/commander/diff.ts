import { execute } from "./executor"

export interface FetchDiffOptions {
	cwd?: string
	columns?: number
	paths?: string[]
}

export async function fetchDiff(
	changeId: string,
	options: FetchDiffOptions = {},
): Promise<string> {
	const env: Record<string, string> = {}

	if (options.columns) {
		env.COLUMNS = String(options.columns)
	}

	const args = [
		"diff",
		"-r",
		changeId,
		"--color",
		"always",
		"--ignore-working-copy",
	]

	if (options.paths && options.paths.length > 0) {
		args.push(...options.paths)
	}

	const result = await execute(args, { cwd: options.cwd, env })

	if (!result.success) {
		throw new Error(`jj diff failed: ${result.stderr}`)
	}

	return result.stdout
}
