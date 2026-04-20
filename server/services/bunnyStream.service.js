import crypto from "crypto";

/**
 * Bunny Stream API Service
 * Handles video upload, management, and signed embed URL generation
 */

/** Error thrown when Bunny reports video processing failure (status 5) */
export class VideoProcessingError extends Error {
  constructor(message = "Video processing failed") {
    super(message);
    this.name = "VideoProcessingError";
  }
}

const BUNNY_STREAM_API_KEY = process.env.BUNNY_STREAM_API_KEY;
const BUNNY_STREAM_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID;
const BUNNY_STREAM_CDN_HOSTNAME = process.env.BUNNY_STREAM_CDN_HOSTNAME;
const BUNNY_STREAM_TOKEN_KEY = process.env.BUNNY_STREAM_TOKEN_KEY;

const STREAM_API_BASE = "https://video.bunnycdn.com";
const IFRAME_EMBED_BASE = "https://iframe.mediadelivery.net/embed";

/**
 * Check if Bunny Stream is configured
 */
export function isBunnyStreamConfigured() {
  return !!(BUNNY_STREAM_API_KEY && BUNNY_STREAM_LIBRARY_ID && BUNNY_STREAM_CDN_HOSTNAME && BUNNY_STREAM_TOKEN_KEY);
}

/**
 * Create a new video in Bunny Stream library
 * @param {string} title - Video title
 * @returns {Promise<{guid: string, libraryId: number, title: string}>}
 */
