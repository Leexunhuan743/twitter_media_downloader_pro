// Command xapi-probe is a small diagnostic tool for determining why
// Twitter/X GraphQL requests return HTTP 429 "error code: 1015".
//
// It loads the same conf.yaml as TMD, then compares two request styles:
//   - default: the minimal headers used by the app's Resty client
//   - browser: a Chrome-like header set, to test Cloudflare bot detection
//
// It never prints auth_token, ct0, Authorization, Cookie, or Set-Cookie values.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/tidwall/gjson"
	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/twitter"
)

const (
	userByScreenNamePath = "/i/api/graphql/xmU6X_CKVnQ5lSrCbAmJsg/UserByScreenName"
	userMediaPath        = "/i/api/graphql/MOLbHrtk8Ovu7DUNOLcXiA/UserMedia"
	listByRestIdPath     = "/i/api/graphql/ZMQOSpxDo0cP5Cdt8MgEVA/ListByRestId"
	listMembersPath      = "/i/api/graphql/3dQPyRyAj6Lslp4e0ClXzg/ListMembers"
)

var saveDir string

var browserHeaders = map[string]string{
	"User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
	"Accept":          "application/json, text/plain, */*",
	"Accept-Language": "en-US,en;q=0.9",
	"Origin":          "https://x.com",
	"Referer":         "https://x.com/",
	"Sec-Fetch-Site":  "same-origin",
	"Sec-Fetch-Mode":  "cors",
	"Sec-Fetch-Dest":  "empty",
	"X-Twitter-Active-User":     "yes",
	"X-Twitter-Client-Language": "en",
}

func defaultAppRoot() string {
	if v := os.Getenv("TMD_HOME"); v != "" {
		return v
	}
	if runtime.GOOS == "windows" {
		if appData := os.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, ".tmd2")
		}
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".tmd2")
}

func userByScreenNameURL(screenName string) string {
	variables := fmt.Sprintf(`{"screen_name":"%s","withSafetyModeUserFields":true}`, screenName)
	features := `{"hidden_profile_subscriptions_enabled":true,"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"subscriptions_verification_info_is_identity_verified_enabled":true,"subscriptions_verification_info_verified_since_enabled":true,"highlights_tweets_tab_ui_enabled":true,"responsive_web_twitter_article_notes_tab_enabled":true,"subscriptions_feature_can_gift_premium":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"responsive_web_graphql_timeline_navigation_enabled":true}`
	fieldToggles := `{"withAuxiliaryUserLabels":false}`
	q := "variables=" + urlQueryEscape(variables) +
		"&features=" + urlQueryEscape(features) +
		"&fieldToggles=" + urlQueryEscape(fieldToggles)
	return "https://x.com" + userByScreenNamePath + "?" + q
}

func userMediaURL(userID string, count int) string {
	variables := fmt.Sprintf(`{"userId":"%s","count":%d,"cursor":"","includePromotedContent":false,"withClientEventToken":false,"withBirdwatchNotes":false,"withVoice":true,"withV2Timeline":true}`, userID, count)
	features := `{"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"articles_preview_enabled":true,"tweetypie_unmention_optimization_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"creator_subscriptions_quote_tweet_preview_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"rweb_video_timestamps_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_enhance_cards_enabled":false}`
	fieldToggles := `{"withArticlePlainText":false}`
	q := "variables=" + urlQueryEscape(variables) +
		"&features=" + urlQueryEscape(features) +
		"&fieldToggles=" + urlQueryEscape(fieldToggles)
	return "https://x.com" + userMediaPath + "?" + q
}

func listByRestIdURL(listID string) string {
	variables := fmt.Sprintf(`{"listId":"%s"}`, listID)
	features := `{"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"responsive_web_graphql_timeline_navigation_enabled":true}`
	q := "variables=" + urlQueryEscape(variables) +
		"&features=" + urlQueryEscape(features)
	return "https://x.com" + listByRestIdPath + "?" + q
}

func listMembersURL(listID string, count int, cursor string) string {
	variables := fmt.Sprintf(`{"listId":"%s","count":%d,"withSafetyModeUserFields":true, "cursor":"%s"}`, listID, count, cursor)
	features := `{"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"articles_preview_enabled":true,"tweetypie_unmention_optimization_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"creator_subscriptions_quote_tweet_preview_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"rweb_video_timestamps_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_enhance_cards_enabled":false}`
	q := "variables=" + urlQueryEscape(variables) +
		"&features=" + urlQueryEscape(features)
	return "https://x.com" + listMembersPath + "?" + q
}

