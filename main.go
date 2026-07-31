package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"github.com/go-resty/resty/v2"
	"github.com/jmoiron/sqlx"
	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/logging"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/bot"
	"github.com/unkmonster/tmd/internal/bot/discord"
	"github.com/unkmonster/tmd/internal/bot/feishu"
	"github.com/unkmonster/tmd/internal/bot/gotify"
	"github.com/unkmonster/tmd/internal/bot/pushover"
	"github.com/unkmonster/tmd/internal/bot/telegram"
	"github.com/unkmonster/tmd/internal/bot/wechat"
	"github.com/unkmonster/tmd/internal/cli"
	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/consolelog"
	"github.com/unkmonster/tmd/internal/database"
	"github.com/unkmonster/tmd/internal/downloading"
	"github.com/unkmonster/tmd/internal/path"
	"github.com/unkmonster/tmd/internal/service"
	"github.com/unkmonster/tmd/internal/twitter"
	"github.com/unkmonster/tmd/internal/utils"
)

func initLogger(dbg bool, logFile io.Writer, logHub *consolelog.Hub) {
	formatter := logging.NewTextFormatter()
	formatter.ForceColors = true // 终端彩色；文件端由 LumberjackHook 剥离 ANSI
	log.SetFormatter(formatter)

	if dbg {
		log.SetLevel(log.DebugLevel)
	} else {
		log.SetLevel(log.InfoLevel)
	}

	if err := consolelog.StartCapture(logHub); err != nil {
		log.Warnf("[startup] Console log capture failed error=%q", err.Error())
	} else {
		log.SetOutput(os.Stderr)
	}
	log.AddHook(logging.NewLumberjackHook(logFile))
}

func main() {
	var serverPort int
	var err error

	bootstrap, err := parseBootstrapArgs(os.Args[1:])
	if err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if !bootstrap.serverPortSet {
		serverPort, err = serverPortFromEnv()
		if err != nil {
			_, _ = fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	} else {
		serverPort = bootstrap.serverPort
	}
	if serverPort == 0 {
		serverPort = 25556
	}

	ctx, cancel := context.WithCancel(context.Background())

	appRootPath, err := resolveAppRootPath()
	if err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	confPath := filepath.Join(appRootPath, "conf.yaml")
	cliLogPath := filepath.Join(appRootPath, "client.log")
	logPath := filepath.Join(appRootPath, "tmd2.log")
	if err = os.MkdirAll(appRootPath, 0755); err != nil {
		log.Fatalf("[startup] App directory create failed path=%q error=%q", logging.Path(appRootPath), err.Error())
	}

	logWriter := logging.NewRotatingWriter(logPath)
	cliLogWriter := logging.NewRotatingWriter(cliLogPath)
	defer cliLogWriter.Close()
	defer logWriter.Close()
	consoleLogHub := consolelog.DefaultHub()
	initLogger(bootstrap.dbg, logWriter, consoleLogHub)

	defer func() {
		if bootstrap.dbg {
			twitter.ReportRequestCount()
		}
	}()

	loadResult, err := config.LoadStartupConfig(confPath, bootstrap.confArg, os.Stderr)
	if err != nil {
		log.Fatalf("[startup] Config load failed path=%q error=%q", logging.Path(confPath), err.Error())
	}
	conf := loadResult.Config
	if loadResult.UsedEnvFallback {
		log.Infof("[config] Env fallback used path=%q", logging.Path(confPath))
	}
	if loadResult.EnvApplied {
		log.Info("[config] Env configuration applied prefix=TMD_")
	}
	if bootstrap.confArg {
		log.Info("[config] Config template written")
		return
	}
	if err := config.Validate(conf); err != nil {
		log.Fatalf("[startup] Config validation failed path=%q error=%q", logging.Path(confPath), err.Error())
	}
	maxDownloadRoutine := conf.MaxDownloadRoutine
	if maxDownloadRoutine <= 0 {
		maxDownloadRoutine = config.DefaultMaxDownloadRoutine()
	}
	maxFileNameLen := conf.MaxFileNameLen
	if maxFileNameLen <= 0 {
		maxFileNameLen = utils.DefaultMaxFileNameLen
	}
	log.Infof("[startup] Config loaded root=%q max_download_routine=%d max_file_name_len=%d", logging.Path(conf.RootPath), maxDownloadRoutine, maxFileNameLen)

	if conf.ProxyURL != "" {
		os.Setenv("HTTP_PROXY", conf.ProxyURL)
		os.Setenv("HTTPS_PROXY", conf.ProxyURL)
	} else {
		// conf 没设代理，检查系统环境变量，只设一个时同步到另一个
		httpProxy := os.Getenv("HTTP_PROXY")
		httpsProxy := os.Getenv("HTTPS_PROXY")
		if httpProxy == "" {
			httpProxy = os.Getenv("http_proxy")
		}
		if httpsProxy == "" {
			httpsProxy = os.Getenv("https_proxy")
		}

		if httpProxy != "" && httpsProxy == "" {
			os.Setenv("HTTPS_PROXY", httpProxy)
			os.Setenv("https_proxy", httpProxy)
		} else if httpsProxy != "" && httpProxy == "" {
			os.Setenv("HTTP_PROXY", httpsProxy)
			os.Setenv("http_proxy", httpsProxy)
		}
	}

	loginOpts := twitter.LoginOptions{}

	// Server 模式
	if bootstrap.serverMode {
		runServer(conf, appRootPath, serverPort, loginOpts, logWriter, consoleLogHub, cliLogWriter)
		return
	}

	// CLI 模式
	client, additional, _, db := initializeClients(ctx, conf, appRootPath, loginOpts, bootstrap.dbg)
	if client == nil || db == nil {
		log.Fatal("[startup] Dependency initialization failed client_ready=false_or_db_ready=false")
	}
	defer db.Close()

	// 设置客户端日志（lumberjack 自动轮转）
	cli.SetClientLogger(client, cliLogWriter)
	for _, c := range additional {
		cli.SetClientLogger(c, cliLogWriter)
	}

	// 信号处理
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, shutdownSignals()...)
	defer close(sigChan)
	defer signal.Stop(sigChan)
	go func() {
		sig, ok := <-sigChan
		if ok {
			log.Warnf("[listener] Signal caught signal=%s", sig)
			cancel()
		}
	}()

	// 构造依赖
	deps := &cli.Dependencies{
		Dependencies: service.Dependencies{
			Client:            client,
			AdditionalClients: additional,
			DB:                db,
			Config:            conf,
			ListSyncManager:   downloading.NewListSyncManager(db),
		},
	}

	// 将 cli 参数传递给 Execute
	if err := cli.Execute(ctx, bootstrap.cliArgs, deps); err != nil {
		log.Fatalf("[startup] CLI execute failed error=%q", err.Error())
	}
}

