package downloading

import "testing"

func TestParseFormattedEntryKeepsLegacyVideoVariantForCompatibility(t *testing.T) {
	entry := FormattedTweetEntry{
		"rest_id": "1000000000000000003",
		"legacy": map[string]any{
			"full_text": "video",
			"extended_entities": map[string]any{
				"media": []any{
					map[string]any{
						"type": "video",
						"video_info": map[string]any{
							"variants": []any{
								map[string]any{"bitrate": float64(1280000), "url": "https://example.invalid/video.mp4"},
								map[string]any{"url": "https://example.invalid/playlist.m3u8"},
							},
						},
					},
				},
			},
		},
	}

	tweet := parseFormattedEntry(&entry)
	if tweet == nil {
		t.Fatal("parseFormattedEntry() returned nil")
	}
	if len(tweet.Urls) != 1 || tweet.Urls[0] != "https://example.invalid/video.mp4" {
		t.Fatalf("preferred URLs = %v", tweet.Urls)
	}
	if len(tweet.LegacyURLs) != 1 || tweet.LegacyURLs[0] != "https://example.invalid/playlist.m3u8" {
		t.Fatalf("legacy URLs = %v", tweet.LegacyURLs)
	}
}
