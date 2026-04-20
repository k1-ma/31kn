import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap,
  Search,
  Play,
  CheckCircle,
  Clock,
  BookOpen,
  Trophy,
  Eye,
  X,
} from "lucide-react";
import Header from "../components/common/Header";
import { Card } from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import Modal from "../components/common/Modal";
import { VideoPlayer } from "../components/education/VideoPlayer";
import { educationApi } from "../lib/api";
import { useI18n } from "../i18n/I18nProvider";

/**
 * Education Page - User view for educational videos
 */
export default function Education({ reduceMotion = false, toast }) {
  const { t } = useI18n();
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false);

  // Detect landscape orientation on mobile (small viewport height)
  useEffect(() => {
    const checkLandscape = () => {
      const isSmallHeight = window.innerHeight <= 500;
      const isLandscape = window.innerWidth > window.innerHeight;
      setIsLandscapeMobile(isSmallHeight && isLandscape);
    };

    checkLandscape();
    window.addEventListener("resize", checkLandscape);

    const onOrientationChange = () => {
      // Small delay for orientation to settle
      setTimeout(checkLandscape, 150);
    };
    window.addEventListener("orientationchange", onOrientationChange);
    screen.orientation?.addEventListener("change", onOrientationChange);

    return () => {
      window.removeEventListener("resize", checkLandscape);
      window.removeEventListener("orientationchange", onOrientationChange);
      screen.orientation?.removeEventListener("change", onOrientationChange);
    };
  }, []);

  // Lock body scroll when landscape fullscreen overlay is active
  useEffect(() => {
    if (modalOpen && isLandscapeMobile) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [modalOpen, isLandscapeMobile]);

  // Fetch videos and categories
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [videosData, categoriesData] = await Promise.all([
        educationApi.list(),
        educationApi.categories(),
      ]);
      setVideos(videosData?.videos || []);
      setCategories(["All", ...(categoriesData?.categories || [])]);
    } catch (err) {
      console.error("[Education] Failed to fetch data:", err);
      toast?.error(t("education.errorLoading") || "Failed to load videos");
      // Ensure states are set to empty arrays on error
      setVideos([]);
      setCategories(["All"]);
    } finally {
      setLoading(false);
    }
  };

  // Filter videos
  const filteredVideos = useMemo(() => {
    // Ensure videos is an array before filtering
    if (!Array.isArray(videos)) return [];
    
    return videos.filter((video) => {
      const matchesCategory =
        selectedCategory === "All" || video.category === selectedCategory;
      const matchesSearch =
        !searchQuery ||
        video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [videos, selectedCategory, searchQuery]);

  // Calculate progress stats
  const stats = useMemo(() => {
    // Ensure videos is an array before calculating
    if (!Array.isArray(videos)) return { watched: 0, total: 0, remaining: 0, percentage: 0 };
    
    const watched = videos.filter((v) => v.watched).length;
    const total = videos.length;
    const remaining = total - watched;
    const percentage = total > 0 ? Math.round((watched / total) * 100) : 0;
    return { watched, total, remaining, percentage };
  }, [videos]);

  // Handle video click
  const handleVideoClick = (video) => {
    setSelectedVideo(video);
    setModalOpen(true);
  };

  // Handle mark as watched
  const handleMarkWatched = async () => {
    if (!selectedVideo) return;

    try {
      await educationApi.saveProgress(selectedVideo.id, {
        watched: true,
        progressSeconds: 0,
      });
      
      // Update local state
      setVideos((prev) =>
        (prev || []).map((v) =>
          v.id === selectedVideo.id ? { ...v, watched: true, watched_at: new Date().toISOString() } : v
        )
      );
      setSelectedVideo((prev) => ({ ...prev, watched: true }));
      toast?.success(t("education.markedWatched") || "Marked as watched");
    } catch (err) {
      console.error("[Education] Failed to mark as watched:", err);
      toast?.error(t("education.errorSaving") || "Failed to save progress");
    }
  };

  // Handle video end
  const handleVideoWatched = () => {
    if (!selectedVideo) return;
    
    // Update local state
    setVideos((prev) =>
      (prev || []).map((v) =>
        v.id === selectedVideo.id ? { ...v, watched: true, watched_at: new Date().toISOString() } : v
      )
    );
    setSelectedVideo((prev) => ({ ...prev, watched: true }));
  };

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen app-bg">
      <Header
        title={t("education.title") || "Education"}
        subtitle={t("education.subtitle") || "Learn trading strategies and platform features"}
      />

      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4 sm:space-y-5">
        {/* Stats + Progress Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Stat Cards */}
          <Card className="p-3.5 flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-accent/10">
              <BookOpen className="h-4 w-4 text-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                {t("education.totalLabel") || "Total"}
              </p>
              <p className="text-lg font-bold text-foreground leading-tight">{stats.total}</p>
            </div>
          </Card>

          <Card className="p-3.5 flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-emerald-500/10">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                {t("education.watched") || "Watched"}
              </p>
              <p className="text-lg font-bold text-foreground leading-tight">{stats.watched}</p>
            </div>
          </Card>

          <Card className="p-3.5 flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-amber-500/10">
              <Eye className="h-4 w-4 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                {t("education.remainingLabel") || "Remaining"}
              </p>
              <p className="text-lg font-bold text-foreground leading-tight">{stats.remaining}</p>
            </div>
          </Card>

          {/* Compact Progress Card */}
          <Card className="p-3.5 flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-accent/10">
              <Trophy className="h-4 w-4 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                  {t("education.progress") || "Progress"}
                </p>
                <span className="text-[11px] font-semibold text-accent">{stats.percentage}%</span>
              </div>
              <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent to-accent-2 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.percentage}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Search + Category Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("education.search") || "Search videos..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 flex-1">
            {(categories || []).map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`
                  px-3 py-1 rounded-md text-[12px] font-medium whitespace-nowrap transition-all
                  ${selectedCategory === category
                    ? "bg-accent text-on-accent shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }
                `}
              >
                {t(`education.categories.${category}`) || category}
              </button>
            ))}
          </div>
        </div>

        {/* Videos Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="p-0 overflow-hidden">
                <div className="aspect-video bg-muted animate-pulse" />
                <div className="p-3.5 space-y-2.5">
                  <div className="h-5 bg-muted rounded animate-pulse" />
                  <div className="h-4 bg-muted rounded w-2/3 animate-pulse" />
                </div>
              </Card>
            ))}
          </div>
        ) : filteredVideos.length === 0 ? (
          <Card className="p-10">
            <div className="text-center">
              <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-muted/50 mx-auto mb-4">
                <GraduationCap className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                {t("education.noVideos") || "No videos found"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("education.noVideosHint") || "Try adjusting your filters"}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(filteredVideos || []).map((video, index) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.25, delay: reduceMotion ? 0 : index * 0.04 }}
              >
                <Card
                  className="p-0 overflow-hidden cursor-pointer hover:ring-1 hover:ring-accent/40 transition-all group"
                  onClick={() => handleVideoClick(video)}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-gradient-to-br from-accent/10 to-accent-2/10">
                    {video.bunny_thumbnail_url ? (
                      <img
                        src={video.bunny_thumbnail_url}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <GraduationCap className="h-12 w-12 text-muted-foreground/20" />
                      </div>
                    )}
                    
                    {/* Play overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Play className="h-6 w-6 text-white ml-0.5" fill="white" />
                      </div>
                    </div>

                    {/* Watched indicator */}
                    {video.watched && (
                      <div className="absolute top-2 right-2">
                        <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                          <CheckCircle className="h-3.5 w-3.5 text-white" />
                        </div>
                      </div>
                    )}

                    {/* Duration */}
                    {video.duration_seconds > 0 && (
                      <div className="absolute bottom-2 right-2">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[11px] font-medium backdrop-blur-sm">
                          <Clock className="h-3 w-3" />
                          {formatDuration(video.duration_seconds)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3.5">
                    <h3 className="text-[13px] font-semibold text-foreground mb-1.5 line-clamp-2 leading-snug">
                      {video.title}
                    </h3>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {t(`education.categories.${video.category}`) || video.category}
                      </span>
                      {video.progress_seconds > 0 && !video.watched && (
                        <span className="text-[11px] text-accent font-medium">
                          {t("education.resume") || "Resume"} ›
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Video Modal - Fullscreen overlay on landscape mobile, normal modal otherwise */}
      <AnimatePresence>
        {modalOpen && selectedVideo && isLandscapeMobile ? (
          /* Fullscreen landscape overlay for mobile */
          <motion.div
            key="landscape-overlay"
            className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <VideoPlayer
              videoId={selectedVideo.id}
              onWatched={handleVideoWatched}
              fullscreen
            />
            {/* Floating close button */}
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-2 right-2 z-[61] h-9 w-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </motion.div>
        ) : modalOpen && selectedVideo ? (
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title={selectedVideo.title}
            size="xl"
          >
            <div className="space-y-4">
              {/* Video Player */}
              <VideoPlayer
                videoId={selectedVideo.id}
                onWatched={handleVideoWatched}
              />

              {/* Video Info */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {t(`education.categories.${selectedVideo.category}`) || selectedVideo.category}
                    </Badge>
                    {selectedVideo.watched && (
                      <Badge variant="success" className="bg-success text-on-success">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {t("education.watched") || "Watched"}
                      </Badge>
                    )}
                  </div>
                  {!selectedVideo.watched && (
                    <Button onClick={handleMarkWatched} size="sm">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {t("education.markWatched") || "Mark as Watched"}
                    </Button>
                  )}
                </div>

                {selectedVideo.description && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                      {t("education.description") || "Description"}
                    </h3>
                    <p className="text-foreground whitespace-pre-wrap">
                      {selectedVideo.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Modal>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
