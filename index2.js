"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");

function formatMusicItem(item) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return {
        id: item.videoId,
        title: (_b = (_a = item.title.runs) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.text,
        artist: (_d = (_c = item.ownerText.runs) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.text,
        artwork: (_g = (_f = (_e = item === null || item === void 0 ? void 0 : item.thumbnail) === null || _e === void 0 ? void 0 : _e.thumbnails) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.url,
        duration: (_h = item.lengthText) === null || _h === void 0 ? void 0 : _h.simpleText,
        platform: "Youtube"
    };
}

let lastQuery = '';
let musicContinToken = null;
const searchCache = new Map();

async function searchMusic(query, page) {
    // Reset cache when new query or first page
    if (query !== lastQuery || page === 1) {
        musicContinToken = null;
        searchCache.clear();
    }
    lastQuery = query;
    
    // Return cached results if available
    const cacheKey = `${query}_${page}`;
    if (searchCache.has(cacheKey)) {
        return searchCache.get(cacheKey);
    }

    const requestData = {
        context: {
            client: {
                hl: "en",
                gl: "US",
                clientName: "WEB",
                clientVersion: "2.20231215.00.00",
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                platform: "DESKTOP"
            },
        },
        query: musicContinToken ? undefined : query,
        continuation: musicContinToken || undefined,
    };

    const config = {
        method: "post",
        url: "https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Origin": "https://www.youtube.com",
            "Referer": "https://www.youtube.com/",
            "X-Origin": "https://www.youtube.com"
        },
        data: JSON.stringify(requestData),
    };

    try {
        const response = (await (0, axios_1.default)(config)).data;
        
        // Handle different response structures
        let contents = [];
        if (response.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents) {
            contents = response.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
        } else if (response.onResponseReceivedCommands?.[0]?.appendContinuationItemsAction?.continuationItems) {
            contents = response.onResponseReceivedCommands[0].appendContinuationItemsAction.continuationItems;
        } else if (response.continuationContents?.sectionListContinuation?.contents) {
            contents = response.continuationContents.sectionListContinuation.contents;
        }

        // Find continuation token
        let hasMoreResults = false;
        let continuationItem = null;
        
        // Look for continuation item in different possible locations
        for (const item of contents) {
            if (item.continuationItemRenderer) {
                continuationItem = item;
                break;
            }
        }
        
        if (continuationItem?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
            musicContinToken = continuationItem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            hasMoreResults = true;
        } else {
            // Check if there's a continuation in the response
            if (response.continuationContents?.sectionListContinuation?.continuations?.[0]?.nextContinuationData?.continuation) {
                musicContinToken = response.continuationContents.sectionListContinuation.continuations[0].nextContinuationData.continuation;
                hasMoreResults = true;
            } else {
                musicContinToken = null;
                hasMoreResults = false;
            }
        }

        // Extract music items from all possible sections
        const musicData = [];
        for (const item of contents) {
            if (item.itemSectionRenderer?.contents) {
                musicData.push(...item.itemSectionRenderer.contents);
            } else if (item.musicShelfRenderer?.contents) {
                musicData.push(...item.musicShelfRenderer.contents);
            } else if (item.gridRenderer?.items) {
                musicData.push(...item.gridRenderer.items);
            }
        }
        
        // Filter and format music items
        const resultMusicData = musicData
            .filter(item => item.musicResponsiveListItemRenderer || item.videoRenderer)
            .map(item => {
                if (item.musicResponsiveListItemRenderer) {
                    // Handle music responsive list items
                    return formatMusicItem({
                        videoId: item.musicResponsiveListItemRenderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId,
                        title: item.musicResponsiveListItemRenderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text,
                        ownerText: item.musicResponsiveListItemRenderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text,
                        thumbnail: item.musicResponsiveListItemRenderer.thumbnail,
                        lengthText: item.musicResponsiveListItemRenderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text
                    });
                } else if (item.videoRenderer) {
                    // Handle video renderer items
                    return formatMusicItem(item.videoRenderer);
                }
                return null;
            })
            .filter(item => item && item.title && item.artist && item.id); // Filter incomplete items

        const result = {
            isEnd: !hasMoreResults,
            data: resultMusicData
        };

        // Cache the result
        searchCache.set(cacheKey, result);
        
        // Clean cache after 5 minutes
        setTimeout(() => {
            if (searchCache.has(cacheKey)) {
                searchCache.delete(cacheKey);
            }
        }, 300000);

        return result;
    } catch (error) {
        console.error("YouTube search error:", error.response?.data || error.message);
        
        // On error, reset token and return empty results
        musicContinToken = null;
        return {
            isEnd: true,
            data: []
        };
    }
}

async function search(query, page, type) {
    if (type === "music") {
        return await searchMusic(query, page);
    }
    return {
        isEnd: true,
        data: []
    };
}

// Cache for media sources - improved to handle multiple qualities properly
const mediaSourceCache = new Map();

function getQualityLabel(quality) {
    switch (quality) {
        case "low": return "tiny";
        case "standard": return "small";
        case "high": return "medium";
        case "super": return "large";
        default: return "medium";
    }
}

function extractAudioFormat(formats, quality = "standard") {
    const targetQuality = getQualityLabel(quality);
    
    // First try to find audio-only formats
    const audioFormats = formats.filter(format => 
        format.mimeType.includes('audio/mp4') || 
        format.mimeType.includes('audio/webm')
    );
    
    if (audioFormats.length > 0) {
        // Sort by bitrate (higher is better)
        audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        return audioFormats[0];
    }
    
    // Fallback to video formats (we'll extract audio)
    const videoFormats = formats.filter(format => 
        format.mimeType.includes('video/mp4') || 
        format.mimeType.includes('video/webm')
    );
    
    if (videoFormats.length > 0) {
        // Sort by quality preference
        const qualityOrder = ['tiny', 'small', 'medium', 'large', 'hd720', 'hd1080', 'hd1440', 'hd2160'];
        videoFormats.sort((a, b) => {
            const aQuality = a.qualityLabel || a.quality || '';
            const bQuality = b.qualityLabel || b.quality || '';
            return qualityOrder.indexOf(aQuality) - qualityOrder.indexOf(bQuality);
        });
        
        // Find closest match to requested quality
        const targetIndex = qualityOrder.indexOf(targetQuality);
        if (targetIndex !== -1) {
            for (let i = targetIndex; i < qualityOrder.length; i++) {
                const matched = videoFormats.find(f => 
                    (f.qualityLabel || f.quality) === qualityOrder[i]
                );
                if (matched) return matched;
            }
        }
        
        // Return the best available if no exact match
        return videoFormats[videoFormats.length - 1];
    }
    
    return null;
}

async function getMediaSource(musicItem, quality = "standard") {
    const cacheKey = `${musicItem.id}_${quality}`;
    const cached = mediaSourceCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    try {
        const requestData = {
            context: {
                client: {
                    clientName: "ANDROID",
                    clientVersion: "19.09.37",
                    hl: "en",
                    gl: "US",
                    userAgent: "com.google.android.youtube/19.09.37 (Linux; U; Android 13; GB) gzip",
                    platform: "MOBILE"
                }
            },
            videoId: musicItem.id,
            playbackContext: {
                contentPlaybackContext: {
                    vis: 0,
                    format: "MPEG_4",
                    signatureTimestamp: Math.floor(Date.now() / 1000)
                }
            }
        };

        const config = {
            method: "post",
            url: "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 13; GB) gzip",
                "Accept": "application/json",
                "Origin": "https://www.youtube.com",
                "Referer": "https://www.youtube.com/",
                "X-Origin": "https://www.youtube.com"
            },
            data: JSON.stringify(requestData)
        };

        const result = (await (0, axios_1.default)(config)).data;
        
        if (!result.streamingData) {
            throw new Error("No streaming data available");
        }

        const allFormats = [
            ...(result.streamingData.formats || []),
            ...(result.streamingData.adaptiveFormats || [])
        ];

        const bestFormat = extractAudioFormat(allFormats, quality);
        if (!bestFormat || !bestFormat.url) {
            throw new Error("No suitable audio format found");
        }

        // Extract signature from URL if needed
        let audioUrl = bestFormat.url;
        if (bestFormat.signatureCipher) {
            const sigParams = new URLSearchParams(bestFormat.signatureCipher);
            const url = sigParams.get('url');
            const s = sigParams.get('s');
            if (url && s) {
                audioUrl = `${url}&sig=${s}`;
            }
        }

        // Proper headers for downloading - critical for MusicFree download functionality
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.youtube.com/",
            "Origin": "https://www.youtube.com",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "Sec-Fetch-Dest": "empty",
            "Range": "bytes=0-"
        };

        const resultData = {
            url: audioUrl,
            headers: headers
        };

        // Cache the result
        mediaSourceCache.set(cacheKey, resultData);
        
        // Clean cache after 5 minutes to prevent memory leaks
        setTimeout(() => {
            mediaSourceCache.delete(cacheKey);
        }, 300000);

        return resultData;
    } catch (error) {
        console.error(`Failed to get media source for ${musicItem.id}:`, error.response?.data || error.message);
        
        // Try fallback qualities if the requested quality fails
        const fallbackQualities = ["standard", "high", "low"];
        for (const fallbackQuality of fallbackQualities) {
            if (fallbackQuality !== quality) {
                try {
                    return await getMediaSource(musicItem, fallbackQuality);
                } catch (fallbackError) {
                    continue;
                }
            }
        }
        
        throw new Error(`Failed to get audio source: ${error.message}`);
    }
}

