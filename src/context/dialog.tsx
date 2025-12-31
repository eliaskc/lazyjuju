import { RGBA } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/solid";
import {
  type JSX,
  type ParentProps,
  Show,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { createSimpleContext } from "./helper";

interface DialogState {
  render: () => JSX.Element;
  onClose?: () => void;
}

export const { use: useDialog, provider: DialogProvider } = createSimpleContext(
  {
    name: "Dialog",
    init: () => {
      const [stack, setStack] = createSignal<DialogState[]>([]);

      const close = () => {
        const current = stack().at(-1);
        current?.onClose?.();
        setStack((s) => s.slice(0, -1));
      };

      useKeyboard((evt) => {
        if (stack().length > 0 && evt.name === "escape") {
          evt.preventDefault();
          close();
        }
      });

      return {
        isOpen: () => stack().length > 0,
        current: () => stack().at(-1),
        open: (render: () => JSX.Element, onClose?: () => void) => {
          setStack((s) => [...s, { render, onClose }]);
        },
        close,
        clear: () => {
          for (const item of stack()) {
            item.onClose?.();
          }
          setStack([]);
        },
      };
    },
  },
);

function DialogBackdrop(props: { onClose: () => void; children: JSX.Element }) {
  const renderer = useRenderer();
  const [dimensions, setDimensions] = createSignal({
    width: renderer.width,
    height: renderer.height,
  });

  onMount(() => {
    const handleResize = (width: number, height: number) => {
      setDimensions({ width, height });
    };
    renderer.on("resize", handleResize);
    onCleanup(() => renderer.off("resize", handleResize));
  });

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
    >
      {props.children}
    </box>
  );
}

export function DialogContainer(props: ParentProps) {
  const dialog = useDialog();

  return (
    <>
      {props.children}
      <Show when={dialog.isOpen()}>
        <DialogBackdrop onClose={dialog.close}>
          {dialog.current()?.render()}
        </DialogBackdrop>
      </Show>
    </>
  );
}