type bootstrapArgs struct {
	confArg       bool
	dbg           bool
	serverMode    bool
	serverPort    int
	serverPortSet bool
	cliArgs       []string
}

func parseBootstrapArgs(args []string) (bootstrapArgs, error) {
	var parsed bootstrapArgs
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch arg {
		case "-conf":
			parsed.confArg = true
		case "-dbg":
			parsed.dbg = true
		case "-server":
			parsed.serverMode = true
		case "-port":
			if i+1 >= len(args) {
				return parsed, fmt.Errorf("-port requires a value")
			}
			port, err := strconv.Atoi(args[i+1])
			if err != nil || port <= 0 || port > 65535 {
				return parsed, fmt.Errorf("invalid -port %q: must be an integer from 1 to 65535", args[i+1])
			}
			parsed.serverPort = port
			parsed.serverPortSet = true
			i++
		default:
			parsed.cliArgs = append(parsed.cliArgs, arg)
		}
	}
	return parsed, nil
}

func serverPortFromEnv() (int, error) {
	raw := strings.TrimSpace(os.Getenv("TMD_PORT"))
	if raw == "" {
		return 0, nil
	}
	port, err := strconv.Atoi(raw)
	if err != nil || port <= 0 || port > 65535 {
		return 0, fmt.Errorf("invalid TMD_PORT %q: must be an integer from 1 to 65535", raw)
	}
	return port, nil
}

func resolveAppRootPath() (string, error) {
	if tmdHome := strings.TrimSpace(os.Getenv("TMD_HOME")); tmdHome != "" {
		absPath, err := filepath.Abs(tmdHome)
		if err != nil {
			return "", fmt.Errorf("failed to resolve TMD_HOME %q: %w", tmdHome, err)
		}
		return absPath, nil
	}

	var homepath string
	if runtime.GOOS == "windows" {
		homepath = os.Getenv("APPDATA")
	} else {
		homepath = os.Getenv("HOME")
	}
	if homepath == "" {
		return "", fmt.Errorf("failed to get home path from env; set TMD_HOME to the app config directory")
	}
	return filepath.Join(homepath, ".tmd2"), nil
}

