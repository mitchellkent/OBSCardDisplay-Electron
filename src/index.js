// Get DOM elements
const urlInput = document.getElementById('url');
const passwordInput = document.getElementById('password');
const connectBtn = document.getElementById('connect-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const resultDiv = document.getElementById('result');

// Import obs-websocket-js
const { OBSWebSocket } = window.require('obs-websocket-js');
const obs = new OBSWebSocket();

// Folder selection elements
const folderPathInput = document.getElementById('folder-path');
const browseBtn = document.getElementById('browse-btn');
const imageSearchInput = document.getElementById('image-search');
const imagePreviewDiv = document.getElementById('image-preview');

// Image control elements
const selectedImageName = document.getElementById('selected-image-name');
const showTimedBtn = document.getElementById('show-timed-btn');
const showIndefiniteBtn = document.getElementById('show-indefinite-btn');
const hideBtn = document.getElementById('hide-btn');
const displayDurationInput = document.getElementById('display-duration');
const fadeDurationInput = document.getElementById('fade-duration');

// Get IPC renderer for alerts and settings
const { ipcRenderer } = window.require('electron');

// State
let appSettings = null;
let selectedImage = null;
let activeFade = null;
let filterOpacityScale = 100;
let allImageFiles = [];
let currentImagePath = null;
let currentOpacity = 0.0;

// Source name is fixed per the plan
const SOURCE_NAME = 'CardDisplay_Source';
const FILTER_NAME = 'CardDisplayOpacity';

// Helper function to show alerts
function showAlert(type, title, message) {
	ipcRenderer.invoke('show-alert', { type, title, message });
}

// Apply the saved or selected theme
function applyTheme(theme) {
	const isDark = theme === 'dark';
	document.body.classList.toggle('dark-mode', isDark);
	if (themeToggleBtn) {
		themeToggleBtn.textContent = isDark ? 'Light Mode' : 'Dark Mode';
	}
}

// Load saved settings
async function loadSettings() {
	try {
		appSettings = await ipcRenderer.invoke('get-settings');
		urlInput.value = appSettings.obsAddress || '';
		displayDurationInput.value = appSettings.timing.displayDuration;
		fadeDurationInput.value = appSettings.timing.fadeDuration;
		applyTheme(appSettings.theme || 'light');
	} catch (error) {
		console.error('Error loading settings:', error);
		appSettings = {
			sourceName: SOURCE_NAME,
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
		};
		applyTheme('light');
	}
}

// Save current settings
async function saveCurrentSettings() {
	if (!appSettings) {
		appSettings = {
			sourceName: SOURCE_NAME,
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
		};
	}

	appSettings.obsAddress = urlInput.value.trim();
	appSettings.theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
	appSettings.timing = {
		displayDuration: parseFloat(displayDurationInput.value) || 3,
		fadeDuration: parseFloat(fadeDurationInput.value) || 2
	};

	try {
		await ipcRenderer.invoke('save-settings', appSettings);
	} catch (error) {
		console.error('Error saving settings:', error);
	}
}

// Update action button states
function updateButtonStates() {
	const enabled = obs.identified && selectedImage !== null;
	showTimedBtn.disabled = !enabled;
	showIndefiniteBtn.disabled = !enabled;
	hideBtn.disabled = !enabled;

	const buttonGroup = document.querySelector('.button-group');
	if (buttonGroup) {
		buttonGroup.classList.toggle('ready', enabled);
	}
}

// Set up OBS event listeners
obs.on('ConnectionClosed', () => {
	resultDiv.innerHTML = '<p class="error">Connection to OBS closed</p>';
	connectBtn.textContent = 'Connect';
	connectBtn.disabled = false;
	selectedImage = null;
	updateSelectionUI();
	updateButtonStates();
	showAlert('warning', 'Connection Closed', 'Connection to OBS Studio has been closed');
});

obs.on('ConnectionError', (error) => {
	resultDiv.innerHTML = `<p class="error">Connection error: ${error.message}</p>`;
	connectBtn.textContent = 'Connect';
	connectBtn.disabled = false;
	updateButtonStates();
	showAlert('error', 'Connection Error', `OBS connection error: ${error.message}`);
});

// Handle OBS connect/disconnect
async function handleConnect() {
	const url = urlInput.value.trim();
	const password = passwordInput.value;

	// Remember the last used address
	saveCurrentSettings();

	// Check if already connected
	if (obs.identified) {
		await obs.disconnect();
		resultDiv.innerHTML = '<p class="info">Disconnected from OBS</p>';
		connectBtn.textContent = 'Connect';
		showAlert('info', 'Disconnected', 'Successfully disconnected from OBS Studio');
		updateButtonStates();
		return;
	}

	// Validate inputs
	if (!url) {
		resultDiv.innerHTML = '<p class="error">Please enter OBS address</p>';
		showAlert('error', 'Validation Error', 'Please enter OBS address');
		return;
	}

	// Disable button and show loading state
	connectBtn.disabled = true;
	connectBtn.textContent = 'Connecting...';
	resultDiv.innerHTML = '<p class="loading">Connecting to OBS...</p>';

	try {
		// Connect to OBS WebSocket
		await obs.connect(url, password);

		// Get OBS version info to verify connection
		const version = await obs.call('GetVersion');

		resultDiv.innerHTML = `
			<div class="success">
				<h3>Connected to OBS!</h3>
			</div>
		`;

		// Show success alert
		showAlert('info', 'Connection Successful', `Successfully connected to OBS Studio ${version.obsVersion}`);

		// Change button to disconnect
		connectBtn.textContent = 'Disconnect';
		connectBtn.disabled = false;
		updateButtonStates();

	} catch (error) {
		resultDiv.innerHTML = `
			<div class="error">
				<h3>Connection Failed</h3>
				<p>${error.message}</p>
				<p>Make sure OBS Studio is running and obs-websocket is enabled</p>
			</div>
		`;

		// Show error alert
		showAlert('error', 'Connection Failed', `Failed to connect to OBS: ${error.message}`);

		connectBtn.textContent = 'Connect';
		connectBtn.disabled = false;
		updateButtonStates();
	}
}

// Add event listener to the connect button
connectBtn.addEventListener('click', handleConnect);

// Connect on Enter key in address or password fields
function handleEnterKey(event) {
	if (event.key === 'Enter') {
		event.preventDefault();
		handleConnect();
	}
}

urlInput.addEventListener('keydown', handleEnterKey);
passwordInput.addEventListener('keydown', handleEnterKey);

// Add event listener to the browse button
browseBtn.addEventListener('click', async () => {
	try {
		// Open folder selection dialog
		const selectedPath = await ipcRenderer.invoke('select-folder');

		if (selectedPath) {
			folderPathInput.value = selectedPath;

			// Scan folder for images
			const imageFiles = await ipcRenderer.invoke('scan-folder', selectedPath);

			// Display image previews
			displayImagePreviews(imageFiles);
		}
	} catch (error) {
		console.error('Error selecting folder:', error);
		imagePreviewDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
		showAlert('error', 'Folder Selection Error', `Failed to select folder: ${error.message}`);
	}
});

// Add event listener to the search input
imageSearchInput.addEventListener('input', applyImageFilter);

// Update selection UI
function updateSelectionUI() {
	const cards = document.querySelectorAll('.image-card');
	cards.forEach(card => {
		if (selectedImage && card.dataset.path === selectedImage.path) {
			card.classList.add('selected');
		} else {
			card.classList.remove('selected');
		}
	});

	selectedImageName.textContent = selectedImage ? (selectedImage.relativePath || selectedImage.name) : 'No image selected';
	updateButtonStates();
}

// Apply the current search filter and re-render
function applyImageFilter() {
	const query = imageSearchInput.value.trim().toLowerCase();
	if (!query) {
		renderImageGrid(allImageFiles);
		return;
	}

	const filtered = allImageFiles.filter(imageFile => {
		const nameMatch = imageFile.name.toLowerCase().includes(query);
		const pathMatch = imageFile.relativePath && imageFile.relativePath.toLowerCase().includes(query);
		return nameMatch || pathMatch;
	});

	renderImageGrid(filtered);
}

// Render image grid for a given list
function renderImageGrid(imageFiles) {
	if (imageFiles.length === 0) {
		imagePreviewDiv.innerHTML = '<p class="info">No matching image files found.</p>';
		return;
	}

	// Create grid layout for images
	const gridContainer = document.createElement('div');
	gridContainer.className = 'image-grid';

	imageFiles.forEach(imageFile => {
		const imageCard = document.createElement('div');
		imageCard.className = 'image-card';
		imageCard.dataset.path = imageFile.path;
		imageCard.title = imageFile.relativePath || imageFile.name;

		const img = document.createElement('img');
		img.src = `file://${imageFile.path}`;
		img.alt = imageFile.name;
		img.loading = 'lazy';

		const info = document.createElement('div');
		info.className = 'image-info';
		info.innerHTML = `
			<p class="image-name">${imageFile.name}</p>
			<p class="image-size">${formatFileSize(imageFile.size)}</p>
			${imageFile.relativePath ? `<p class="image-path">${imageFile.relativePath}</p>` : ''}
		`;

		imageCard.appendChild(img);
		imageCard.appendChild(info);

		imageCard.addEventListener('click', () => {
			selectedImage = imageFile;
			updateSelectionUI();
		});

		gridContainer.appendChild(imageCard);
	});

	imagePreviewDiv.innerHTML = '';
	imagePreviewDiv.appendChild(gridContainer);
}

// Function to display image previews
function displayImagePreviews(imageFiles) {
	allImageFiles = imageFiles;
	imageSearchInput.value = '';
	applyImageFilter();
}

// Helper function to format file size
function formatFileSize(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Get current OBS program scene
async function getCurrentScene() {
	const response = await obs.call('GetCurrentProgramScene');
	return response.currentProgramSceneName;
}

// Find or create the image source in the current scene
async function getOrCreateSource(sceneName) {
	// Get list of scene items
	const { sceneItems } = await obs.call('GetSceneItemList', { sceneName });

	// Find existing source with our fixed name
	const existingItem = sceneItems.find(item => item.sourceName === SOURCE_NAME);
	if (existingItem) {
		return { sceneItemId: existingItem.sceneItemId, created: false };
	}

	// Create a new image source in the current scene
	const { sceneItemId } = await obs.call('CreateInput', {
		sceneName,
		inputName: SOURCE_NAME,
		inputKind: 'image_source',
		inputSettings: {
			file: ''
		},
		sceneItemEnabled: true
	});

	// Position the newly created source once. After creation, OBS controls the position/size.
	const transform = appSettings ? appSettings.defaultTransform : { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1 };
	await obs.call('SetSceneItemTransform', {
		sceneName,
		sceneItemId,
		sceneItemTransform: {
			positionX: transform.positionX,
			positionY: transform.positionY,
			scaleX: transform.scaleX,
			scaleY: transform.scaleY
		}
	});

	return { sceneItemId, created: true };
}

// Ensure the source has an opacity filter for fading
async function ensureOpacityFilter() {
	try {
		const { filters } = await obs.call('GetSourceFilterList', { sourceName: SOURCE_NAME });
		const existingFilter = filters.find(filter => filter.filterName === FILTER_NAME);

		if (existingFilter) {
			filterOpacityScale = (existingFilter.filterKind === 'color_filter_v2') ? 1 : 100;
			return;
		}

		// Try the v2 filter first (0-1 opacity scale)
		try {
			await obs.call('CreateSourceFilter', {
				sourceName: SOURCE_NAME,
				filterName: FILTER_NAME,
				filterKind: 'color_filter_v2',
				filterSettings: {
					opacity: 1.0
				}
			});
			filterOpacityScale = 1;
		} catch (v2Error) {
			// Fall back to the legacy v1 filter (0-100 opacity scale)
			await obs.call('CreateSourceFilter', {
				sourceName: SOURCE_NAME,
				filterName: FILTER_NAME,
				filterKind: 'color_filter',
				filterSettings: {
					opacity: 100.0
				}
			});
			filterOpacityScale = 100;
		}
	} catch (error) {
		console.error('Error ensuring opacity filter:', error);
		throw error;
	}
}

// Set the opacity on the color correction filter
async function setSourceOpacity(opacity) {
	currentOpacity = Math.max(0, Math.min(1, opacity));
	const rawValue = currentOpacity * filterOpacityScale;
	await obs.call('SetSourceFilterSettings', {
		sourceName: SOURCE_NAME,
		filterName: FILTER_NAME,
		filterSettings: {
			opacity: Math.max(0, Math.min(filterOpacityScale, rawValue))
		}
	});
}

// Update the image source file and make it visible
async function setImageAndShow(filePath, opacity = 1.0) {
	const sceneName = await getCurrentScene();
	const { sceneItemId } = await getOrCreateSource(sceneName);

	// Update the image file
	await obs.call('SetInputSettings', {
		inputName: SOURCE_NAME,
		inputSettings: {
			file: filePath
		},
		overlay: true
	});

	currentImagePath = filePath;

	// Make sure the source is enabled
	await obs.call('SetSceneItemEnabled', {
		sceneName,
		sceneItemId,
		sceneItemEnabled: true
	});

	// Ensure and set opacity
	await ensureOpacityFilter();
	await setSourceOpacity(opacity);
}

// Fade the source opacity from one value to another over a duration.
// onComplete is called after the fade finishes unless it is cancelled.
function fadeOpacity(fromOpacity, toOpacity, duration, onComplete) {
	stopFade();

	// Nothing to animate; just set and callback
	if (fromOpacity === toOpacity || duration <= 0) {
		setSourceOpacity(toOpacity).then(() => {
			if (onComplete) onComplete();
		}).catch(error => console.error('Error setting source opacity:', error));
		return;
	}

	const fadeSteps = Math.max(10, Math.ceil(duration * 20));
	const stepTime = (duration * 1000) / fadeSteps;
	let currentStep = 0;
	let cancelled = false;

	activeFade = { cancel: () => { cancelled = true; } };

	async function step() {
		if (cancelled) return;
		currentStep += 1;
		const t = currentStep / fadeSteps;
		const opacity = fromOpacity + (toOpacity - fromOpacity) * t;

		try {
			await setSourceOpacity(opacity);
		} catch (error) {
			console.error('Error fading source:', error);
			activeFade = null;
			return;
		}

		if (currentStep >= fadeSteps) {
			activeFade = null;
			if (onComplete && !cancelled) onComplete();
		} else {
			setTimeout(step, stepTime);
		}
	}

	setTimeout(step, stepTime);
}

// Stop any running fade
function stopFade() {
	if (activeFade && activeFade.cancel) {
		activeFade.cancel();
	}
	activeFade = null;
}

// Show timed button handler
showTimedBtn.addEventListener('click', async () => {
	if (!selectedImage || !obs.identified) return;

	stopFade();

	const displayDuration = parseFloat(displayDurationInput.value) || 3;
	const fadeDuration = parseFloat(fadeDurationInput.value) || 2;

	try {
		// If the same image is already shown, fade in from its current opacity
		const startOpacity = (selectedImage.path === currentImagePath) ? currentOpacity : 0.0;
		await setImageAndShow(selectedImage.path, startOpacity);

		// Fade in, then hold, then fade out
		fadeOpacity(startOpacity, 1.0, fadeDuration, () => {
			activeFade = { cancel: () => { /* no-op; the final timeout is managed below */ } };
			const holdTimeout = setTimeout(() => {
				fadeOpacity(1.0, 0.0, fadeDuration);
			}, displayDuration * 1000);
			activeFade.cancel = () => clearTimeout(holdTimeout);
		});

		resultDiv.innerHTML = `<p class="info">Fading in <strong>${selectedImage.name}</strong>, showing for ${displayDuration}s, then fading out over ${fadeDuration}s.</p>`;
	} catch (error) {
		console.error('Error showing timed image:', error);
		resultDiv.innerHTML = `<p class="error">Error showing image: ${error.message}</p>`;
		showAlert('error', 'OBS Error', `Failed to show image: ${error.message}`);
	}
});

// Show indefinite button handler
showIndefiniteBtn.addEventListener('click', async () => {
	if (!selectedImage || !obs.identified) return;

	stopFade();

	try {
		const fadeDuration = parseFloat(fadeDurationInput.value) || 2;

		// If the same image is already shown, fade in from its current opacity
		const startOpacity = (selectedImage.path === currentImagePath) ? currentOpacity : 0.0;
		await setImageAndShow(selectedImage.path, startOpacity);

		fadeOpacity(startOpacity, 1.0, fadeDuration);

		resultDiv.innerHTML = `<p class="info">Fading in <strong>${selectedImage.name}</strong> indefinitely.</p>`;
	} catch (error) {
		console.error('Error showing indefinite image:', error);
		resultDiv.innerHTML = `<p class="error">Error showing image: ${error.message}</p>`;
		showAlert('error', 'OBS Error', `Failed to show image: ${error.message}`);
	}
});

// Hide button handler
hideBtn.addEventListener('click', async () => {
	if (!obs.identified) return;

	stopFade();

	try {
		const fadeDuration = parseFloat(fadeDurationInput.value) || 2;
		// Fade out from whatever the current opacity is
		fadeOpacity(currentOpacity, 0.0, fadeDuration);
		resultDiv.innerHTML = '<p class="info">Image fading out and hiding.</p>';
	} catch (error) {
		console.error('Error hiding image:', error);
		resultDiv.innerHTML = `<p class="error">Error hiding image: ${error.message}</p>`;
		showAlert('error', 'OBS Error', `Failed to hide image: ${error.message}`);
	}
});

// Save settings when inputs change
displayDurationInput.addEventListener('change', saveCurrentSettings);
fadeDurationInput.addEventListener('change', saveCurrentSettings);
urlInput.addEventListener('change', saveCurrentSettings);

// Toggle light/dark mode
themeToggleBtn.addEventListener('click', () => {
	const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
	applyTheme(newTheme);
	saveCurrentSettings();
});

// Initialize
loadSettings();
