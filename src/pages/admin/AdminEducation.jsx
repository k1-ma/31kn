import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronUp,
  ChevronDown,
  X,
  Play,
} from "lucide-react";
import { educationApi } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import Switch from "../../components/ui/Switch";
import Modal from "../../components/common/Modal";
import ToastViewport from "../../components/common/ToastViewport";
import { useToasts } from "../../components/common/toast";
import AdminLayout from "./AdminLayout.jsx";
import { useI18n } from "../../i18n/I18nProvider";

const VIDEO_CATEGORIES = [
  "Basics",
  "Strategy",
  "RiskManagement",
  "Psychology",
  "TechnicalAnalysis",
  "Platform",
  "Other",
];

const MAX_VIDEO_SIZE_MB = 2000; // 2GB
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

const CATEGORY_COLORS = {
  Basics: "bg-blue-500/20 text-blue-400",
  Strategy: "bg-purple-500/20 text-purple-400",
  RiskManagement: "bg-red-500/20 text-red-400",
  Psychology: "bg-amber-500/20 text-amber-400",
  TechnicalAnalysis: "bg-emerald-500/20 text-emerald-400",
  Platform: "bg-pink-500/20 text-pink-400",
  Other: "bg-slate-500/20 text-slate-400",
};

const CATEGORY_COLOR_PRESETS = [
  { value: "bg-blue-500/20 text-blue-400", hex: "#3b82f6", label: "Blue" },
  { value: "bg-purple-500/20 text-purple-400", hex: "#a855f7", label: "Purple" },
  { value: "bg-red-500/20 text-red-400", hex: "#ef4444", label: "Red" },
  { value: "bg-amber-500/20 text-amber-400", hex: "#f59e0b", label: "Amber" },
  { value: "bg-emerald-500/20 text-emerald-400", hex: "#10b981", label: "Green" },
  { value: "bg-pink-500/20 text-pink-400", hex: "#ec4899", label: "Pink" },
  { value: "bg-teal-500/20 text-teal-400", hex: "#14b8a6", label: "Teal" },
  { value: "bg-indigo-500/20 text-indigo-400", hex: "#6366f1", label: "Indigo" },
  { value: "bg-cyan-500/20 text-cyan-400", hex: "#06b6d4", label: "Cyan" },
  { value: "bg-orange-500/20 text-orange-400", hex: "#f97316", label: "Orange" },
  { value: "bg-slate-500/20 text-slate-400", hex: "#64748b", label: "Slate" },
];

const STATUS_INFO = {
  uploading: { label: "Uploading", icon: Upload, color: "text-blue-400" },
  processing: { label: "Processing", icon: Loader2, color: "text-amber-400" },
  ready: { label: "Ready", icon: CheckCircle, color: "text-green-400" },
  failed: { label: "Failed", icon: AlertCircle, color: "text-red-400" },
};

/**
 * Upload Video Form
 */