// initializeClients 初始化 Twitter 客户端和数据库连接
// 返回主客户端、附加客户端列表、路径助手和数据库连接
func initializeClients(
	ctx context.Context,
	conf *config.Config,
	appRootPath string,
	loginOpts twitter.LoginOptions,
	enableRequestCounting bool,
) (*resty.Client, []*resty.Client, *path.StorePath, *sqlx.DB) {
	// 登录主账户
	client, screenName, err := twitter.LoginWithOptions(ctx, conf.Cookie.AuthToken, conf.Cookie.Ct0, loginOpts)
	if err != nil {
		log.Fatalf("[startup] Login failed error=%q", err.Error())
	}
	twitter.EnableRateLimit(client)
	if enableRequestCounting {
		twitter.EnableRequestCounting(client)
	}
	log.Infof("[startup] Signed in account=%s", screenName)

	// 加载额外 cookies
	additionalCookiesPath := filepath.Join(appRootPath, "additional_cookies.yaml")
	cookies, err := config.ReadAdditionalCookies(additionalCookiesPath)
	if err != nil {
		log.Warnf("[startup] Additional cookies load failed path=%q error=%q", logging.Path(additionalCookiesPath), err.Error())
	}
	log.Debugf("[startup] Additional cookies loaded count=%d", len(cookies))

	twitterCookies := make([]twitter.AccountCookie, len(cookies))
	for i, c := range cookies {
		twitterCookies[i] = twitter.AccountCookie{AuthToken: c.AuthToken, Ct0: c.Ct0}
	}

	batchOpts := twitter.BatchLoginOptions{Debug: enableRequestCounting}
	additional := twitter.BatchLogin(ctx, batchOpts, twitterCookies, screenName)

	// 初始化路径和数据库
	pathHelper, err := path.NewStorePath(conf.RootPath)
	if err != nil {
		log.Warnf("[startup] Store directory create failed root=%q error=%q", logging.Path(conf.RootPath), err.Error())
		return nil, nil, nil, nil
	}

	db, err := database.Connect(pathHelper.DB)
	if err != nil {
		log.Fatalf("[db] Connect failed path=%q error=%q", logging.Path(pathHelper.DB), err.Error())
	}
	log.Infof("[db] Connected path=%q", logging.Path(pathHelper.DB))

	return client, additional, pathHelper, db
}

func runServer(conf *config.Config, appRootPath string, port int, loginOpts twitter.LoginOptions, logWriter io.Closer, logHub *consolelog.Hub, cliLogWriter io.Writer) {
	ctx := context.Background()

	client, additional, _, db := initializeClients(ctx, conf, appRootPath, loginOpts, false)
	if client == nil {
		log.Error("[startup] Dependency initialization failed reason=store_directory")
		return
	}

	// 设置客户端日志（lumberjack 自动轮转）
	cli.SetClientLogger(client, cliLogWriter)
	for _, c := range additional {
		cli.SetClientLogger(c, cliLogWriter)
	}

	// 创建并启动 API Server
	// 注意：不再使用 defer db.Close()，因为 GracefulShutdown 会处理所有资源清理
	server := api.NewServerWithConsoleLogHub(client, additional, db, conf, appRootPath, logWriter, logHub)

	// 信号处理
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, shutdownSignals()...)
	defer signal.Stop(sigChan)
	startServerSignalHandler(sigChan, server.GracefulShutdown)

	// Bot 初始化
	botConfPath := filepath.Join(appRootPath, "bot_config.yaml")
	botConf, err := config.LoadBotConfig(botConfPath)
	if err != nil {
		if os.IsNotExist(err) {
			if writeErr := writeDefaultBotConfig(botConfPath); writeErr != nil {
				log.Warnf("[startup] Default bot config create failed path=%q error=%q", logging.Path(botConfPath), writeErr.Error())
			}
		} else if isEmptyBotConfigError(err) {
			log.Infof("[startup] Bot config skipped reason=empty path=%q", logging.Path(botConfPath))
		} else {
			log.Warnf("[startup] Bot config load failed path=%q error=%q", logging.Path(botConfPath), err.Error())
		}
	}
	server.InitBot(initBot(botConf, server))

	err = server.Start(port)
	if err != nil && err != http.ErrServerClosed {
		log.Fatalf("[server] Start failed port=%d error=%q", port, err.Error())
	}
	if err == http.ErrServerClosed {
		server.WaitForShutdown()
	}
}

