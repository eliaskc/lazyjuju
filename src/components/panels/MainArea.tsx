import { Show } from "solid-js";
import type { Commit } from "../../commander/types";
import { useSync } from "../../context/sync";
import { AnsiText } from "../AnsiText";

function CommitHeader(props: { commit: Commit }) {
  return (
    <box flexDirection="column" flexShrink={0}>
      <text>
        {"Change: "}
        <span style={{ fg: "#7aa2f7" }}>{props.commit.changeId}</span>
      </text>
      <text>
        {"Commit: "}
        <span style={{ fg: "#7aa2f7" }}>{props.commit.commitId}</span>
      </text>
      <text>
        {"Author: "}
        <span style={{ fg: "#e0af68" }}>{props.commit.author}</span>
        {` <${props.commit.authorEmail}>`}
      </text>
      <text>
        {"Date:   "}
        <span style={{ fg: "#9ece6a" }}>{props.commit.timestamp}</span>
      </text>
      <text> </text>
      <AnsiText content={`    ${props.commit.description}`} wrapMode="none" />
      <text> </text>
    </box>
  );
}

export function MainArea() {
  const { selectedCommit, diff, diffLoading, diffError, focusedPanel } =
    useSync();
  const isFocused = () => focusedPanel() === "diff";

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      height="100%"
      border
      borderColor={isFocused() ? "#4ECDC4" : "#444444"}
    >
      <Show when={diffLoading()}>
        <text>Loading diff...</text>
      </Show>
      <Show when={diffError()}>
        <text>Error: {diffError()}</text>
      </Show>
      <Show when={!diffLoading() && !diffError()}>
        <scrollbox focused={isFocused()} flexGrow={1}>
          <Show when={selectedCommit()} keyed>
            {(commit: Commit) => <CommitHeader commit={commit} />}
          </Show>
          <Show when={diff()}>
            <AnsiText content={diff() ?? ""} />
          </Show>
          <Show when={!diff()}>
            <text>No changes in this commit.</text>
          </Show>
        </scrollbox>
      </Show>
    </box>
  );
}