func urlQueryEscape(s string) string {
	return url.QueryEscape(s)
}

func safeFileName(name string) string {
	var b strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	return b.String()
}

func saveResponse(name string, resp *resty.Response) {
	if saveDir == "" || resp == nil || len(resp.Body()) == 0 {
		return
	}
	ext := ".json"
	ct := resp.Header().Get("Content-Type")
	if !strings.Contains(ct, "json") {
		ext = ".txt"
	}
	path := filepath.Join(saveDir, safeFileName(name)+ext)
	fmt.Printf("Warning: raw API response body may contain sensitive data; saved to %q\n", path)
	if err := os.WriteFile(path, resp.Body(), 0644); err != nil {
		fmt.Printf("Save response failed name=%q path=%q error=%v\n", name, path, err)
		return
	}
	fmt.Printf("Saved response name=%q path=%q bytes=%d\n", name, path, len(resp.Body()))
}

func newProbeClient(authToken, ct0, proxyURL string, browser bool) *resty.Client {
	client := resty.New()
	twitter.SetClientAuth(client, authToken, ct0)
	client.SetRetryCount(0)
	client.SetTimeout(20 * time.Second)
	if proxyURL != "" {
		client.SetProxy(proxyURL)
	}
	if browser {
		client.SetHeaders(browserHeaders)
	}
	return client
}

type result struct {
	Name        string
	URL         string
	Status      int
	Err         string
	RetryAfter  string
	RateLimit   string
	CfRay       string
	Server      string
	ContentType string
	Body        string
}

func (r result) Print() {
	fmt.Printf("\n===== %s =====\n", r.Name)
	fmt.Printf("URL: %s\n", r.URL)
	if r.Err != "" {
		fmt.Printf("Error: %s\n", r.Err)
	}
	fmt.Printf("Status: %d\n", r.Status)
	if r.RetryAfter != "" {
		fmt.Printf("Retry-After: %s\n", r.RetryAfter)
	}
	if r.RateLimit != "" {
		fmt.Printf("Rate-Limit: %s\n", r.RateLimit)
	}
	if r.CfRay != "" {
		fmt.Printf("Cf-Ray: %s\n", r.CfRay)
	}
	if r.Server != "" {
		fmt.Printf("Server: %s\n", r.Server)
	}
	if r.ContentType != "" {
		fmt.Printf("Content-Type: %s\n", r.ContentType)
	}
	body := strings.TrimSpace(r.Body)
	if len(body) > 400 {
		body = body[:400] + "...(truncated)"
	}
	if body != "" {
		fmt.Printf("Body: %s\n", body)
	}
}

func doProbe(ctx context.Context, name, url string, client *resty.Client) result {
	res := result{Name: name, URL: url}
	resp, err := client.R().SetContext(ctx).Get(url)
	if err != nil {
		res.Err = err.Error()
		var respErr *resty.ResponseError
		if errors.As(err, &respErr) && respErr.Response != nil {
			resp = respErr.Response
		}
	}
	if resp == nil {
		res.Status = 0
		return res
	}
	res.Status = resp.StatusCode()
	res.RetryAfter = resp.Header().Get("Retry-After")
	res.CfRay = resp.Header().Get("Cf-Ray")
	res.Server = resp.Header().Get("Server")
	res.ContentType = resp.Header().Get("Content-Type")
	rl := resp.Header().Get("X-Rate-Limit-Limit")
	if rl != "" {
		res.RateLimit = fmt.Sprintf("limit=%s remaining=%s reset=%s",
			rl,
			resp.Header().Get("X-Rate-Limit-Remaining"),
			resp.Header().Get("X-Rate-Limit-Reset"))
	}
	res.Body = string(resp.Body())
	saveResponse(name, resp)
	return res
}

