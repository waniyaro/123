# Ateex Cloud Auto Script - Modular System

A sophisticated modular Tampermonkey script for automated coin earning on Ateex Cloud with intelligent reCAPTCHA solving and comprehensive statistics tracking.

## 🚀 Quick Start

1. **Install Main Script**: Install `main.js` in Tampermonkey
2. **Upload Modules**: Upload all module files to your GitHub repository
3. **Configure URLs**: Ensure the GitHub URLs match your repository structure
4. **Run**: Visit `https://dash.ateex.cloud` and enter your credentials

## 📁 Project Structure

```
ateex-modular-system/
├── main.js                      # Main loader script (~300 lines)
├── modules/
│   ├── core.module.js          # Core utilities and global state
│   ├── credentials.module.js   # Secure credential management
│   ├── data.module.js          # Statistics and data persistence
│   ├── ui.module.js            # User interface components
│   ├── recaptcha.module.js     # reCAPTCHA solver with AI
│   ├── workflow.module.js      # Auto-earning workflow logic
│   └── error.module.js         # Error detection and handling
└── README.md                   # This file
```

## 🎯 Features

### ✅ Core Features (Preserved from Original)
- **Auto Login**: Secure credential storage with encryption
- **reCAPTCHA Solver**: AI-powered audio solving with multiple servers
- **Auto Earning**: Automated coin collection from Ateex Cloud
- **Smart Statistics**: Real-time tracking with progress indicators
- **Error Handling**: Intelligent error detection and recovery
- **Browser Management**: Automatic cookie clearing and session management

### 🆕 Modular System Features
- **Dynamic Module Loading**: 24-hour intelligent caching
- **Dependency Management**: Automatic module dependency resolution
- **Fallback Mechanisms**: Robust error handling with retries
- **Performance Optimization**: Lazy loading and efficient resource usage
- **Version Management**: Module versioning and update detection

## 🛠️ Installation Guide

### Step 1: GitHub Repository Setup

1. **Create Repository**: Create a new repository: `script-auto-earn-with-coins-recaptcha-solver`
2. **Upload Modules**: Upload all module files to `modules/` directory
3. **Set Permissions**: Ensure repository is public or accessible

### Step 2: Main Script Installation

1. **Copy Main Script**: Copy the contents of `main.js`
2. **Install in Tampermonkey**: Create new script and paste contents
3. **Update URLs**: Verify the GitHub base URL matches your repository:
   ```javascript
   const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/SmallFCraft/script-auto-earn-with-coins-recaptcha-solver/main/modules/';
   ```

### Step 3: Configuration

1. **Server Connections**: The script connects to these domains:
   - `engageub.pythonanywhere.com`
   - `engageub1.pythonanywhere.com`
   - `raw.githubusercontent.com`
   - `github.com`

2. **Permissions**: Ensure Tampermonkey grants:
   - `GM_xmlhttpRequest`
   - `GM_getValue`
   - `GM_setValue`

## 📊 Module Breakdown

### Core Module (`core.module.js`)
- **Global State Management**: Centralized application state
- **Logging System**: Color-coded logging with spam prevention
- **Utility Functions**: Helper functions for DOM, timing, and data
- **Runtime Control**: Auto-stats enabling/disabling
- **Browser Management**: Cookie and storage clearing

### Credentials Module (`credentials.module.js`)
- **Secure Storage**: XOR encryption with expiration
- **Validation**: Email/username and password validation
- **UI Components**: Modal dialogs for credential input
- **Error Detection**: Login failure detection and handling
- **Session Management**: Remember credentials across sessions

### Data Module (`data.module.js`)
- **Statistics Tracking**: Cycles, coins, runtime, and rates
- **History Management**: Persistent statistics history (100 entries)
- **Target Management**: User-defined coin targets with progress
- **Server Analytics**: Server performance and latency tracking
- **Export/Import**: JSON and CSV data export functionality

### UI Module (`ui.module.js`)
- **Counter Display**: Real-time statistics overlay
- **Modal System**: Unified modal components
- **Settings Management**: Dropdown menus and configuration
- **Progress Tracking**: Visual progress indicators
- **Responsive Design**: Adaptive UI elements

