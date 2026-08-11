import { useCurrentEditor } from "@tiptap/react";
import type { FC } from "react";
import Moveable from "react-moveable";

export const ImageResizer: FC = () => {
  const { editor } = useCurrentEditor();

  if (!editor?.isActive("image")) return null;

  const updateMediaSize = () => {
    const selectedNode = document.querySelector(".ProseMirror-selectednode");
    if (!selectedNode) return;

    const imageInfo =
      selectedNode.nodeName === "IMG"
        ? (selectedNode as HTMLImageElement)
        : (selectedNode.querySelector("img") as HTMLImageElement);

    if (imageInfo) {
      const selection = editor.state.selection;

      const width = Number(imageInfo.style.width.replace("px", ""));
      const height = Number(imageInfo.style.height.replace("px", ""));

      if (width > 0 && height > 0) {
        // Use updateAttributes instead of setImage to avoid flickering and losing src
        editor.commands.updateAttributes("image", {
          width,
          height,
        });
      }

      editor.commands.setNodeSelection(selection.from);
    }
  };

  return (
    <Moveable
      target={document.querySelector(".ProseMirror-selectednode") as HTMLDivElement}
      container={null}
      origin={false}
      /* Resize event edges */
      edge={false}
      throttleDrag={0}
      /* When resize or scale, keeps a ratio of the width, height. */
      keepRatio={true}
      /* resizable*/
      /* Only one of resizable, scalable, warpable can be used. */
      resizable={true}
      throttleResize={0}
      onResize={({ target, width, height, delta }) => {
        if (delta[0]) target.style.width = `${width}px`;
        if (delta[1]) target.style.height = `${height}px`;

        const img = target.querySelector("img");
        if (img) {
          if (delta[0]) img.style.width = `${width}px`;
          if (delta[1]) img.style.height = `${height}px`;
        }
      }}
      onResizeEnd={() => {
        updateMediaSize();
      }}
      /* scalable */
      /* Only one of resizable, scalable, warpable can be used. */
      scalable={false}
      throttleScale={0}
      /* Set the direction of resizable */
      renderDirections={["w", "e"]}
    />
  );
};