func resolveUserID(ctx context.Context, client *resty.Client, screenName string) (string, error) {
	url := userByScreenNameURL(screenName)
	resp, err := client.R().SetContext(ctx).Get(url)
	if err != nil {
		var respErr *resty.ResponseError
		if errors.As(err, &respErr) && respErr.Response != nil {
			resp = respErr.Response
		} else if resp == nil {
			return "", err
		}
	}
	body := resp.Body()
	if resp.StatusCode() != 200 {
		return "", fmt.Errorf("UserByScreenName status=%d body=%s", resp.StatusCode(), string(body))
	}
	restID := gjson.GetBytes(body, "data.user.result.rest_id").String()
	if restID == "" {
		return "", fmt.Errorf("rest_id not found; body=%s", string(body))
	}
	return restID, nil
}

type burstResult struct {
	status     int
	retryAfter string
	body       string
	err        string
}

func burstProbe(ctx context.Context, name, url string, client *resty.Client, n int) {
	fmt.Printf("\n===== %s =====\n", name)
	start := time.Now()
	results := make(chan burstResult, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp, err := client.R().SetContext(ctx).Get(url)
			r := burstResult{}
			if err != nil {
				r.err = err.Error()
				var respErr *resty.ResponseError
				if errors.As(err, &respErr) && respErr.Response != nil {
					resp = respErr.Response
				}
			}
			if resp != nil {
				r.status = resp.StatusCode()
				r.retryAfter = resp.Header().Get("Retry-After")
				if resp.StatusCode() >= 400 {
					r.body = string(resp.Body())
				}
			}
			results <- r
		}()
	}
	wg.Wait()
	close(results)

	counts := map[int]int{}
	var sample429 string
	var sampleErr string
	for r := range results {
		counts[r.status]++
		if r.status == 429 && sample429 == "" {
			sample429 = fmt.Sprintf("Retry-After=%s Body=%s", r.retryAfter, strings.TrimSpace(r.body))
		}
		if r.status == 0 && sampleErr == "" && r.err != "" {
			sampleErr = r.err
		}
	}
	fmt.Printf("Duration: %s\n", time.Since(start).Round(time.Millisecond))
	fmt.Printf("Status counts: %v\n", counts)
	if sample429 != "" {
		fmt.Printf("Sample 429: %s\n", sample429)
	}
	if sampleErr != "" {
		fmt.Printf("Sample error: %s\n", sampleErr)
	}
}

func burstMultiUser(ctx context.Context, name string, client *resty.Client, userIDs []string) {
	fmt.Printf("\n===== %s =====\n", name)
	start := time.Now()
	results := make(chan burstResult, len(userIDs))
	var wg sync.WaitGroup
	for _, uid := range userIDs {
		wg.Add(1)
		go func(uid string) {
			defer wg.Done()
			url := userMediaURL(uid, 100)
			resp, err := client.R().SetContext(ctx).Get(url)
			r := burstResult{}
			if err != nil {
				r.err = err.Error()
				var respErr *resty.ResponseError
				if errors.As(err, &respErr) && respErr.Response != nil {
					resp = respErr.Response
				}
			}
			if resp != nil {
				r.status = resp.StatusCode()
				r.retryAfter = resp.Header().Get("Retry-After")
				if resp.StatusCode() >= 400 {
					r.body = string(resp.Body())
				}
			}
			results <- r
		}(uid)
	}
	wg.Wait()
	close(results)

	counts := map[int]int{}
	var sample429 string
	var sampleErr string
	for r := range results {
		counts[r.status]++
		if r.status == 429 && sample429 == "" {
			sample429 = fmt.Sprintf("Retry-After=%s Body=%s", r.retryAfter, strings.TrimSpace(r.body))
		}
		if r.status == 0 && sampleErr == "" && r.err != "" {
			sampleErr = r.err
		}
	}
	fmt.Printf("Duration: %s\n", time.Since(start).Round(time.Millisecond))
	fmt.Printf("Status counts: %v\n", counts)
	if sample429 != "" {
		fmt.Printf("Sample 429: %s\n", sample429)
	}
	if sampleErr != "" {
		fmt.Printf("Sample error: %s\n", sampleErr)
	}
}

