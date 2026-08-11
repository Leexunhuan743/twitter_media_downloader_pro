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
		`<script src="/static/shared/datetime.js"></script>`,
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
		`f.dateTime ? 'datetime-local' : 'text'`,
		`f.dateTime ? TMDDateTime.toDateTimeLocal(item[f.key])`,
		`TMDDateTime.toRFC3339(v)`,
		`This also permanently deletes the media directory.`,
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
	}
	for _, want := range requiredStyles {
		if !strings.Contains(styles, want) {
			t.Errorf("styles.css missing %q", want)
		}
	}

	mobileStyles := cssBlock(t, styles, `@media (max-width: 900px)`)
	for _, want := range []string{
		`.btn, .tab, .icon-btn { min-height: 44px; }`,
		`.nav-item, .checkbox-line, .toggle { min-height: 44px; }`,
		`.toggle { min-width: 44px; }`,
		`.btn.xs { min-width: 44px; min-height: 44px; }`,
		`#tmd-theme-switcher .ts-btn, #tmd-theme-switcher .ts-opt { min-height: 44px !important; }`,
		`#tmd-theme-switcher .ts-opt { min-width: 44px !important; }`,
	} {
		if !strings.Contains(mobileStyles, want) {
			t.Errorf("mobile styles missing %q", want)
		}
	}

	narrowMobileStyles := cssBlock(t, styles, `@media (max-width: 560px)`)
	if strings.Contains(narrowMobileStyles, `.btn.xs { min-width: 36px; min-height: 36px; }`) {
		t.Error("narrow mobile styles shrink extra-small buttons below the touch target")
	}

	midWidthStyles := cssBlock(t, styles, `@media (min-width: 901px) and (max-width: 1220px)`)
	if !strings.Contains(midWidthStyles, `.log-filter-bar { grid-template-columns: 1fr 1fr; }`) {
		t.Error("mid-width styles do not collapse the log filter grid")
	}

	for _, forbidden := range []string{"background-attachment: fixed", "🎨", "📋", "⚠️"} {
		if strings.Contains(index+app+styles, forbidden) {
			t.Errorf("web3 assets contain forbidden presentation token %q", forbidden)
		}
	}
}

func cssBlock(t *testing.T, stylesheet, selector string) string {
	t.Helper()
	start := strings.Index(stylesheet, selector)
	if start < 0 {
		t.Fatalf("styles.css missing %q", selector)
	}
	open := strings.Index(stylesheet[start:], "{")
	if open < 0 {
		t.Fatalf("styles.css has no block for %q", selector)
	}
	open += start

	depth := 0
	for i := open; i < len(stylesheet); i++ {
		switch stylesheet[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return stylesheet[open+1 : i]
			}
		}
	}
	t.Fatalf("styles.css has an unterminated block for %q", selector)
	return ""
}
