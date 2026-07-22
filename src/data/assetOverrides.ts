interface AssetOverride {
  jacket?: string;
  previewAudio?: string;
}

// Put licensed/user-owned assets under public/assets and map them here.
// Example:
// "mock-001": {
//   jacket: "/assets/jackets/mock-001.webp",
//   previewAudio: "/assets/previews/mock-001.mp3"
// }
export const assetOverrides: Record<string, AssetOverride> = {};