func runListBurst(ctx context.Context, listClient, mediaClient *resty.Client, listIDStr string, n int) {
	id, err := strconv.ParseUint(listIDStr, 10, 64)
	if err != nil {
		fmt.Printf("Invalid list id %q: %v\n", listIDStr, err)
		return
	}

	fmt.Printf("\n===== Fetch List %s members =====\n", listIDStr)
	lst, err := twitter.GetLst(ctx, listClient, id)
	if err != nil {
		fmt.Printf("GetLst error: %v\n", err)
		return
	}
	fmt.Printf("List: %s members=%d\n", lst.Name, lst.MemberCount)

	members, err := lst.GetMembers(ctx, listClient)
	if err != nil {
		fmt.Printf("GetMembers error: %v\n", err)
		return
	}

	ids := make([]string, 0, len(members.Users))
	for _, u := range members.Users {
		ids = append(ids, strconv.FormatUint(u.Id, 10))
	}
	fmt.Printf("Fetched %d member ids\n", len(ids))
	if len(ids) == 0 {
		return
	}

	count := min(n, len(ids))
	burstMultiUser(ctx, fmt.Sprintf("UserMedia multi-user burst N=%d", count), mediaClient, ids[:count])
}

func probeAllAccounts(ctx context.Context, conf *config.Config, confDir, resolvedID string, delay time.Duration) {
	if resolvedID == "" {
		fmt.Println("No resolved user id; skipping account probes")
		return
	}

	fmt.Printf("\n===== Account probes (one UserMedia request per account) =====\n")
	doProbe(ctx, "UserMedia master account", userMediaURL(resolvedID, 5), newProbeClient(conf.Cookie.AuthToken, conf.Cookie.Ct0, conf.ProxyURL, false)).Print()
	time.Sleep(delay)

	additionalPath := filepath.Join(confDir, "additional_cookies.yaml")
	cookies, err := config.ReadAdditionalCookies(additionalPath)
	if err != nil {
		fmt.Printf("ReadAdditionalCookies error: %v\n", err)
		return
	}
	for i, c := range cookies {
		if c == nil || c.AuthToken == "" || c.Ct0 == "" {
			continue
		}
		client := newProbeClient(c.AuthToken, c.Ct0, conf.ProxyURL, false)
		doProbe(ctx, fmt.Sprintf("UserMedia additional account #%d", i+1), userMediaURL(resolvedID, 5), client).Print()
		time.Sleep(delay)
	}
}

type accountClient struct {
	name   string
	client *resty.Client
}

type stressResult struct {
	status     int
	retryAfter string
	body       string
	err        string
	account    string
}

func clientScreenName(cli *resty.Client) string {
	if cli == nil {
		return "unknown"
	}
	name := strings.TrimSpace(twitter.GetClientScreenName(cli))
	if name == "" {
		return "unknown"
	}
	return "@" + strings.TrimPrefix(name, "@")
}

func fetchListMemberIDs(ctx context.Context, listClient *resty.Client, listIDStr string) ([]string, error) {
	id, err := strconv.ParseUint(listIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid list id %q: %w", listIDStr, err)
	}

	fmt.Printf("Fetch List %s members\n", listIDStr)
	lst, err := twitter.GetLst(ctx, listClient, id)
	if err != nil {
		return nil, err
	}
	fmt.Printf("List: %s members=%d\n", lst.Name, lst.MemberCount)

	members, err := lst.GetMembers(ctx, listClient)
	if err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(members.Users))
	for _, u := range members.Users {
		ids = append(ids, strconv.FormatUint(u.Id, 10))
	}
	fmt.Printf("Fetched %d member ids\n", len(ids))
	return ids, nil
}