### ReCAPTCHA Module (`recaptcha.module.js`)
- **AI Integration**: Audio-to-text conversion using AI servers
- **Server Management**: Intelligent server selection and failover
- **Performance Tracking**: Latency and success rate monitoring
- **Cooldown System**: Automated query rate limiting
- **State Management**: Cross-frame communication for iframes

### Workflow Module (`workflow.module.js`)
- **Page Handlers**: Specialized logic for each page type
- **State Coordination**: Cross-module state management
- **Error Recovery**: Graceful error handling and recovery
- **Flow Control**: Automated navigation and action sequences
- **Session Management**: Credential verification and setup

### Error Module (`error.module.js`)
- **Error Detection**: Pattern-based error page detection
- **Script Control**: Emergency stop and resource cleanup
- **Redirect Handling**: Automatic recovery from error pages
- **Resource Tracking**: Interval and timeout management
- **Notification System**: User notifications for critical events

## 🔧 Configuration Options

### GitHub URL Configuration
Update the base URL in `main.js` to match your repository:
```javascript
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/modules/';
```

### Module Dependencies
The dependency system automatically loads modules in the correct order:
```
core → [credentials, data, recaptcha, error]
data → ui
[core, credentials, data, ui] → workflow
```

### Cache Management
- **Duration**: 24 hours by default
- **Storage**: localStorage with fallback mechanisms
- **Invalidation**: Automatic cache refresh on errors

## 📈 Performance Features

### Intelligent Caching
- **Module Caching**: 24-hour cache with version tracking
- **Server Latency**: Cached server performance metrics
- **Fallback Loading**: Multiple retry mechanisms

### Resource Optimization
- **Lazy Loading**: Modules loaded only when needed
- **Dependency Resolution**: Efficient dependency management
- **Memory Management**: Cleanup and garbage collection

### Network Optimization
- **Server Selection**: Best server based on latency and success rate
- **Request Batching**: Efficient API usage
- **Timeout Handling**: Robust timeout and retry logic

## 🛡️ Security Features

### Credential Protection
- **Encryption**: XOR encryption for localStorage
- **Expiration**: 24-hour automatic expiration
- **Validation**: Format and length validation
- **Secure Transmission**: No credential exposure in logs

### Data Privacy
- **Local Storage**: All data stored locally
- **No Tracking**: No external analytics or tracking
- **Secure Communication**: HTTPS-only connections
- **Permission Control**: Minimal required permissions

## 🐛 Troubleshooting

### Common Issues

1. **Module Loading Failure**
   - Check GitHub repository accessibility
   - Verify file paths and URLs
   - Check browser network connectivity
   - Clear module cache: `localStorage.clear()`

2. **reCAPTCHA Not Solving**
   - Ensure credentials are entered
   - Check server connectivity
   - Verify AI server status
   - Check console for error messages

3. **Statistics Not Updating**
   - Verify auto-stats is enabled
   - Check localStorage permissions
   - Ensure UI module loaded correctly
   - Refresh page and retry

### Debug Mode
Enable debug logging by setting:
```javascript
// In browser console
localStorage.setItem('ateex_debug', 'true');
```

### Cache Management
Clear module cache if experiencing issues:
```javascript
// In browser console
Object.keys(localStorage).forEach(key => {
    if (key.startsWith('ateex_module_')) {
        localStorage.removeItem(key);
    }
});
```

## 🔄 Update Process

### Module Updates
1. Update module files in GitHub repository
2. Clear module cache or wait 24 hours
3. Refresh page to load new modules

### Main Script Updates
1. Update `main.js` in Tampermonkey
2. Clear cache if needed
3. Test functionality

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes to modules
4. Test thoroughly
5. Submit pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This script is for educational purposes only. Use responsibly and in accordance with Ateex Cloud's terms of service. The authors are not responsible for any consequences of using this script.

## 🔗 Links

- **Original Script**: `auto-ateexcloud-old.js`
- **GitHub Repository**: `https://github.com/SmallFCraft/script-auto-earn-with-coins-recaptcha-solver`
- **Issues**: Report issues in GitHub repository
- **Documentation**: See individual module files for detailed documentation
