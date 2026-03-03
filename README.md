# DexScreener Watchlist Spike Notifier

A powerful Tampermonkey userscript that provides real-time spike detection and notifications for DexScreener watchlists with multi-platform alert support.

## 🚀 Features

- **Multi-Watchlist Support**: Monitor multiple DexScreener watchlist tabs simultaneously
- **Intelligent Spike Detection**: Configurable thresholds for low, medium, and high spike levels
- **Multi-Platform Notifications**: 
  - Telegram alerts with customizable messages
  - Pushbullet notifications for mobile/desktop
- **Smart Cooldown System**: Prevents notification spam with configurable cooldown periods
- **Encrypted Storage**: Sensitive API keys and tokens are securely encrypted
- **Real-time Monitoring**: Continuous monitoring of price movements and volume changes
- **User-Friendly Interface**: Easy-to-use configuration menu directly in the browser

## 📋 Requirements

- [Tampermonkey](https://www.tampermonkey.net/) browser extension
- Modern web browser (Chrome, Firefox, Edge, Safari)
- Telegram Bot Token (for Telegram notifications)
- Pushbullet Access Token (for Pushbullet notifications)

## 🛠️ Installation

1. **Install Tampermonkey**: Install the Tampermonkey extension for your browser
2. **Install the Script**: Click the raw script link and install via Tampermonkey
3. **Configure Settings**: 
   - Right-click the Tampermonkey icon → Dashboard
   - Find "DexScreener Watchlist Alert" and click the settings icon
   - Configure your API tokens and notification preferences

## ⚙️ Configuration

### API Setup

**Telegram Bot Setup:**
1. Create a bot by messaging [@BotFather](https://t.me/botfather) on Telegram
2. Use `/newbot` command and follow the instructions
3. Copy the bot token
4. Get your chat ID by messaging [@userinfobot](https://t.me/userinfobot)
5. Enter both values in the script settings

**Pushbullet Setup:**
1. Sign up at [Pushbullet](https://www.pushbullet.com/)
2. Go to Account Settings → Create Access Token
3. Copy the access token and enter it in the script settings

### Spike Thresholds

Configure three alert levels:

- **Low Spike**: Default 25% change, 30-minute cooldown
- **Medium Spike**: Default 50% change, 15-minute cooldown  
- **High Spike**: Default 100% change, 5-minute cooldown

Each level can be individually enabled/disabled for Telegram and Pushbullet notifications.

## 📊 How It Works

1. **Monitoring**: The script continuously monitors DexScreener watchlist pages
2. **Detection**: Analyzes price and volume changes for significant spikes
3. **Filtering**: Applies cooldown periods to prevent notification fatigue
4. **Notification**: Sends alerts to configured platforms when thresholds are exceeded
5. **Storage**: Securely stores settings and API tokens using encryption

## 🔧 Advanced Features

### Multi-Watchlist Support
- Open multiple DexScreener watchlist tabs
- Each tab is monitored independently
- Notifications include watchlist identifiers

### Encrypted Storage
- API tokens are encrypted using CryptoJS
- Settings are stored locally and securely
- No sensitive data is transmitted externally

### Smart Filtering
- Configurable cooldown periods per alert level
- Prevents duplicate notifications
- Respects market volatility patterns

## 🛡️ Security & Privacy

- **Local Storage**: All data stored locally in your browser
- **Encrypted Credentials**: API tokens encrypted with AES encryption
- **No Data Collection**: Script doesn't collect or transmit personal data
- **Open Source**: Full transparency with auditable code

## 📝 Script Metadata

- **Version**: 9.3
- **Author**: You
- **Namespace**: http://tampermonkey.net/
- **Match**: https://dexscreener.com/*
- **Grants**: GM_xmlhttpRequest, GM_setValue, GM_getValue, GM_deleteValue, GM_registerMenuCommand
- **Connect**: api.telegram.org, api.pushbullet.com
- **Dependencies**: jQuery 3.7.1, CryptoJS 4.1.1

## 🐛 Troubleshooting

### Common Issues

**Notifications not working:**
- Verify API tokens are correct
- Check bot permissions (Telegram)
- Ensure Pushbullet access token is valid
- Check browser console for errors

**Script not loading:**
- Ensure Tampermonkey is enabled
- Check script is enabled in Tampermonkey dashboard
- Verify URL matches `https://dexscreener.com/*`

**Performance issues:**
- Adjust cooldown periods to reduce frequency
- Disable unused notification channels
- Limit number of concurrent watchlist tabs

### Debug Mode

Enable console logging by modifying the script's log level settings. Check the browser console (F12) for detailed information about script operation.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🔗 Related Links

- [DexScreener](https://dexscreener.com/)
- [Tampermonkey](https://www.tampermonkey.net/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Pushbullet API](https://docs.pushbullet.com/)

## 📞 Support

For issues, questions, or feature requests:
- Create an issue in the repository
- Check existing issues for solutions
- Review the troubleshooting section above

---

**Disclaimer**: This script is for educational and informational purposes only. Always do your own research before making trading decisions. The authors are not responsible for any financial losses.
