export interface ChangelogEntry {
	category: string
	text: string
}

export interface VersionBlock {
	version: string
	entries: ChangelogEntry[]
}

function compareVersions(a: string, b: string): number {
	const partsA = a.split(".").map(Number)
	const partsB = b.split(".").map(Number)

	for (let i = 0; i < 3; i += 1) {
		const numA = partsA[i] ?? 0
		const numB = partsB[i] ?? 0
		if (numA > numB) return 1
		if (numA < numB) return -1
	}

	return 0
}

function stripLinks(text: string): string {
	const withoutCodeLinks = text.replace(/\[`[^`]*`\]\([^)]*\)/g, "")
	const withoutLinks = withoutCodeLinks.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
	return withoutLinks.replace(/\s+/g, " ").trim()
}

export function parseChangelog(content: string): VersionBlock[] {
	const lines = content.split(/\r?\n/)
	const blocks: VersionBlock[] = []
	let current: VersionBlock | null = null
	let currentCategory: string | null = null

	for (const line of lines) {
		const versionMatch = line.match(/^##\s+(.+)$/)
		const version = versionMatch?.[1]
		if (version) {
			current = { version: version.trim(), entries: [] }
			blocks.push(current)
			currentCategory = null
			continue
		}

		const categoryMatch = line.match(/^###\s+(.+)$/)
		const category = categoryMatch?.[1]
		if (category) {
			currentCategory = category.trim().toLowerCase()
			continue
		}

		const entryMatch = line.match(/^\s*-\s+(.*)$/)
		const entryText = entryMatch?.[1]
		if (entryText && current && currentCategory) {
			const text = stripLinks(entryText.trim())
			if (text) {
				current.entries.push({ category: currentCategory, text })
			}
		}
	}

	return blocks
}

export function getChangesSince(
	blocks: VersionBlock[],
	sinceVersion: string,
): VersionBlock[] {
	return blocks.filter(
		(block) => compareVersions(block.version, sinceVersion) > 0,
	)
}