func startServerSignalHandler(sigChan <-chan os.Signal, shutdown func(string)) {
	go func() {
		sig := <-sigChan
		log.Warnf("[server] Signal caught signal=%s", sig)
		// SIGKILL 无法捕获；这里只处理可拦截的退出信号，确保数据库等资源优雅关闭。
		shutdown("signal:" + sig.String())
	}()
}

func isEmptyBotConfigError(err error) bool {
	return err == io.EOF
}

func initBot(botConf *config.BotConfig, server *api.Server) []bot.Bot {
	if botConf == nil {
		return nil
	}
	var bots []bot.Bot
	if botConf.Telegram != nil && botConf.Telegram.Token != "" {
		bots = append(bots, telegram.NewBot(botConf.Telegram, server.TaskManager(), server.EventBus(), server.LogHub(), server.EnqueueTask))
	}
	if botConf.Discord != nil && botConf.Discord.Token != "" {
		bots = append(bots, discord.NewBot(botConf.Discord, server.TaskManager(), server.EventBus(), server.LogHub(), server.EnqueueTask))
	}
	if botConf.Gotify != nil && botConf.Gotify.Token != "" && botConf.Gotify.ServerURL != "" {
		bots = append(bots, gotify.NewBot(botConf.Gotify, server.EventBus(), server.LogHub()))
	}
	if botConf.Pushover != nil && botConf.Pushover.Token != "" && botConf.Pushover.User != "" {
		bots = append(bots, pushover.NewBot(botConf.Pushover, server.EventBus(), server.LogHub()))
	}
	if botConf.WeChat != nil && botConf.WeChat.CredentialPath != "" {
		bots = append(bots, wechat.NewBot(botConf.WeChat, server.TaskManager(), server.EventBus(), server.LogHub(), server.EnqueueTask))
	}
	if botConf.Feishu != nil && botConf.Feishu.AppID != "" && botConf.Feishu.AppSecret != "" {
		feishuBot := feishu.NewBot(botConf.Feishu, server.TaskManager(), server.EventBus(), server.LogHub(), server.EnqueueTask)
		server.RegisterBotCallback(feishuBot.CallbackPath(), feishuBot.CallbackHandler())
		bots = append(bots, feishuBot)
	}
	return bots
}

func writeDefaultBotConfig(path string) error {
	template := `# TMD Bot Configuration
# Uncomment and configure the platforms you want to use.
# This file is watched on startup only; changes require a restart.

# --- Telegram ---
# 1. Create a bot via @BotFather, get the token.
# 2. Get your user ID by sending a message to the bot, then visit:
#    https://api.telegram.org/bot<token>/getUpdates → message.from.id
#telegram:
#  token: "123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
#  allowed_users: [123456789]

# --- Discord ---
# 1. Create app at https://discord.com/developers/applications → Bot → Reset Token
# 2. Enable Developer Mode in Discord → right-click user → Copy ID
#discord:
#  token: "MTE5ODk4MjQ2NzE4NTMyMTI5OQ.GnO2X.xxx"
#  allowed_users: ["123456789012345678"]

# --- WeChat iLink ---
# Uses personal WeChat account via iLink protocol. Requires QR code scan on first login.
# credential_path is relative to the working directory; auto-created after login.
#wechat:
#  credential_path: ".weixin-token.json"
#  allowed_users: ["friend@im.wechat"]

# --- Feishu / Lark ---
# 1. Create app at https://open.feishu.cn/app → get App ID + App Secret
# 2. Enable Bot capability, add "Receive message v2.0" event
# 3. Set callback URL to https://your-domain/api/v1/bot/feishu/callback
#feishu:
#  app_id: "cli_xxxxxxxxxxxx"
#  app_secret: "xxxxxxxxxxxxxxxxxxxxxxxxxx"
#  verify_token: "xxxxxxxxxxxx"
#  encrypt_key: ""
#  allowed_users: ["ou_xxxxxxxxxxxxx"]

# --- Gotify (push only, no commands) ---
# Self-hosted push notification server. Install from https://github.com/gotify/server
#gotify:
#  server_url: "http://gotify.lan:8080"
#  token: "S3cr3tT0k3n"
#  priority: 5

# --- Pushover (push only, no commands) ---
# Register at https://pushover.net → get User Key → create Application/API Token
#pushover:
#  user: "uKey123..."
#  token: "appToken456..."
#  device: "iphone"
#  sound: "gamelan"
`
	return os.WriteFile(path, []byte(template), 0644)
}
