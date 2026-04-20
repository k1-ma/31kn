import React, { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import ResizableImage from "@/components/common/ResizableImageExtension.jsx";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import {
  Bold, Italic, List, ListOrdered, Quote, Code, Link2,
  Undo2, Redo2, Heading1, Heading2, Heading3, Minus,
  Underline as UnderlineIcon, Highlighter, Strikethrough,
  CheckSquare, Table as TableIcon, Image as ImageIcon,
  Maximize2, Minimize2, X, FileCode
} from "lucide-react";

// Configuration constants
const DEFAULT_MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB max for compressed images
const DEFAULT_IMAGE_MAX_SIZE = 1920; // Max dimension in pixels (Full HD)
const DEFAULT_IMAGE_QUALITY = 0.92; // High quality
const PAGE_VARIANT_MIN_HEIGHT = 480;
const SLASH_SEARCH_RANGE = 20; // Characters to search back for slash
const MAX_SLASH_QUERY_LENGTH = 15; // Max length of slash command query

// Image compression utility
const compressImage = (file, opts = {}) =>
  new Promise((resolve, reject) => {
    try {
      const maxSize = Number(opts.maxSize ?? DEFAULT_IMAGE_MAX_SIZE);
      let quality = Number(opts.quality ?? DEFAULT_IMAGE_QUALITY);
      const maxBytes = opts.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;

      if (!file) return resolve(null);
      
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("File read failed"));
      reader.onload = () => {
        const img = new window.Image();
        img.onerror = () => reject(new Error("Image decode failed"));
        img.onload = () => {
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          if (!w || !h) return resolve(String(reader.result || ""));

          const scale = Math.min(1, maxSize / Math.max(w, h));
          const tw = Math.max(1, Math.round(w * scale));
          const th = Math.max(1, Math.round(h * scale));

          // Step-down resize for large downscales (>2×) to preserve sharpness
          let source = img;
          let sw = w;
          let sh = h;

          while (sw > tw * 2 || sh > th * 2) {
            const nw = Math.max(tw, Math.round(sw / 2));
            const nh = Math.max(th, Math.round(sh / 2));
            const sc = document.createElement("canvas");
            sc.width = nw;
            sc.height = nh;
            const sctx = sc.getContext("2d", { alpha: true });
            if (!sctx) break;
            sctx.imageSmoothingEnabled = true;
            sctx.imageSmoothingQuality = "high";
            sctx.drawImage(source, 0, 0, nw, nh);
            source = sc;
            sw = nw;
            sh = nh;
          }

          const canvas = document.createElement("canvas");
          canvas.width = tw;
          canvas.height = th;
          const ctx = canvas.getContext("2d", { alpha: true });
          if (!ctx) return resolve(String(reader.result || ""));

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(source, 0, 0, tw, th);

          // Try with current quality
          const tryCompress = (q) => {
            let out = "";
            try {
              out = canvas.toDataURL("image/webp", q);
              if (!out || out.startsWith("data:,")) throw new Error("webp unsupported");
            } catch {
              out = canvas.toDataURL("image/jpeg", q);
            }
            return out;
          };

          let result = tryCompress(quality);
          
          // If still too large, try lower quality (progressively)
          if (result.length > maxBytes && quality > 0.85) {
            result = tryCompress(0.85);
          }
          if (result.length > maxBytes && quality > 0.75) {
            result = tryCompress(0.75);
          }

          // If still too large, reject
          if (result.length > maxBytes * 1.5) {
            reject(new Error("Image too large after compression"));
            return;
          }

          resolve(result);
        };
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    } catch (e) {
      reject(e);
    }
  });

// Toolbar button component
function ToolbarButton({ onClick, active, disabled, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        p-1.5 sm:p-2 rounded-lg transition-all duration-150
        ${active 
          ? "bg-accent/25 text-accent border border-accent/30" 
          : "hover:bg-accent/10 text-muted-foreground hover:text-foreground border border-transparent"
        }
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {children}
    </button>
  );
}

// Separator for toolbar
function ToolbarSeparator() {
  return <div className="w-px h-6 bg-border/50 mx-0.5 sm:mx-1 hidden sm:block" />;
}

// Slash menu items configuration
const SLASH_MENU_ITEMS = [
  { id: "h1", label: "Heading 1", icon: Heading1, command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: "h2", label: "Heading 2", icon: Heading2, command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: "h3", label: "Heading 3", icon: Heading3, command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: "bullet", label: "Bullet List", icon: List, command: (editor) => editor.chain().focus().toggleBulletList().run() },
  { id: "ordered", label: "Numbered List", icon: ListOrdered, command: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { id: "todo", label: "Todo List", icon: CheckSquare, command: (editor) => editor.chain().focus().toggleTaskList().run() },
  { id: "quote", label: "Quote", icon: Quote, command: (editor) => editor.chain().focus().toggleBlockquote().run() },
  { id: "code", label: "Code Block", icon: FileCode, command: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  { id: "divider", label: "Divider", icon: Minus, command: (editor) => editor.chain().focus().setHorizontalRule().run() },
  { id: "table", label: "Table", icon: TableIcon, command: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: "image", label: "Image", icon: ImageIcon, command: null }, // Special handling for image
];

// Slash Menu Component
function SlashMenu({ editor, isOpen, position, query, onClose, onImageUpload }) {
  const menuRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredItems = useMemo(() => {
    if (!query) return SLASH_MENU_ITEMS;
    const q = query.toLowerCase();
    return SLASH_MENU_ITEMS.filter(item => 
      item.label.toLowerCase().includes(q) || item.id.includes(q)
    );
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filteredItems[selectedIndex];
        if (item) {
          executeCommand(item);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredItems, onClose]);

  const executeCommand = (item) => {
    if (item.id === "image") {
      onImageUpload();
    } else if (item.command) {
      item.command(editor);
    }
    onClose();
  };

  if (!isOpen || filteredItems.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-card border border-accent/20 rounded-xl shadow-xl overflow-hidden min-w-[200px] max-h-[300px] overflow-y-auto"
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-1">
        {filteredItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => executeCommand(item)}
              className={`
                w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors
                ${index === selectedIndex ? "bg-accent/20 text-foreground" : "text-muted-foreground hover:bg-accent/10"}
              `}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Fullscreen Modal for editor
function EditorFullscreenModal({ isOpen, onClose, children, title }) {
  useEffect(() => {
    if (!isOpen) return;
    
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-accent/15 bg-card/80 backdrop-blur-sm">
        <span className="text-sm font-medium text-muted-foreground">{title || "Editor"}</span>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"
          title="Close fullscreen (Esc)"
        >
          <Minimize2 className="h-5 w-5" />
        </button>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

/**
 * Modern WYSIWYG Rich Text Editor using TipTap (Notion-like)
 * @param {Object} props
 * @param {string} props.value - HTML content
 * @param {(html: string, text: string) => void} props.onChange - Callback with HTML and plain text
 * @param {string} [props.placeholder] - Placeholder text
 * @param {string} [props.className] - Additional CSS classes
 * @param {number} [props.minHeight] - Minimum height in pixels
 * @param {"compact"|"page"} [props.variant] - Editor variant for different contexts
 * @param {Function} [props.onImageTooLarge] - Callback when image is too large
 */
export default function RichTextEditor({ 
  value = "", 
  onChange, 
  placeholder = "Start writing... Type '/' for commands",
  className = "",
  minHeight = 320,
  variant = "compact",
  onImageTooLarge
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [slashMenu, setSlashMenu] = useState({ isOpen: false, position: { top: 0, left: 0 }, query: "" });
  const editorContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  const actualMinHeight = variant === "page" ? Math.max(minHeight, PAGE_VARIANT_MIN_HEIGHT) : minHeight;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: {
          HTMLAttributes: {
            class: "bg-muted/50 rounded-lg p-4 font-mono text-sm overflow-x-auto",
          },
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-accent underline cursor-pointer",
        },
      }),
      ResizableImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: "rounded-lg max-w-full h-auto my-2",
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: "not-prose pl-0",
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: "flex items-start gap-2 my-1",
        },
      }),
      Underline,
      Highlight.configure({
        multicolor: false,
        HTMLAttributes: {
          class: "bg-yellow-300/40 rounded px-0.5",
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "border-collapse table-auto w-full my-4",
        },
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: "border-b border-accent/20",
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: "border border-accent/20 p-2 text-left align-top",
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: "border border-accent/20 p-2 bg-muted/30 font-semibold text-left",
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      onChange?.(html, text);
    },
    editorProps: {
      attributes: {
        class: "focus:outline-none prose prose-sm dark:prose-invert max-w-none min-h-[inherit]",
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              handleImageUpload(file);
            }
            return true;
          }
        }
        return false;
      },
      handleKeyDown: (view, event) => {
        // Handle slash menu
        if (event.key === "/" && !slashMenu.isOpen) {
          const { state } = view;
          const { selection } = state;
          const { $from } = selection;
          
          // Check if at start of line or after space
          const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
          if (textBefore === "" || textBefore.endsWith(" ")) {
            // Get cursor position for menu
            const coords = view.coordsAtPos(selection.from);
            setSlashMenu({
              isOpen: true,
              position: { top: coords.bottom + 8, left: coords.left },
              query: "",
              startPos: selection.from,
            });
          }
        }
        return false;
      },
    },
  });

  // Handle slash menu input
  useEffect(() => {
    if (!editor || !slashMenu.isOpen) return;

    const handleTransaction = () => {
      const { state } = editor;
      const { selection } = state;
      const { from } = selection;
      
      // Find the slash position and extract query
      const text = state.doc.textBetween(Math.max(0, from - SLASH_SEARCH_RANGE), from, "");
      const slashIndex = text.lastIndexOf("/");
      
      if (slashIndex === -1) {
        setSlashMenu(prev => ({ ...prev, isOpen: false }));
        return;
      }
      
      const query = text.slice(slashIndex + 1);
      
      // Close on space after slash or if backspace removes slash
      if (query.includes(" ") || query.length > MAX_SLASH_QUERY_LENGTH) {
        setSlashMenu(prev => ({ ...prev, isOpen: false }));
        return;
      }
      
      setSlashMenu(prev => ({ ...prev, query }));
    };

    editor.on("transaction", handleTransaction);
    return () => editor.off("transaction", handleTransaction);
  }, [editor, slashMenu.isOpen]);

  // Close slash menu when clicking outside
  useEffect(() => {
    if (!slashMenu.isOpen) return;
    
    const handleClick = (e) => {
      if (!e.target.closest("[data-slash-menu]")) {
        setSlashMenu(prev => ({ ...prev, isOpen: false }));
      }
    };
    
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [slashMenu.isOpen]);

  // Update content when value changes from outside
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "");
    }
  }, [value, editor]);

  const handleImageUpload = useCallback(async (file) => {
    if (!editor || !file) return;
    
    try {
      const dataUrl = await compressImage(file, { maxSize: DEFAULT_IMAGE_MAX_SIZE, quality: DEFAULT_IMAGE_QUALITY });
      if (dataUrl) {
        // Delete the slash command text if present
        const { state } = editor;
        const text = state.doc.textBetween(Math.max(0, state.selection.from - SLASH_SEARCH_RANGE), state.selection.from, "");
        const slashIndex = text.lastIndexOf("/");
        if (slashIndex !== -1) {
          const deleteFrom = state.selection.from - (text.length - slashIndex);
          editor.chain().focus().deleteRange({ from: deleteFrom, to: state.selection.from }).run();
        }
        
        editor.chain().focus().setImage({ src: dataUrl }).run();
      }
    } catch (err) {
      console.error("Image compression failed:", err);
      onImageTooLarge?.();
    }
  }, [editor, onImageTooLarge]);

  const handleFileInputChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
    e.target.value = "";
  }, [handleImageUpload]);

  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const closeSlashMenu = useCallback(() => {
    if (!editor) return;
    
    // Delete the slash command
    const { state } = editor;
    const text = state.doc.textBetween(Math.max(0, state.selection.from - SLASH_SEARCH_RANGE), state.selection.from, "");
    const slashIndex = text.lastIndexOf("/");
    if (slashIndex !== -1) {
      const deleteFrom = state.selection.from - (text.length - slashIndex);
      editor.chain().focus().deleteRange({ from: deleteFrom, to: state.selection.from }).run();
    }
    
    setSlashMenu({ isOpen: false, position: { top: 0, left: 0 }, query: "" });
  }, [editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);
    
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  const toolbarContent = (
    <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border/50 bg-muted/20 shrink-0">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        active={editor.isActive("highlight")}
        title="Highlight"
      >
        <Highlighter className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Ordered List"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
        title="Todo List"
      >
        <CheckSquare className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Quote"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        title="Inline Code"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        title="Code Block"
      >
        <FileCode className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton
        onClick={setLink}
        active={editor.isActive("link")}
        title="Link"
      >
        <Link2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={triggerImageUpload}
        title="Insert Image"
      >
        <ImageIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        active={editor.isActive("table")}
        title="Insert Table"
      >
        <TableIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>

      {/* Table controls when inside table */}
      {editor.isActive("table") && (
        <>
          <ToolbarSeparator />
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="px-2 py-1 text-xs rounded bg-accent/10 hover:bg-accent/20 text-muted-foreground"
            title="Add Column"
          >
            +Col
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="px-2 py-1 text-xs rounded bg-accent/10 hover:bg-accent/20 text-muted-foreground"
            title="Add Row"
          >
            +Row
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="px-2 py-1 text-xs rounded bg-red-500/10 hover:bg-red-500/20 text-red-400"
            title="Delete Table"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      )}

      <div className="flex-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton
        onClick={() => setIsFullscreen(!isFullscreen)}
        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </ToolbarButton>
    </div>
  );

  const editorContent = (
    <div 
      ref={editorContainerRef}
      className={`relative p-4 focus-within:ring-2 focus-within:ring-accent/20 transition-all flex-1 overflow-auto ${isFullscreen ? "h-full" : ""}`}
      style={isFullscreen ? {} : { minHeight: `${actualMinHeight}px` }}
    >
      <EditorContent 
        editor={editor} 
        className="min-h-[inherit] h-full"
      />
      
      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />
      
      {/* Slash Menu */}
      <div data-slash-menu>
        <SlashMenu
          editor={editor}
          isOpen={slashMenu.isOpen}
          position={slashMenu.position}
          query={slashMenu.query}
          onClose={closeSlashMenu}
          onImageUpload={triggerImageUpload}
        />
      </div>
    </div>
  );

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <>
        {/* Keep the non-fullscreen container for position */}
        <div className={`rounded-xl border border-accent/15 bg-card/60 backdrop-blur-sm overflow-hidden flex flex-col ${className}`}>
          <div className="p-4 text-center text-muted-foreground text-sm">
            Editor is in fullscreen mode
          </div>
        </div>
        
        <EditorFullscreenModal
          isOpen={isFullscreen}
          onClose={() => setIsFullscreen(false)}
          title="Editor"
        >
          <div className="flex flex-col h-full bg-card">
            {toolbarContent}
            {editorContent}
          </div>
        </EditorFullscreenModal>
      </>
    );
  }

  return (
    <div className={`rounded-xl border border-accent/15 bg-card/60 backdrop-blur-sm overflow-hidden flex flex-col ${className}`}>
      {toolbarContent}
      {editorContent}
    </div>
  );
}
