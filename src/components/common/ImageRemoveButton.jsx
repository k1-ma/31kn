import { X } from "lucide-react";

/**
 * Unified image remove button with consistent styling.
 * Always visible, good contrast, touch-friendly with proper hit area.
 * 
 * @param {Object} props
 * @param {Function} props.onClick - Handler for remove action
 * @param {string} [props.className] - Additional classes to merge (can override position with e.g. "top-1 right-1")
 * @param {string} [props.title] - Accessibility title (default: "Remove")
 * @param {"sm" | "md"} [props.size="md"] - Button size variant: "sm" (h-7 w-7) or "md" (h-8 w-8, default)
 */
export function ImageRemoveButton({ 
  onClick, 
  className = "", 
  title = "Remove",
  size = "md"
}) {
  // Default to "md" for invalid sizes
  const isSmall = size === "sm";
  const sizeClasses = isSmall ? "h-7 w-7" : "h-8 w-8";
  const iconSize = isSmall ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`absolute top-2 right-2 ${sizeClasses} rounded-lg flex items-center justify-center bg-red-500/90 text-white shadow-lg ring-1 ring-black/20 backdrop-blur-sm hover:bg-red-500 hover:shadow-xl active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 transition-all ${className}`}
    >
      <X className={iconSize} />
    </button>
  );
}

export default ImageRemoveButton;