function UploadForm({ onUpload, onCancel, uploading, toast, uploadProgress, categories }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [isPublished, setIsPublished] = useState(false);
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer?.files;
    if (files && files[0]) {
      const droppedFile = files[0];
      
      if (droppedFile.size > MAX_VIDEO_SIZE_BYTES) {
        toast?.push({ 
          title: t("admin.education.form.fileTooLarge") || "File too large", 
          description: `File size exceeds ${MAX_VIDEO_SIZE_MB}MB limit. Selected: ${(droppedFile.size / 1024 / 1024).toFixed(2)}MB`,
          tone: "danger" 
        });
        return;
      }
      
      setFile(droppedFile);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      if (selectedFile.size > MAX_VIDEO_SIZE_BYTES) {
        toast?.push({ 
          title: t("admin.education.form.fileTooLarge") || "File too large", 
          description: `File size exceeds ${MAX_VIDEO_SIZE_MB}MB limit. Selected: ${(selectedFile.size / 1024 / 1024).toFixed(2)}MB`,
          tone: "danger" 
        });
        e.target.value = null; // Reset input
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !file) return;

    onUpload({
      file,
      title: title.trim(),
      description: description.trim(),
      category,
      is_published: isPublished,
    });
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* File Upload */}
      <div>
        <label className="text-sm font-medium mb-2 block text-gray-700 dark:text-gray-300">
          {t("admin.education.form.file") || "Video File"}
        </label>
        <div
          className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
            dragActive
              ? "border-blue-500 bg-blue-500/10 dark:bg-blue-500/10"
              : "border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-transparent hover:border-gray-400 dark:hover:border-gray-500"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={handleFileChange}
            className="hidden"
          />

          {file ? (
            <div className="flex items-center justify-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{file.name}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{formatFileSize(file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFile(null)}
                className="ml-auto rounded-lg"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div>
              <Upload className="h-12 w-12 text-gray-400 dark:text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                {t("admin.education.form.dropzone") || "Drag & drop video file here"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">
                {t("admin.education.form.formats") || "MP4, WebM, QuickTime"}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg"
              >
                {t("admin.education.form.browse") || "Browse Files"}
              </Button>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                {t("admin.education.form.maxSize") || `Max size: ${MAX_VIDEO_SIZE_MB}MB`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="text-sm font-medium mb-1 block text-gray-700 dark:text-gray-300">
          {t("admin.education.form.title") || "Title"}
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter video title..."
          maxLength={500}
          className="rounded-xl"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-medium mb-1 block text-gray-700 dark:text-gray-300">
          {t("admin.education.form.description") || "Description"}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter video description..."
          maxLength={5000}
          rows={4}
          className="w-full px-4 py-3 rounded-xl bg-gray-50/50 dark:bg-muted/20 border border-gray-300 dark:border-border/50 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all"
        />
      </div>

      {/* Category */}
      <div>
        <label className="text-sm font-medium mb-1 block text-gray-700 dark:text-gray-300">
          {t("admin.education.form.category") || "Category"}
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-4 py-2 rounded-xl bg-gray-50/50 dark:bg-muted/20 border border-gray-300 dark:border-border/50 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all"
        >
          {(categories || []).map((cat) => (
            <option key={cat.name} value={cat.name}>
              {cat.display_name}
            </option>
          ))}
        </select>
      </div>

      {/* Published */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-border/50 bg-gray-50/50 dark:bg-muted/10 p-4">
        <div>
          <div className="font-medium text-sm text-gray-900 dark:text-white">
            {t("admin.education.form.published") || "Published"}
          </div>
          <div className="text-xs text-gray-600 dark:text-muted-foreground">
            {t("admin.education.form.publishedHint") || "Make video visible to users"}
          </div>
        </div>
        <Switch checked={isPublished} onCheckedChange={setIsPublished} />
      </div>

      {/* Buttons */}
      <div className="space-y-3">
        {uploading && uploadProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("admin.education.uploadingMessage") || "Uploading video..."}</span>
              </div>
              <span className="font-mono font-semibold">{uploadProgress.percent}%</span>
            </div>
            <div 
              className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
              role="progressbar"
              aria-label={t("admin.education.uploadProgress") || "Upload progress"}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={uploadProgress.percent || 0}
            >
              <div 
                className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
                style={{ width: `${uploadProgress.percent || 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>
                {uploadProgress.loaded} / {uploadProgress.total}
              </span>
              <span>
                {uploadProgress.speed} • {uploadProgress.timeRemaining}
              </span>
            </div>
          </div>
        )}
        {uploading && !uploadProgress && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("admin.education.uploadingMessage") || "Uploading video, please wait..."}</span>
            </div>
            <div 
              className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
              role="progressbar"
              aria-label={t("admin.education.uploadProgress") || "Upload progress"}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="0"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-600 animate-pulse" />
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <Button 
            type="button" 
            variant="ghost" 
            onClick={onCancel} 
            disabled={uploading}
            className="rounded-xl"
          >
            {t("common.cancel") || "Cancel"}
          </Button>
          <Button
            type="submit"
            disabled={!title.trim() || !file || uploading}
            className="rounded-xl shadow-md hover:shadow-lg"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("admin.education.uploading") || "Uploading..."}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {t("admin.education.upload") || "Upload Video"}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * Edit Video Form
 */
function EditForm({ video, onSave, onCancel, saving, categories }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(video?.title || "");
  const [description, setDescription] = useState(video?.description || "");
  const [category, setCategory] = useState(video?.category || "Other");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim(),
      category,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1 block text-gray-700 dark:text-gray-300">
          {t("admin.education.form.title") || "Title"}
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter video title..."
          maxLength={500}
          className="rounded-xl"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block text-gray-700 dark:text-gray-300">
          {t("admin.education.form.description") || "Description"}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter video description..."
          maxLength={5000}
          rows={4}
          className="w-full px-4 py-3 rounded-xl bg-gray-50/50 dark:bg-muted/20 border border-gray-300 dark:border-border/50 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block text-gray-700 dark:text-gray-300">
          {t("admin.education.form.category") || "Category"}
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-4 py-2 rounded-xl bg-gray-50/50 dark:bg-muted/20 border border-gray-300 dark:border-border/50 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all"
        >
          {(categories || []).map((cat) => (
            <option key={cat.name} value={cat.name}>
              {cat.display_name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} className="rounded-xl">
          {t("common.cancel") || "Cancel"}
        </Button>
        <Button type="submit" disabled={!title.trim() || saving} className="rounded-xl">
          {saving ? t("common.working") || "Saving..." : t("common.save") || "Save"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Category Management Modal
 */
function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_COLOR_PRESETS.map((preset) => (
        <button
          key={preset.value}
          type="button"
          onClick={() => onChange(preset.value)}
          className={`w-7 h-7 rounded-lg transition-all ${
            value === preset.value
              ? "ring-2 ring-offset-2 ring-offset-background ring-accent scale-110"
              : "hover:scale-110"
          }`}
          style={{ backgroundColor: preset.hex }}
          title={preset.label}
        />
      ))}
    </div>
  );
}

function CategoryManagementModal({ categories, onClose, onSave, onDelete, saving }) {
  const { t } = useI18n();
  const [newName, setNewName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newColor, setNewColor] = useState("bg-slate-500/20 text-slate-400");
  const [editingId, setEditingId] = useState(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editColor, setEditColor] = useState("");

  const handleAdd = () => {
    if (!newName.trim() || !newDisplayName.trim()) {
      return;
    }
    onSave({
      name: newName.trim(),
      display_name: newDisplayName.trim(),
      color: newColor,
    });
    setNewName("");
    setNewDisplayName("");
    setNewColor("bg-slate-500/20 text-slate-400");
  };

  const handleEdit = (category) => {
    setEditingId(category.id);
    setEditDisplayName(category.display_name);
    setEditColor(category.color);
  };

  const handleSaveEdit = (category) => {
    onSave({
      id: category.id,
      display_name: editDisplayName.trim(),
      color: editColor,
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Add New Category */}
      <div className="border border-border/50 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-sm">{t("admin.education.addCategory") || "Add New Category"}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            placeholder={t("admin.education.categoryName") || "Name (e.g., MyCategory)"}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            placeholder={t("admin.education.categoryDisplayName") || "Display Name"}
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">
            {t("admin.education.categoryColor") || "Color"}
          </label>
          <ColorPicker value={newColor} onChange={setNewColor} />
        </div>
        <div className="flex items-center gap-3">
          <Button 
            size="sm" 
            onClick={handleAdd}
            disabled={!newName.trim() || !newDisplayName.trim() || saving}
            className="rounded-xl"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("common.add") || "Add"}
          </Button>
          {newDisplayName && (
            <Badge className={newColor}>{newDisplayName}</Badge>
          )}
        </div>
      </div>

      {/* Existing Categories */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">{t("admin.education.existingCategories") || "Existing Categories"}</h3>
        {categories.map((category) => (
          <div
            key={category.id}
            className="flex items-center justify-between gap-2 p-3 rounded-xl border border-border/50 bg-muted/10"
          >
            {editingId === category.id ? (
              <div className="flex-1 space-y-3">
                <Input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  size="sm"
                  placeholder={t("admin.education.categoryDisplayName") || "Display Name"}
                />
                <ColorPicker value={editColor} onChange={setEditColor} />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSaveEdit(category)}
                    disabled={saving}
                    className="rounded-lg"
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    {t("common.save") || "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg"
                  >
                    <X className="h-4 w-4 mr-1" />
                    {t("common.cancel") || "Cancel"}
                  </Button>
                  {editDisplayName && (
                    <Badge className={editColor}>{editDisplayName}</Badge>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-1">
                  <Badge className={category.color}>{category.display_name}</Badge>
                  <span className="text-xs text-muted-foreground font-mono">{category.name}</span>
                  {category.is_system && (
                    <Badge variant="outline" className="text-xs">
                      {t("admin.education.systemCategory") || "System"}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit(category)}
                    disabled={saving}
                    className="rounded-lg"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(category)}
                    disabled={saving}
                    className="rounded-lg text-red-600 dark:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose} className="rounded-xl">
          {t("common.close") || "Close"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Video Row Component
 */
function VideoRow({
  video,
  onEdit,
  onDelete,
  onTogglePublish,
  onCheckStatus,
  onPreview,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}) {
  const { t } = useI18n();
  const statusInfo = STATUS_INFO[video.status] || STATUS_INFO.uploading;
  const StatusIcon = statusInfo.icon;

  const formatDuration = (seconds) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between gap-4 p-3 md:p-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]/25 glass hover:bg-[rgb(var(--card))]/40 transition-all"
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Thumbnail */}
        <div className="relative w-32 h-18 rounded-lg overflow-hidden bg-gradient-to-br from-blue-900 to-purple-900 shrink-0">
          {video.bunny_thumbnail_url ? (
            <img
              src={video.bunny_thumbnail_url}
              alt={video.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <GraduationCap className="h-8 w-8 text-white/30" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-gray-900 dark:text-white truncate">{video.title}</h3>
            {video.is_published ? (
              <Badge variant="success" className="shrink-0 bg-green-600">
                <Eye className="h-3 w-3 mr-1" />
                {t("admin.education.published") || "Published"}
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0">
                <EyeOff className="h-3 w-3 mr-1" />
                {t("admin.education.draft") || "Draft"}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`shrink-0 ${CATEGORY_COLORS[video.category] || ""}`}
            >
              {t(`education.categories.${video.category}`) || video.category}
            </Badge>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <StatusIcon
                className={`h-4 w-4 ${statusInfo.color} ${
                  video.status === "processing" ? "animate-spin" : ""
                }`}
              />
              <span>{t(`admin.education.${video.status}`) || statusInfo.label}</span>
            </div>
            {video.duration_seconds > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{formatDuration(video.duration_seconds)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Reorder */}
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onMoveUp}
            disabled={isFirst}
            className="h-7 w-7 p-0 rounded-lg hover:bg-gray-100 dark:hover:bg-muted/50"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onMoveDown}
            disabled={isLast}
            className="h-7 w-7 p-0 rounded-lg hover:bg-gray-100 dark:hover:bg-muted/50"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>

        {/* Check Status */}
        {(video.status === "processing" || video.status === "failed") && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onCheckStatus}
            className="rounded-lg hover:bg-gray-100 dark:hover:bg-muted/50"
            title={t("admin.education.checkStatus") || "Refresh status from Bunny"}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}

        {/* Publish Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onTogglePublish}
          disabled={video.status !== "ready"}
          className="rounded-lg hover:bg-gray-100 dark:hover:bg-muted/50"
        >
          {video.is_published ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>

        {/* Preview */}
        {video.status === "ready" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onPreview}
            className="rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400"
            title={t("admin.education.preview") || "Preview"}
          >
            <Play className="h-4 w-4" />
          </Button>
        )}

        {/* Edit */}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onEdit}
          className="rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400"
        >
          <Edit2 className="h-4 w-4" />
        </Button>

        {/* Delete */}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onDelete} 
          className="rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}

/**
 * Admin Education Page
 */
export default function AdminEducation() {
  const { t } = useI18n();
  const toast = useToasts();
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewEmbedUrl, setPreviewEmbedUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  // Fetch videos and categories
  useEffect(() => {
    fetchVideos();
    fetchCategories();
  }, []);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const data = await educationApi.adminList();
      setVideos(data?.videos || []);
    } catch (err) {
      console.error("[AdminEducation] Failed to fetch videos:", err);
      toast.push({ title: t("admin.education.toasts.loadFailed") || "Failed to load videos", tone: "danger" });
      // Ensure videos is set to empty array on error
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await educationApi.adminListCategories();
      setCategories(data?.categories || []);
    } catch (err) {
      console.error("[AdminEducation] Failed to fetch categories:", err);
      setCategories([]);
    }
  };

  // Category management
  const handleSaveCategory = async (data) => {
    setSaving(true);
    try {
      if (data.id) {
        // Update existing category
        await educationApi.adminUpdateCategory(data.id, {
          display_name: data.display_name,
          color: data.color,
        });
        toast.push({ title: t("admin.education.toasts.categoryUpdated") || "Category updated", tone: "success" });
      } else {
        // Create new category
        await educationApi.adminCreateCategory(data);
        toast.push({ title: t("admin.education.toasts.categoryCreated") || "Category created", tone: "success" });
      }
      fetchCategories();
    } catch (err) {
      console.error("[AdminEducation] Save category failed:", err);
      toast.push({ 
        title: t("admin.education.toasts.categorySaveFailed") || "Failed to save category", 
        description: err.message,
        tone: "danger" 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (category) => {
    if (!confirm(t("admin.education.deleteCategoryConfirm") || `Delete category "${category.display_name}"?`)) return;
    
    try {
      await educationApi.adminDeleteCategory(category.id);
      toast.push({ title: t("admin.education.toasts.categoryDeleted") || "Category deleted", tone: "success" });
      fetchCategories();
    } catch (err) {
      console.error("[AdminEducation] Delete category failed:", err);
      toast.push({ 
        title: t("admin.education.toasts.categoryDeleteFailed") || "Failed to delete category",
        description: err.message,
        tone: "danger" 
      });
    }
  };

  // Upload video (direct upload to Bunny Stream, bypasses Vercel payload limit)
  const handleUpload = async ({ file, title, description, category, is_published }) => {
    setUploading(true);
    setUploadProgress(null);
    
    // Helper to format bytes
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };
    
    // Helper to format time
    const formatTime = (seconds) => {
      if (!isFinite(seconds) || seconds < 0) return '...';
      if (seconds < 60) return `${Math.round(seconds)}s`;
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    };
    
    try {
      // Step 1: Create video on Bunny Stream and get upload credentials
      const createData = await educationApi.adminCreateUpload({
        title,
        description,
        category,
        is_published,
        fileSize: file.size,
      });

      if (!createData?.ok || !createData?.upload) {
        throw new Error("Failed to create upload session");
      }

      const { videoId, upload: creds } = createData;

      // Step 2: Upload file directly to Bunny Stream via TUS protocol
      // TUS Create: POST to get upload location
      const tusCreateRes = await fetch(creds.tusEndpoint, {
        method: "POST",
        headers: {
          "AuthorizationSignature": creds.authorizationSignature,
          "AuthorizationExpire": String(creds.authorizationExpire),
          "VideoId": videoId,
          "LibraryId": creds.libraryId,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(file.size),
          "Upload-Metadata": [
            `filetype ${btoa(file.type)}`,
            `title ${btoa(unescape(encodeURIComponent(title)))}`,
          ].join(","),
        },
      });

      if (tusCreateRes.status !== 201 && tusCreateRes.status !== 200) {
        throw new Error(`TUS create failed: HTTP ${tusCreateRes.status}`);
      }

      let uploadLocation = tusCreateRes.headers.get("Location");
      if (!uploadLocation) {
        throw new Error("TUS create did not return upload location");
      }

      // Resolve relative Location against Bunny TUS endpoint origin
      if (uploadLocation.startsWith("/")) {
        const tusUrl = new URL(creds.tusEndpoint);
        uploadLocation = tusUrl.origin + uploadLocation;
      }

      // TUS Upload: PATCH to upload the file data with progress tracking
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const startTime = Date.now();
        let lastLoaded = 0;
        let lastTime = startTime;
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const now = Date.now();
            const timeDiff = (now - lastTime) / 1000; // seconds
            const loadedDiff = e.loaded - lastLoaded;
            
            // Calculate speed (bytes per second)
            const speed = timeDiff > 0 ? loadedDiff / timeDiff : 0;
            const remaining = e.total - e.loaded;
            const timeRemaining = speed > 0 ? remaining / speed : 0;
            
            setUploadProgress({
              percent: Math.round((e.loaded / e.total) * 100),
              loaded: formatBytes(e.loaded),
              total: formatBytes(e.total),
              speed: `${formatBytes(speed)}/s`,
              timeRemaining: formatTime(timeRemaining),
            });
            
            lastLoaded = e.loaded;
            lastTime = now;
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`TUS upload failed: HTTP ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed due to network error'));
        });
        
        xhr.addEventListener('abort', () => {
          reject(new Error('Upload was aborted'));
        });
        
        xhr.open('PATCH', uploadLocation);
        xhr.setRequestHeader("AuthorizationSignature", creds.authorizationSignature);
        xhr.setRequestHeader("AuthorizationExpire", String(creds.authorizationExpire));
        xhr.setRequestHeader("VideoId", videoId);
        xhr.setRequestHeader("LibraryId", creds.libraryId);
        xhr.setRequestHeader("Tus-Resumable", "1.0.0");
        xhr.setRequestHeader("Upload-Offset", "0");
        xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
        xhr.send(file);
      });

      // Step 3: Confirm upload in database
      await educationApi.adminConfirmUpload({
        videoId,
        title,
        description,
        category,
        is_published,
        fileSize: file.size,
      });

      toast.push({ title: t("admin.education.toasts.created") || "Video uploaded successfully", tone: "success" });
      setUploadModalOpen(false);
      setUploadProgress(null);
      fetchVideos();
    } catch (err) {
      console.error("[AdminEducation] Upload failed:", err);
      toast.push({ title: err.message || t("admin.education.toasts.uploadFailed") || "Upload failed", tone: "danger" });
    } finally {
      setUploading(false);
    }
  };

  // Edit video
  const handleEdit = async (data) => {
    if (!editingVideo) return;
    setSaving(true);
    try {
      await educationApi.adminUpdate(editingVideo.id, data);
      toast.push({ title: t("admin.education.toasts.updated") || "Video updated successfully", tone: "success" });
      setEditModalOpen(false);
      setEditingVideo(null);
      fetchVideos();
    } catch (err) {
      console.error("[AdminEducation] Update failed:", err);
      toast.push({ title: t("admin.education.toasts.updateFailed") || "Update failed", tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  // Delete video
  const handleDelete = async (video) => {
    if (!confirm(t("admin.education.deleteConfirm") || `Delete "${video.title}"?`)) return;

    try {
      await educationApi.adminDelete(video.id);
      toast.push({ title: t("admin.education.toasts.deleted") || "Video deleted successfully", tone: "success" });
      fetchVideos();
    } catch (err) {
      console.error("[AdminEducation] Delete failed:", err);
      toast.push({ title: t("admin.education.toasts.deleteFailed") || "Delete failed", tone: "danger" });
    }
  };

  // Toggle publish
  const handleTogglePublish = async (video) => {
    try {
      await educationApi.adminTogglePublish(video.id);
      toast.push({
        title: video.is_published
          ? t("admin.education.toasts.unpublished") || "Video unpublished"
          : t("admin.education.toasts.published") || "Video published",
        tone: "success",
      });
      fetchVideos();
    } catch (err) {
      console.error("[AdminEducation] Publish toggle failed:", err);
      toast.push({ title: t("admin.education.toasts.publishFailed") || "Failed to update status", tone: "danger" });
    }
  };

  // Check status
  const handleCheckStatus = async (video) => {
    try {
      const data = await educationApi.adminCheckStatus(video.id);
      toast.push({
        title: t("admin.education.toasts.statusUpdated") || `Status: ${data.status}`,
        tone: "success",
      });
      fetchVideos();
    } catch (err) {
      console.error("[AdminEducation] Status check failed:", err);
      toast.push({ title: t("admin.education.toasts.statusFailed") || "Failed to check status", tone: "danger" });
    }
  };

  // Preview video
  const handlePreview = async (video) => {
    setPreviewVideo(video);
    setPreviewModalOpen(true);
    setPreviewLoading(true);
    setPreviewEmbedUrl(null);
    try {
      const data = await educationApi.adminGetEmbedUrl(video.id);
      setPreviewEmbedUrl(data.embedUrl);
    } catch (err) {
      console.error("[AdminEducation] Preview failed:", err);
      toast.push({ title: t("admin.education.toasts.previewFailed") || "Failed to load video preview", tone: "danger" });
      setPreviewModalOpen(false);
      setPreviewVideo(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Reorder videos
  const handleMove = async (index, direction) => {
    // Ensure videos is an array before spreading
    if (!Array.isArray(videos)) {
      console.error("[AdminEducation] videos is not an array:", videos);
      return;
    }
    
    const newVideos = [...videos];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newVideos.length) return;

    // Swap
    [newVideos[index], newVideos[targetIndex]] = [newVideos[targetIndex], newVideos[index]];

    setVideos(newVideos);

    try {
      await educationApi.adminReorder(newVideos.map((v, i) => ({ id: v.id, order: i })));
    } catch (err) {
      console.error("[AdminEducation] Reorder failed:", err);
      toast.push({ title: t("admin.education.toasts.reorderFailed") || "Failed to reorder", tone: "danger" });
      fetchVideos(); // Revert on error
    }
  };

  return (
    <AdminLayout
      title={t("admin.nav.education") || "Education Management"}
      subtitle={t("admin.education.subtitle") || "Manage educational videos"}
      actions={
        <>
          <Button variant="ghost" className="rounded-xl" onClick={fetchVideos} title={t("common.refresh")}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="rounded-xl" onClick={() => setUploadModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> {t("admin.education.addVideo") || "Upload Video"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Stats and Controls Card */}
        <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" /> {t("admin.nav.education") || "Videos"}
                <span className="text-sm font-normal text-muted-foreground">
                  ({videos.length})
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryModalOpen(true);
                }}
              >
                {t("admin.education.manageCategories") || "Manage Categories"}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-muted/20 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !Array.isArray(videos) || videos.length === 0 ? (
              <div className="text-center py-12">
                <GraduationCap className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {t("admin.education.noVideos") || "No videos yet"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {(videos || []).map((video, index) => (
                    <VideoRow
                      key={video.id}
                      video={video}
                      onEdit={() => {
                        setEditingVideo(video);
                        setEditModalOpen(true);
                      }}
                      onDelete={() => handleDelete(video)}
                      onTogglePublish={() => handleTogglePublish(video)}
                      onCheckStatus={() => handleCheckStatus(video)}
                      onPreview={() => handlePreview(video)}
                      onMoveUp={() => handleMove(index, "up")}
                      onMoveDown={() => handleMove(index, "down")}
                      isFirst={index === 0}
                      isLast={index === videos.length - 1}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload Modal */}
      <Modal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title={t("admin.education.addVideo") || "Upload Video"}
        size="lg"
      >
        <UploadForm
          onUpload={handleUpload}
          onCancel={() => setUploadModalOpen(false)}
          uploading={uploading}
          toast={toast}
          uploadProgress={uploadProgress}
          categories={categories}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingVideo(null);
        }}
        title={t("admin.education.editVideo") || "Edit Video"}
        size="lg"
      >
        <EditForm
          video={editingVideo}
          onSave={handleEdit}
          onCancel={() => {
            setEditModalOpen(false);
            setEditingVideo(null);
          }}
          saving={saving}
          categories={categories}
        />
      </Modal>

      {/* Preview Modal */}
      <Modal
        open={previewModalOpen}
        onClose={() => {
          setPreviewModalOpen(false);
          setPreviewVideo(null);
          setPreviewEmbedUrl(null);
        }}
        title={previewVideo?.title || t("admin.education.preview") || "Preview Video"}
        size="xl"
      >
        <div className="space-y-4">
          {previewLoading ? (
            <div className="relative w-full bg-gray-900 rounded-lg overflow-hidden" style={{ paddingBottom: "56.25%" }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
                  <p className="text-gray-400 text-sm">{t("admin.education.loadingPreview") || "Loading video..."}</p>
                </div>
              </div>
            </div>
          ) : previewEmbedUrl ? (
            <div
              className="relative w-full bg-gray-900 rounded-lg overflow-hidden"
              style={{ paddingBottom: "56.25%" }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <iframe
                src={previewEmbedUrl}
                className="absolute inset-0 w-full h-full"
                sandbox="allow-scripts allow-same-origin"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                style={{ border: "none" }}
              />
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Category Management Modal */}
      <Modal
        open={categoryModalOpen}
        onClose={() => {
          setCategoryModalOpen(false);
          setEditingCategory(null);
        }}
        title={t("admin.education.manageCategories") || "Manage Categories"}
        size="lg"
      >
        <CategoryManagementModal
          categories={categories}
          onClose={() => {
            setCategoryModalOpen(false);
            setEditingCategory(null);
          }}
          onSave={handleSaveCategory}
          onDelete={handleDeleteCategory}
          saving={saving}
        />
      </Modal>

      <ToastViewport toasts={toast.toasts} onClose={toast.remove} />
      </div>
    </AdminLayout>
  );
}