func runStress(ctx context.Context, conf *config.Config, confDir, listID string, maxConcurrency int, delay time.Duration) {
	if listID == "" {
		fmt.Println("stress mode requires -list")
		return
	}

	fmt.Printf("\n===== Stress test =====\n")
	listClient := newProbeClient(conf.Cookie.AuthToken, conf.Cookie.Ct0, conf.ProxyURL, true)
	ids, err := fetchListMemberIDs(ctx, listClient, listID)
	if err != nil {
		fmt.Printf("Fetch list members failed: %v\n", err)
		return
	}
	if len(ids) == 0 {
		fmt.Println("No member ids to stress")
		return
	}
	fmt.Printf("Stress target users=%d\n", len(ids))

	accounts := []accountClient{}
	master := newProbeClient(conf.Cookie.AuthToken, conf.Cookie.Ct0, conf.ProxyURL, false)
	masterName := clientScreenName(master)
	if masterName == "unknown" {
		masterName = "master"
	}
	accounts = append(accounts, accountClient{name: masterName, client: master})

	cookies, err := config.ReadAdditionalCookies(filepath.Join(confDir, "additional_cookies.yaml"))
	if err != nil {
		fmt.Printf("ReadAdditionalCookies error: %v\n", err)
	} else {
		for i, c := range cookies {
			if c == nil || c.AuthToken == "" || c.Ct0 == "" {
				continue
			}
			cli := newProbeClient(c.AuthToken, c.Ct0, conf.ProxyURL, false)
			name := clientScreenName(cli)
			if name == "unknown" {
				name = fmt.Sprintf("additional#%d", i+1)
			}
			accounts = append(accounts, accountClient{name: name, client: cli})
		}
	}
	names := make([]string, 0, len(accounts))
	for _, a := range accounts {
		names = append(names, a.name)
	}
	fmt.Printf("Stress accounts=%d: %s\n", len(accounts), strings.Join(names, ", "))

	levels := []int{1, 5, 10, 20, 50, 100, 150, 200, 250, 300, 400, 500, 543}
	non1015Levels := []int{}
	for _, lvl := range levels {
		if lvl > maxConcurrency {
			break
		}

		n := lvl
		fmt.Printf("\n--- Stress level: concurrent=%d ---\n", n)
		start := time.Now()
		results := make(chan stressResult, n)
		var wg sync.WaitGroup
		for i := 0; i < n; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				acct := accounts[i%len(accounts)]
				uid := ids[i%len(ids)]
				url := userMediaURL(uid, 5)
				resp, err := acct.client.R().SetContext(ctx).Get(url)
				r := stressResult{account: acct.name}
				if err != nil {
					r.err = err.Error()
					var respErr *resty.ResponseError
					if errors.As(err, &respErr) && respErr.Response != nil {
						resp = respErr.Response
					}
				}
				if resp != nil {
					r.status = resp.StatusCode()
					r.retryAfter = resp.Header().Get("Retry-After")
					if resp.StatusCode() >= 400 {
						r.body = string(resp.Body())
					}
				}
				results <- r
			}(i)
		}
		wg.Wait()
		close(results)

		counts := map[int]int{}
		first429 := ""
		first1015 := ""
		for r := range results {
			counts[r.status]++
			if r.status == 429 {
				detail := fmt.Sprintf("account=%s retry_after=%s body=%s", r.account, r.retryAfter, strings.TrimSpace(r.body))
				if first429 == "" {
					first429 = detail
				}
				if first1015 == "" && strings.Contains(strings.ToLower(r.body), "error code: 1015") {
					first1015 = detail
				}
			}
		}
		fmt.Printf("Duration: %s\n", time.Since(start).Round(time.Millisecond))
		fmt.Printf("Status counts: %v\n", counts)
		if first1015 != "" {
			fmt.Printf("First 1015 429: %s\n", first1015)
			return
		}
		if first429 != "" {
			fmt.Printf("Non-1015 429: %s\n", first429)
			non1015Levels = append(non1015Levels, lvl)
		}
		if lvl != maxConcurrency {
			time.Sleep(delay)
		}
	}

	if len(non1015Levels) > 0 {
		fmt.Printf("\nNo 1015 observed up to %d concurrent requests; non-1015 429 levels=%v\n", maxConcurrency, non1015Levels)
	} else {
		fmt.Printf("\nNo 429 observed up to %d concurrent requests\n", maxConcurrency)
	}
}

