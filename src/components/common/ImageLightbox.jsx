/**
 * ImageLightbox - Full-featured image viewer with fullscreen support
 * 
 * Features:
 * - Full resolution image display
 * - Expanded mode (image fills available space)
 * - Minimize/maximize window
 * - Keyboard navigation (arrows for prev/next, Escape to close)
 * - Smooth animations with Framer Motion
 */

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Maximize2, Minimize2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download } from "lucide-react";

export default function ImageLightbox({
  images = [],
  initialIndex = 0,
  open = false,
  onClose,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isExpanded, setIsExpanded] = useState(false); // Image fills full space
  const [isMinimized, setIsMinimized] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setIsMinimized(false);
      setIsExpanded(false);
      setZoom(1);
    }
  }, [open, initialIndex]);

  // Lock body scroll when open
  useEffect(() => {
    if (open && !isMinimized) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [open, isMinimized]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setZoom(1);
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setZoom(1);
  }, [images.length]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
    setZoom(1); // Reset zoom when toggling expanded mode
  }, []);

  // Keyboard navigation - use capture phase to intercept before Modal's handler
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      switch (e.key) {
        case "Escape":
          // Stop event from reaching Modal's handler
          e.preventDefault();
          e.stopPropagation();
          if (isExpanded) {
            setIsExpanded(false);
          } else {
            onClose?.();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          goToPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          goToNext();
          break;
        case "f":
        case "F":
          toggleExpanded();
          break;
        default:
          break;
      }
    };

    // Add in capture phase to intercept before Modal's bubbling handler
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [open, isExpanded, onClose, goToPrev, goToNext, toggleExpanded]);

  const toggleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.5, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.5, 0.5));
  }, []);

  const handleDownload = useCallback(() => {
    const img = images[currentIndex];
    if (!img?.dataUrl) return;
    
    // Extract file extension from dataUrl (e.g., "data:image/png;base64,..." -> "png")
    let extension = "png";
    const match = img.dataUrl.match(/^data:image\/(\w+);/);
    if (match && match[1]) {
      extension = match[1] === "jpeg" ? "jpg" : match[1];
    }
    
    const filename = img.title 
      ? `${img.title}.${extension}` 
      : `image-${currentIndex + 1}.${extension}`;
    
    const link = document.createElement("a");
    link.href = img.dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [images, currentIndex]);

  if (!open || images.length === 0) return null;

  const currentImage = images[currentIndex];
  const hasMultiple = images.length > 1;

  // Minimized PiP-style view
  if (isMinimized) {
    return createPortal(
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        className="fixed bottom-4 right-4 z-[70] w-64 rounded-xl overflow-hidden shadow-2xl border border-accent/30 bg-card"
        drag
        dragConstraints={{ left: -200, right: 200, top: -400, bottom: 0 }}
      >
        {/* Mini header */}
        <div className="flex items-center justify-between px-2 py-1.5 bg-card/90 border-b border-accent/20">
          <span className="text-xs text-muted-foreground truncate">
            {currentImage.title || `Image ${currentIndex + 1}/${images.length}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleMinimize}
              className="p-1 rounded hover:bg-accent/20 transition-colors"
              title="Maximize"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-accent/20 transition-colors"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        
        {/* Mini image preview */}
        <div className="relative aspect-video bg-black/50">
          <img
            src={currentImage.dataUrl}
            alt={currentImage.title || "Preview"}
            className="w-full h-full object-contain"
          />
          
          {/* Mini navigation */}
          {hasMultiple && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs">
              <button onClick={goToPrev} className="p-0.5 hover:text-accent transition-colors">
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span>{currentIndex + 1}/{images.length}</span>
              <button onClick={goToNext} className="p-0.5 hover:text-accent transition-colors">
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </motion.div>,
      document.body
    );
  }

  // Full lightbox view
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex flex-col bg-black/95 backdrop-blur-md"
        onClick={onClose}
      >
        {/* Header toolbar - minimal in expanded mode */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`shrink-0 flex items-center justify-between px-4 bg-gradient-to-b from-black/60 to-transparent ${
            isExpanded ? 'py-2' : 'py-3'
          }`}
          style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left: Image title and counter */}
          <div className="flex items-center gap-3 min-w-0">
            {hasMultiple && (
              <span className="px-2.5 py-1 rounded-lg bg-white/10 text-sm font-medium text-white tabular-nums">
                {currentIndex + 1} / {images.length}
              </span>
            )}
            {currentImage.title && !isExpanded && (
              <span className="text-white/80 text-sm truncate max-w-xs">
                {currentImage.title}
              </span>
            )}
          </div>
          
          {/* Right: Action buttons */}
          <div className="flex items-center gap-1">
            {/* Zoom controls - hidden in expanded mode */}
            {!isExpanded && (
              <>
                <button
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                  className="p-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Zoom out"
                >
                  <ZoomOut className="h-5 w-5" />
                </button>
                <span className="px-2 text-sm text-white/60 tabular-nums min-w-[3rem] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                  className="p-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Zoom in"
                >
                  <ZoomIn className="h-5 w-5" />
                </button>
                
                <div className="w-px h-6 bg-white/20 mx-2" />
              </>
            )}
            
            {/* Download */}
            <button
              onClick={handleDownload}
              className="p-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              title="Download image"
            >
              <Download className="h-5 w-5" />
            </button>
            
            {/* Minimize */}
            <button
              onClick={toggleMinimize}
              className="p-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              title="Minimize to corner"
            >
              <Minimize2 className="h-5 w-5" />
            </button>
            
            {/* Expand image to full width */}
            <button
              onClick={toggleExpanded}
              className={`p-2.5 rounded-lg transition-colors ${
                isExpanded 
                  ? "text-accent bg-white/10" 
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
              title={isExpanded ? "Fit to screen (F)" : "Expand to full size (F)"}
            >
              <Maximize2 className="h-5 w-5" />
            </button>
            
            {/* Close */}
            <button
              onClick={onClose}
              className="p-2.5 sm:p-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Close (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </motion.div>

        {/* Main image area */}
        <div 
          className={`flex-1 relative flex items-center justify-center overflow-auto ${isExpanded ? 'px-0' : 'px-12'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Navigation arrows */}
          {hasMultiple && (
            <>
              <button
                onClick={goToPrev}
                className="absolute left-2 md:left-4 z-10 p-3 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-all hover:scale-110"
                title="Previous image (←)"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={goToNext}
                className="absolute right-2 md:right-4 z-10 p-3 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-all hover:scale-110"
                title="Next image (→)"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Image */}
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: isExpanded ? 1 : zoom }}
            transition={{ duration: 0.2 }}
            className={isExpanded ? "w-full h-full flex items-center justify-center" : "max-w-full max-h-full"}
          >
            <img
              src={currentImage.dataUrl}
              alt={currentImage.title || `Image ${currentIndex + 1}`}
              className={isExpanded 
                ? "max-w-full max-h-full object-contain shadow-2xl" 
                : "max-w-[90vw] max-h-[80vh] object-contain rounded-lg shadow-2xl"
              }
              draggable={false}
            />
          </motion.div>
        </div>

        {/* Bottom thumbnails (if multiple images) - hidden in expanded mode */}
        {hasMultiple && !isExpanded && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="shrink-0 px-4 py-3 bg-gradient-to-t from-black/60 to-transparent"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center gap-2 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={img.id || idx}
                  onClick={() => {
                    setCurrentIndex(idx);
                    setZoom(1);
                  }}
                  className={`shrink-0 h-14 w-20 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                    idx === currentIndex 
                      ? "border-accent ring-2 ring-accent/50" 
                      : "border-white/20 hover:border-white/40"
                  }`}
                >
                  <img
                    src={img.dataUrl}
                    alt={img.title || `Thumbnail ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
