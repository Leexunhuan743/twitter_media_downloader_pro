package api

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// @lat: [[lat.md/api-server#API Server#Web3 Console Theme#Presentation Contract]]
func TestWeb3ThemePresentationContract(t *testing.T) {
	readAsset := func(name string) string {
		t.Helper()
		data, err := os.ReadFile(filepath.Join("web", "web3", name))
		if err != nil {
			t.Fatalf("read web3 asset %s: %v", name, err)
		}
		return string(data)
	}

	index := readAsset("index.html")
	app := readAsset("app.js")
	styles := readAsset("styles.css")

	requiredIndex := []string{
		`aria-controls="sidebar"`,
		`aria-hidden="true"`,
		`<label class="sr-only" for="authKey">API Key</label>`,
	}
	for _, want := range requiredIndex {
		if !strings.Contains(index, want) {
			t.Errorf("index.html missing %q", want)
		}
	}

	requiredApp := []string{
		`role="tablist"`,
		`role="tabpanel"`,
		`<label for="tf-target">Screen Name</label>`,
		`<label for="secKey">API Key</label>`,
		`function enhanceThemeSwitcher()`,
		`iconSVG('copy', 14)`,
	}
	for _, want := range requiredApp {
		if !strings.Contains(app, want) {
			t.Errorf("app.js missing %q", want)
		}
	}

	requiredStyles := []string{
		`html { background: var(--bg-0); }`,
		`min-height: 100dvh`,
		`background: transparent; font: inherit`,
		`white-space: pre-wrap; overflow-wrap: anywhere`,
		`.btn, .tab, .icon-btn { min-height: 44px; }`,
	}
	for _, want := range requiredStyles {
		if !strings.Contains(styles, want) {
			t.Errorf("styles.css missing %q", want)
		}
	}

	for _, forbidden := range []string{"background-attachment: fixed", "🎨", "📋", "⚠️"} {
		if strings.Contains(index+app+styles, forbidden) {
			t.Errorf("web3 assets contain forbidden presentation token %q", forbidden)
		}
	}
}
