export interface Commit {
	changeId: string
	commitId: string
	description: string
	author: string
	authorEmail: string
	timestamp: string
	lines: string[]
	isWorkingCopy: boolean
	immutable: boolean
	empty: boolean
}