export async function createVideo(title) {
  if (!isBunnyStreamConfigured()) {
    throw new Error("Bunny Stream is not configured");
  }

  const response = await fetch(`${STREAM_API_BASE}/library/${BUNNY_STREAM_LIBRARY_ID}/videos`, {
    method: "POST",
    headers: {
      "AccessKey": BUNNY_STREAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bunny Stream API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Upload video file to Bunny Stream
 * @param {string} videoId - Video GUID from createVideo
 * @param {Buffer} buffer - Video file buffer
 * @returns {Promise<{success: boolean, message: string, statusCode: number}>}
 */
export async function uploadVideo(videoId, buffer) {
  if (!isBunnyStreamConfigured()) {
    throw new Error("Bunny Stream is not configured");
  }

  const response = await fetch(`${STREAM_API_BASE}/library/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`, {
    method: "PUT",
    headers: {
      "AccessKey": BUNNY_STREAM_API_KEY,
    },
    body: buffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bunny Stream upload error: ${response.status} - ${errorText}`);
  }

  return {
    success: true,
    message: "Video uploaded successfully",
    statusCode: response.status,
  };
}

/**
 * Get video information from Bunny Stream
 * @param {string} videoId - Video GUID
 * @returns {Promise<Object>} Video information
 */
export async function getVideo(videoId) {
  if (!isBunnyStreamConfigured()) {
    throw new Error("Bunny Stream is not configured");
  }

  const response = await fetch(`${STREAM_API_BASE}/library/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`, {
    method: "GET",
    headers: {
      "AccessKey": BUNNY_STREAM_API_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bunny Stream API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Delete video from Bunny Stream
 * @param {string} videoId - Video GUID
 * @returns {Promise<{success: boolean, message: string, statusCode: number}>}
 */
export async function deleteVideo(videoId) {
  if (!isBunnyStreamConfigured()) {
    throw new Error("Bunny Stream is not configured");
  }

  const response = await fetch(`${STREAM_API_BASE}/library/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`, {
    method: "DELETE",
    headers: {
      "AccessKey": BUNNY_STREAM_API_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bunny Stream delete error: ${response.status} - ${errorText}`);
  }

  return {
    success: true,
    message: "Video deleted successfully",
    statusCode: response.status,
  };
}

/**
 * List videos in Bunny Stream library
 * @param {number} page - Page number (1-based)
 * @param {number} perPage - Items per page
 * @returns {Promise<{items: Array, currentPage: number, totalItems: number, totalPages: number}>}
 */
export async function listVideos(page = 1, perPage = 100) {
  if (!isBunnyStreamConfigured()) {
    throw new Error("Bunny Stream is not configured");
  }

  const response = await fetch(
    `${STREAM_API_BASE}/library/${BUNNY_STREAM_LIBRARY_ID}/videos?page=${page}&itemsPerPage=${perPage}`,
    {
      method: "GET",
      headers: {
        "AccessKey": BUNNY_STREAM_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bunny Stream API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Generate signed embed URL for video
 * @param {string} videoId - Video GUID
 * @param {number} expiresInSeconds - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns {string} Signed embed URL
 */
export function generateSignedEmbedUrl(videoId, expiresInSeconds = 3600) {
  if (!isBunnyStreamConfigured()) {
    throw new Error("Bunny Stream is not configured");
  }

  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  
  // Generate token: SHA256 HMAC of (libraryId + videoId + expires)
  const signatureData = `${BUNNY_STREAM_LIBRARY_ID}${videoId}${expires}`;
  const token = crypto
    .createHmac("sha256", BUNNY_STREAM_TOKEN_KEY)
    .update(signatureData)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  // Build embed URL with token and expiration
  const embedUrl = `${IFRAME_EMBED_BASE}/${BUNNY_STREAM_LIBRARY_ID}/${videoId}?token=${token}&expires=${expires}&autoplay=false&preload=true&responsive=true`;

  return embedUrl;
}

/**
 * Get thumbnail URL for video
 * @param {string} videoId - Video GUID
 * @returns {string} Thumbnail URL
 */
export function getThumbnailUrl(videoId) {
  if (!BUNNY_STREAM_CDN_HOSTNAME) {
    throw new Error("Bunny Stream CDN hostname is not configured");
  }
  return `https://${BUNNY_STREAM_CDN_HOSTNAME}/${videoId}/thumbnail.jpg`;
}

/**
 * Generate TUS upload authorization headers for direct client-side upload.
 * Uses HMAC-SHA256 signature so the API key is never exposed to the client.
 * @param {string} videoId - Video GUID from createVideo
 * @param {number} expiresInSeconds - Signature validity in seconds (default: 3600)
 * @returns {{authorizationSignature: string, authorizationExpire: number, libraryId: string, videoId: string, tusEndpoint: string}}
 */
export function generateDirectUploadCredentials(videoId, expiresInSeconds = 3600) {
  if (!isBunnyStreamConfigured()) {
    throw new Error("Bunny Stream is not configured");
  }

  const expiration = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const signatureData = BUNNY_STREAM_LIBRARY_ID + BUNNY_STREAM_API_KEY + expiration + videoId;
  const signature = crypto
    .createHash("sha256")
    .update(signatureData)
    .digest("hex");

  return {
    authorizationSignature: signature,
    authorizationExpire: expiration,
    libraryId: BUNNY_STREAM_LIBRARY_ID,
    videoId,
    tusEndpoint: `${STREAM_API_BASE}/tusupload`,
  };
}

/**
 * Poll video status until it's ready or timeout
 * @param {string} videoId - Video GUID
 * @param {number} maxAttempts - Maximum number of polling attempts (default: 60)
 * @param {number} intervalMs - Interval between polls in milliseconds (default: 10000)
 * @returns {Promise<Object>} Final video status
 */
export async function pollVideoStatus(videoId, maxAttempts = 60, intervalMs = 10000) {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const video = await getVideo(videoId);
    
    // Check if video is ready (status 4 = ready in Bunny Stream)
    if (video.status === 4) {
      return video;
    }
    
    // Check if video processing failed (status 5 = error)
    if (video.status === 5) {
      throw new VideoProcessingError();
    }
    
    attempts++;
    
    if (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  
  throw new Error("Video processing timeout");
}