func main() {
	var (
		confPath  string
		screen    string
		userID    string
		listID    string
		delay     time.Duration
		skipMedia bool
		burst     int
		accounts  bool
		stress    int
	)
	flag.StringVar(&confPath, "conf", "", "path to conf.yaml (default: <app root>/conf.yaml)")
	flag.StringVar(&screen, "user", "backdoorgf", "screen name to probe")
	flag.StringVar(&userID, "uid", "", "known Twitter user id; skip UserByScreenName if provided")
	flag.StringVar(&listID, "list", "", "list id: fetch real members and burst UserMedia across different users")
	flag.DurationVar(&delay, "delay", 3*time.Second, "delay between probe requests")
	flag.BoolVar(&skipMedia, "skip-media", false, "skip UserMedia probes")
	flag.IntVar(&burst, "burst", 0, "send N concurrent UserMedia requests after single probes (0 disables)")
	flag.BoolVar(&accounts, "accounts", false, "probe each configured account (master + additional) with one UserMedia request")
	flag.StringVar(&saveDir, "save-dir", "", "directory to save API response bodies")
	flag.IntVar(&stress, "stress", 0, "run stress ramp up to N concurrent UserMedia requests across all accounts (requires -list)")
	flag.Parse()

	if saveDir != "" {
		if err := os.MkdirAll(saveDir, 0755); err != nil {
			fmt.Fprintf(os.Stderr, "create save dir failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Save dir: %s\n", saveDir)
	}

	if confPath == "" {
		confPath = filepath.Join(defaultAppRoot(), "conf.yaml")
	}
	conf, err := config.ReadConf(confPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config failed: %v\n", err)
		os.Exit(1)
	}
	if conf.Cookie.AuthToken == "" || conf.Cookie.Ct0 == "" {
		fmt.Fprintln(os.Stderr, "conf.yaml is missing cookie.auth_token or cookie.ct0")
		os.Exit(1)
	}

	fmt.Printf("Probe config: conf=%s screen=@%s uid=%s delay=%s proxy=%s\n", confPath, screen, userID, delay, conf.ProxyURL)
	fmt.Println("Request styles: default (app-like) vs browser (Chrome-like)")

	ctxTimeout := 90 * time.Second
	if stress > 0 {
		ctxTimeout = 10 * time.Minute
	}
	ctx, cancel := context.WithTimeout(context.Background(), ctxTimeout)
	defer cancel()

	if stress > 0 {
		runStress(ctx, conf, filepath.Dir(confPath), listID, stress, delay)
		return
	}

	defaultClient := newProbeClient(conf.Cookie.AuthToken, conf.Cookie.Ct0, conf.ProxyURL, false)
	browserClient := newProbeClient(conf.Cookie.AuthToken, conf.Cookie.Ct0, conf.ProxyURL, true)

	// 1. UserByScreenName, both styles.
	doProbe(ctx, "UserByScreenName default", userByScreenNameURL(screen), defaultClient).Print()
	time.Sleep(delay)
	doProbe(ctx, "UserByScreenName browser", userByScreenNameURL(screen), browserClient).Print()
	time.Sleep(delay)

	// 2. Resolve user id with whichever style succeeds first.
	resolvedID := userID
	if resolvedID == "" {
		if id, err := resolveUserID(ctx, browserClient, screen); err == nil {
			resolvedID = id
			fmt.Printf("\nResolved @%s -> user id %s\n", screen, id)
		} else if id, err := resolveUserID(ctx, defaultClient, screen); err == nil {
			resolvedID = id
			fmt.Printf("\nResolved @%s -> user id %s (default client)\n", screen, id)
		} else {
			fmt.Printf("\nCould not resolve user id: %v\n", err)
		}
	}

	if resolvedID == "" || skipMedia {
		return
	}

	// 3. UserMedia, both styles.
	time.Sleep(delay)
	doProbe(ctx, "UserMedia default", userMediaURL(resolvedID, 5), defaultClient).Print()
	time.Sleep(delay)
	doProbe(ctx, "UserMedia browser", userMediaURL(resolvedID, 5), browserClient).Print()

	if saveDir != "" && listID != "" {
		time.Sleep(delay)
		doProbe(ctx, "ListByRestId save", listByRestIdURL(listID), browserClient).Print()
		time.Sleep(delay)
		doProbe(ctx, "ListMembers save page1", listMembersURL(listID, 200, ""), browserClient).Print()
	}

	if accounts {
		probeAllAccounts(ctx, conf, filepath.Dir(confPath), resolvedID, delay)
	}

	if burst > 0 {
		time.Sleep(delay)
		if listID != "" {
			runListBurst(ctx, browserClient, defaultClient, listID, burst)
		} else {
			burstProbe(ctx, fmt.Sprintf("UserMedia burst default N=%d", burst), userMediaURL(resolvedID, 100), defaultClient, burst)
		}
	}
}