// Get lyrics function
async function getLyric(musicItem) {
    // YouTube doesn't provide lyrics through this API, return empty
    return {
        rawLrc: "",
        translation: ""
    };
}

// Get music info function
async function getMusicInfo(musicItem) {
    // Return the complete music item with any additional info
    return {
        ...musicItem,
        artwork: musicItem.artwork || `https://i.ytimg.com/vi/${musicItem.id}/hqdefault.jpg`
    };
}

// Import music item function
async function importMusicItem(urlLike) {
    try {
        // Extract video ID from various YouTube URL formats
        const videoIdMatch = urlLike.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
        if (!videoIdMatch || !videoIdMatch[1]) {
            throw new Error("Invalid YouTube URL format");
        }
        
        const videoId = videoIdMatch[1];
        
        // Get video details
        const requestData = {
            context: {
                client: {
                    hl: "en",
                    gl: "US",
                    clientName: "WEB",
                    clientVersion: "2.20231215.00.00",
                    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    platform: "DESKTOP"
                }
            },
            videoId: videoId
        };

        const config = {
            method: "post",
            url: "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json",
                "Origin": "https://www.youtube.com",
                "Referer": "https://www.youtube.com/"
            },
            data: JSON.stringify(requestData)
        };

        const result = (await (0, axios_1.default)(config)).data;
        
        if (!result.videoDetails) {
            throw new Error("Video details not found");
        }

        return {
            id: videoId,
            title: result.videoDetails.title,
            artist: result.videoDetails.author,
            artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: Math.floor(parseInt(result.videoDetails.lengthSeconds) / 60) + ":" + (parseInt(result.videoDetails.lengthSeconds) % 60).toString().padStart(2, '0'),
            platform: "Youtube"
        };
    } catch (error) {
        console.error("Failed to import music item:", error);
        throw new Error("Failed to import YouTube video: " + error.message);
    }
}

// Import music sheet function
async function importMusicSheet(urlLike) {
    // This is a simplified version - YouTube playlists would need more complex handling
    try {
        // For now, we'll just return an empty array since YouTube playlist import is complex
        console.warn("YouTube playlist import is not fully implemented yet");
        return [];
    } catch (error) {
        console.error("Failed to import music sheet:", error);
        return [];
    }
}

module.exports = {
    platform: "Youtube(Fixed)",
    author: 'SLCSS231071',
    version: "0.0.4",
    supportedSearchType: ["music"],
    cacheControl: "no-cache",
    hints: {
        importMusicItem: [
            "1. 支持导入YouTube视频URL，格式如: https://www.youtube.com/watch?v=xxxxxx",
            "2. 也支持短链接格式: https://youtu.be/xxxxxx"
        ],
        importMusicSheet: [
            "1. YouTube歌单导入功能正在开发中",
            "2. 暂时只支持单曲导入"
        ]
    },
    search,
    getMediaSource,
    getLyric,
    getMusicInfo,
    importMusicItem,
    importMusicSheet
};