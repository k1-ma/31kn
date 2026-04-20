/**
 * HelpTooltip - Accessible tooltip component for help icons ("?")
 * 
 * Features:
 * - Desktop: hover with delay (200ms), stays open when hovering tooltip
 * - Mobile: tap/click to toggle, tap outside or ESC to close
 * - Portal rendering (to document.body) to avoid overflow clipping
 * - Proper z-index for layering above all content
 * - Keyboard accessible (focusable, ESC to close)
 * - ARIA attributes for screen readers
 * - Arrow pointing to trigger
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

// Constants
const HOVER_DELAY = 200; // ms delay before showing tooltip on hover
const TOOLTIP_OFFSET = 8; // px gap between trigger and tooltip
const FALLBACK_TOOLTIP_WIDTH = 200; // px - estimated width before render
const FALLBACK_TOOLTIP_HEIGHT = 40; // px - estimated height before render

/**
 * HelpTooltip Component
 * 
 * @param {Object} props
 * @param {string} props.content - Tooltip text content
 * @param {string} [props.ariaLabel] - Optional accessible label for the trigger button
 * @param {string} [props.className] - Additional classes for the wrapper
 * @param {React.ReactNode} [props.children] - Optional custom trigger (defaults to HelpCircle icon)
 */
export default function HelpTooltip({ 
  content, 
  ariaLabel, 
  className = "",
  children 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: "top" });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const isHoveringTooltipRef = useRef(false);

  // Calculate tooltip position
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Estimate tooltip dimensions (will be refined after render)
    const tooltipWidth = tooltipRef.current?.offsetWidth || FALLBACK_TOOLTIP_WIDTH;
    const tooltipHeight = tooltipRef.current?.offsetHeight || FALLBACK_TOOLTIP_HEIGHT;

    // Default: position above the trigger
    let placement = "top";
    let top = triggerRect.top - tooltipHeight - TOOLTIP_OFFSET;
    let left = triggerRect.left + (triggerRect.width / 2) - (tooltipWidth / 2);

    // If not enough space above, position below
    if (top < 10) {
      placement = "bottom";
      top = triggerRect.bottom + TOOLTIP_OFFSET;
    }

    // Keep within horizontal bounds
    if (left < 10) {
      left = 10;
    } else if (left + tooltipWidth > viewportWidth - 10) {
      left = viewportWidth - tooltipWidth - 10;
    }

    setPosition({ top, left, placement });
  }, []);

  // Open tooltip
  const openTooltip = useCallback(() => {
    setIsOpen(true);
    // Position will be updated in useEffect
  }, []);

  // Close tooltip
  const closeTooltip = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Handle hover enter on trigger
  const handleMouseEnter = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      openTooltip();
    }, HOVER_DELAY);
  }, [openTooltip]);

  // Handle hover leave from trigger
  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
    // Small delay to allow moving to tooltip
    hoverTimeoutRef.current = setTimeout(() => {
      if (!isHoveringTooltipRef.current) {
        closeTooltip();
      }
    }, 100);
  }, [closeTooltip]);

  // Handle tooltip hover
  const handleTooltipMouseEnter = useCallback(() => {
    isHoveringTooltipRef.current = true;
    clearTimeout(hoverTimeoutRef.current);
  }, []);

  const handleTooltipMouseLeave = useCallback(() => {
    isHoveringTooltipRef.current = false;
    closeTooltip();
  }, [closeTooltip]);

  // Handle click/tap (toggle for mobile)
  const handleClick = useCallback((e) => {
    e.stopPropagation();
    if (isOpen) {
      closeTooltip();
    } else {
      openTooltip();
    }
  }, [isOpen, openTooltip, closeTooltip]);

  // Handle keyboard
  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") {
      closeTooltip();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (isOpen) {
        closeTooltip();
      } else {
        openTooltip();
      }
    }
  }, [isOpen, openTooltip, closeTooltip]);

  // Handle focus
  const handleFocus = useCallback(() => {
    openTooltip();
  }, [openTooltip]);

  const handleBlur = useCallback(() => {
    // Small delay to allow clicking inside tooltip
    setTimeout(() => {
      if (!isHoveringTooltipRef.current) {
        closeTooltip();
      }
    }, 100);
  }, [closeTooltip]);

  // Update position when tooltip opens or window changes
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      // Re-calculate after tooltip renders to get accurate dimensions
      requestAnimationFrame(updatePosition);
    }
  }, [isOpen, updatePosition]);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        triggerRef.current && 
        !triggerRef.current.contains(e.target) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target)
      ) {
        closeTooltip();
      }
    };

    // Handle scroll (update position or close)
    const handleScroll = () => {
      updatePosition();
    };

    // Handle resize
    const handleResize = () => {
      updatePosition();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen, closeTooltip, updatePosition]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // Handle ESC key globally when open
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e) => {
      if (e.key === "Escape") {
        closeTooltip();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isOpen, closeTooltip]);

  // Tooltip portal content
  const tooltipContent = isOpen && createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      className={`
        fixed z-[9999] px-3 py-2 
        text-xs text-foreground
        bg-card border border-accent/20 
        rounded-lg shadow-lg shadow-black/20
        max-w-xs
        animate-[fadeUp_0.15s_ease-out]
        pointer-events-auto
      `}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onMouseEnter={handleTooltipMouseEnter}
      onMouseLeave={handleTooltipMouseLeave}
    >
      {content}
      {/* Arrow */}
      <div
        className={`
          absolute w-2 h-2 bg-card border-accent/20
          transform rotate-45
          ${position.placement === "top" 
            ? "bottom-[-5px] border-r border-b" 
            : "top-[-5px] border-l border-t"
          }
        `}
        style={{
          left: "50%",
          marginLeft: "-4px",
        }}
      />
    </div>,
    document.body
  );

  return (
    <span className={`inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel || "Show help"}
        aria-describedby={isOpen ? "tooltip" : undefined}
        className="
          inline-flex items-center justify-center
          cursor-help outline-none
          focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1 
          focus-visible:ring-offset-background rounded
          transition-colors duration-150
        "
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {children || (
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
        )}
      </button>
      {tooltipContent}
    </span>
  );
}
