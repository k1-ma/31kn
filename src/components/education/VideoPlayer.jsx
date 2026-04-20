import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { educationApi } from "../../lib/api";
import Button from "../ui/Button";

/**
 * VideoPlayer - Protected video player component using Bunny Stream iframe
 * 
 * Features:
 * - Secure signed embed URLs with auto-refresh
 * - Protection against right-click and download
 * - Auto-save progress on video end
 * - Responsive 16:9 aspect ratio (or fullscreen mode for landscape mobile)
 * - Loading and error states
 */
export function VideoPlayer({ videoId, onProgress, onWatched, fullscreen = false }) {
  const [embedUrl, setEmbedUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const refreshTimerRef = useRef(null);

  // Fetch embed URL
  const fetchEmbedUrl = async (isRetry = false) => {
    if (isRetry) {
      setRetrying(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await educationApi.getEmbedUrl(videoId);
      setEmbedUrl(data.embedUrl);
      setError(null);

      // Schedule refresh 5 minutes before expiry (55 minutes for 1-hour token)
      const refreshIn = (data.expiresIn - 300) * 1000; // Convert to ms, refresh 5 min early
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        fetchEmbedUrl(false);
      }, refreshIn);
    } catch (err) {
      console.error("[VideoPlayer] Failed to fetch embed URL:", err);
      setError(err.message || "Failed to load video");
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  };

  useEffect(() => {
    fetchEmbedUrl();

    // Cleanup timer on unmount
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [videoId]);

  // Handle video end (if Bunny player sends postMessage)
  useEffect(() => {
    const handleMessage = (event) => {
      // Verify origin is from Bunny CDN - must end with mediadelivery.net or be exactly that
      const origin = event.origin;
      const isValidOrigin = 
        origin === "https://iframe.mediadelivery.net" ||
        origin === "https://mediadelivery.net" ||
        (origin.startsWith("https://") && origin.endsWith(".mediadelivery.net"));
      
      if (!isValidOrigin) return;

      try {
        const data = JSON.parse(event.data);
        if (data.event === "ended" || data.event === "finish") {
          // Mark as watched
          if (onWatched) {
            onWatched();
          }
          // Save progress
          educationApi.saveProgress(videoId, { watched: true, progressSeconds: 0 }).catch((err) => {
            console.error("[VideoPlayer] Failed to save progress:", err);
          });
        }
      } catch (err) {
        // Ignore parsing errors
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [videoId, onWatched]);

  // Container classes based on fullscreen mode
  const containerClass = fullscreen
    ? "relative w-full h-full bg-black overflow-hidden"
    : "relative w-full bg-gray-900 rounded-lg overflow-hidden";
  const containerStyle = fullscreen ? undefined : { paddingBottom: "56.25%" };

  // Loading state
  if (loading) {
    return (
      <div className={containerClass} style={containerStyle}>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-400 text-sm">Loading video...</p>
          </motion.div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={containerClass} style={containerStyle}>
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-md"
          >
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-gray-300 mb-2">Failed to load video</p>
            <p className="text-gray-500 text-sm mb-4">{error}</p>
            <Button
              onClick={() => fetchEmbedUrl(true)}
              disabled={retrying}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {retrying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </>
              )}
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  // Video player
  return (
    <div
      className={`${containerClass} group`}
      style={containerStyle}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Iframe */}
      <iframe
        src={embedUrl}
        className="absolute inset-0 w-full h-full"
        sandbox="allow-scripts allow-same-origin"
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        style={{ border: "none" }}
      />
      
      {/* Overlay to prevent right-click (invisible, positioned above iframe) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 1 }}
      />
    </div>
  );
}
