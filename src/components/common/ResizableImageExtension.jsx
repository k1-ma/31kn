/**
 * ResizableImageExtension - Custom Tiptap Image extension with resize handles
 * 
 * Extends the default Image node to add drag handles on corners
 * that allow users to resize images by dragging.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

// ResizableImage NodeView Component
function ResizableImageView({ node, updateAttributes, selected }) {
  const containerRef = useRef(null);
  const [resizing, setResizing] = useState(false);
  const startState = useRef(null);

  const { src, alt, title, width } = node.attrs;

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    const img = containerRef.current?.querySelector("img");
    if (!img) return;

    startState.current = {
      startX: e.clientX,
      startWidth: img.offsetWidth,
    };
    setResizing(true);
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const onMouseMove = (e) => {
      if (!startState.current) return;
      const diff = e.clientX - startState.current.startX;
      const direction = startState.current.leftHandle ? -1 : 1;
      const newWidth = Math.max(100, startState.current.startWidth + diff * direction);
      updateAttributes({ width: newWidth });
    };

    const onMouseUp = () => {
      setResizing(false);
      startState.current = null;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizing, updateAttributes]);

  // Touch support for mobile
  const onTouchStart = useCallback((e) => {
    e.stopPropagation();
    const touch = e.touches[0];
    if (!touch) return;

    const img = containerRef.current?.querySelector("img");
    if (!img) return;

    startState.current = {
      startX: touch.clientX,
      startWidth: img.offsetWidth,
    };
    setResizing(true);
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const onTouchMove = (e) => {
      if (!startState.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const diff = touch.clientX - startState.current.startX;
      const direction = startState.current.leftHandle ? -1 : 1;
      const newWidth = Math.max(100, startState.current.startWidth + diff * direction);
      updateAttributes({ width: newWidth });
    };

    const onTouchEnd = () => {
      setResizing(false);
      startState.current = null;
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [resizing, updateAttributes]);

  return (
    <NodeViewWrapper className="resizable-image-wrapper" data-drag-handle>
      <div
        ref={containerRef}
        className={`relative inline-block my-2 ${selected ? "ring-2 ring-accent/50 rounded-lg" : ""}`}
        style={{ width: width ? `${width}px` : undefined, maxWidth: "100%" }}
      >
        <img
          src={src}
          alt={alt || ""}
          title={title || ""}
          className="rounded-lg max-w-full h-auto block"
          style={{ width: "100%" }}
          draggable={false}
        />
        {/* Resize handle - bottom-right corner */}
        {selected && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10 group"
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
          >
            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-sm bg-accent border border-background shadow-sm group-hover:scale-125 transition-transform" />
          </div>
        )}
        {/* Resize handle - bottom-left corner */}
        {selected && (
          <div
            className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-10 group"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const img = containerRef.current?.querySelector("img");
              if (!img) return;
              // For left handle, resizing goes in opposite direction
              startState.current = {
                startX: e.clientX,
                startWidth: img.offsetWidth,
                leftHandle: true,
              };
              setResizing(true);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              const touch = e.touches[0];
              if (!touch) return;
              const img = containerRef.current?.querySelector("img");
              if (!img) return;
              startState.current = {
                startX: touch.clientX,
                startWidth: img.offsetWidth,
                leftHandle: true,
              };
              setResizing(true);
            }}
          >
            <div className="absolute bottom-1 left-1 w-2.5 h-2.5 rounded-sm bg-accent border border-background shadow-sm group-hover:scale-125 transition-transform" />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// Create the Tiptap extension
const ResizableImage = Node.create({
  name: "image",

  addOptions() {
    return {
      inline: false,
      allowBase64: true,
      HTMLAttributes: {},
    };
  },

  inline() {
    return this.options.inline;
  },

  group() {
    return this.options.inline ? "inline" : "block";
  },

  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute("width") || element.style.width;
          return width ? parseInt(width, 10) || null : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { width: attributes.width, style: `width: ${attributes.width}px` };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },

  addCommands() {
    return {
      setImage: (options) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: options,
        });
      },
    };
  },
});

export default ResizableImage;
