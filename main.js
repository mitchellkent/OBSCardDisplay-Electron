const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

const defaultSettings = {
	sourceName: 'CardDisplay_Source',
	obsAddress: '',
	theme: 'light',
	defaultTransform: {
		positionX: 0,
		positionY: 0,
		scaleX: 1,
		scaleY: 1
	},
	timing: {
		displayDuration: 3,
		fadeDuration: 2
	}
}

function getSettingsFilePath () {
	return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings () {
	try {
		const settingsFilePath = getSettingsFilePath()
		if (fs.existsSync(settingsFilePath)) {
			const data = fs.readFileSync(settingsFilePath, 'utf8')
			const parsed = JSON.parse(data)
			return { ...defaultSettings, ...parsed }
		}
	} catch (error) {
		console.error('Error loading settings:', error)
	}
	return { ...defaultSettings }
}

function saveSettings (settings) {
	try {
		const settingsFilePath = getSettingsFilePath()
		const data = JSON.stringify(settings, null, 2)
		fs.writeFileSync(settingsFilePath, data, 'utf8')
		return true
	} catch (error) {
		console.error('Error saving settings:', error)
		return false
	}
}

let mainWindow

function createWindow () {
	// Create the browser window.
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	})

	// Load the index.html of the app.
	mainWindow.loadFile('src/index.html')

	// Open the DevTools for debugging
	mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
	// On macOS it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

app.on('activate', () => {
	// On macOS it's common to re-create a window in the 
	// app when the dock icon is clicked and there are no 
	// other windows open.
	if (mainWindow === null) {
		createWindow()
	}
})

// IPC handler for folder selection
ipcMain.handle('select-folder', async () => {
	const result = await dialog.showOpenDialog(mainWindow, {
		properties: ['openDirectory']
	})
	
	if (result.canceled) {
		return null
	}
	
	return result.filePaths[0]
})

function scanFolderRecursive (folderPath, basePath, imageExtensions) {
	const imageFiles = []

	try {
		const entries = fs.readdirSync(folderPath, { withFileTypes: true })

		for (const entry of entries) {
			const fullPath = path.join(folderPath, entry.name)
			const relativePath = path.relative(basePath, fullPath)

			if (entry.isDirectory()) {
				const subFiles = scanFolderRecursive(fullPath, basePath, imageExtensions)
				imageFiles.push(...subFiles)
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase()
				if (imageExtensions.includes(ext)) {
					const stats = fs.statSync(fullPath)

					imageFiles.push({
						name: entry.name,
						relativePath: relativePath,
						path: fullPath,
						size: stats.size,
						extension: ext
					})
				}
			}
		}
	} catch (error) {
		console.error('Error scanning folder:', error)
	}

	return imageFiles
}

// IPC handler for scanning folder for images
ipcMain.handle('scan-folder', async (event, folderPath) => {
	const imageExtensions = ['.png', '.jpeg', '.jpg', '.tiff', '.tif']
	return scanFolderRecursive(folderPath, folderPath, imageExtensions)
})

// IPC handler for showing alerts
ipcMain.handle('show-alert', async (event, options) => {
	const { type, title, message } = options
	
	let dialogType
	switch (type) {
		case 'error':
			dialogType = 'error'
			break
		case 'warning':
			dialogType = 'warning'
			break
		case 'info':
		default:
			dialogType = 'info'
			break
	}
	
	const result = await dialog.showMessageBox(mainWindow, {
		type: dialogType,
		title: title,
		message: message,
		buttons: ['OK']
	})
	
	return result
})

// IPC handler for loading app settings
ipcMain.handle('get-settings', async () => {
	return loadSettings()
})

// IPC handler for saving app settings
ipcMain.handle('save-settings', async (event, settings) => {
	return saveSettings(settings)
})
