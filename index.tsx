/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';

// --- Type Definitions ---
declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

// --- DOM Element Selection ---
const promptEl = document.querySelector('#prompt-input') as HTMLTextAreaElement;
const generateButton = document.querySelector('#generate-button') as HTMLButtonElement;
const statusEl = document.querySelector('#status') as HTMLDivElement;
const resultsGridEl = document.querySelector('#results-grid') as HTMLDivElement;
const loadingOverlayEl = document.querySelector('#loading-overlay') as HTMLDivElement;
const aspectRatioSelect = document.querySelector('#aspect-ratio-select') as HTMLSelectElement;
const numImagesSelect = document.querySelector('#num-images-select') as HTMLSelectElement;
const themeToggle = document.querySelector('#theme-toggle') as HTMLInputElement;
const historyListEl = document.querySelector('#history-list') as HTMLUListElement;

// --- State Variables ---
let history: string[] = [];

// --- Functions ---

/**
 * Opens the AI Studio API key selection dialog, or shows a fallback message.
 */
async function openApiKeyDialog() {
  if (window.aistudio?.openSelectKey) {
    await window.aistudio.openSelectKey();
  } else {
    showStatusError('API key selection is not available. Please configure the API_KEY environment variable.');
  }
}

/**
 * Displays an error message in the status element.
 * @param message The error message to display.
 * @param retry - If true, adds a "Try Again" button.
 */
function showStatusError(message: string, retry = false) {
  let content = `<span class="text-red-400">${message}</span>`;
  if (retry) {
    content += `<button id="retry-button" class="ml-4 bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-lg text-sm">Try Again</button>`;
    statusEl.innerHTML = content;
    document.querySelector('#retry-button')?.addEventListener('click', generate);
  } else {
    statusEl.innerHTML = content;
  }
}

/**
 * Disables or enables the main controls.
 * @param disabled - True to disable, false to enable.
 */
function setControlsDisabled(disabled: boolean) {
  generateButton.disabled = disabled;
  promptEl.disabled = disabled;
  aspectRatioSelect.disabled = disabled;
  numImagesSelect.disabled = disabled;
}

/**
 * Toggles the loading overlay.
 * @param show - True to show, false to hide.
 */
function showLoading(show: boolean) {
  loadingOverlayEl.classList.toggle('hidden', !show);
}

/**
 * Creates and appends an image card to the results grid.
 * @param imageUrl - The data URL of the generated image.
 * @param prompt - The prompt used to generate the image.
 */
function createImageCard(imageUrl: string, prompt: string) {
  const card = document.createElement('div');
  card.className = 'image-card bg-light-card dark:bg-dark-card';

  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = prompt;
  img.className = 'w-full h-auto object-cover';

  const infoContainer = document.createElement('div');
  infoContainer.className = 'p-4';
  
  const promptText = document.createElement('p');
  promptText.className = 'text-sm text-light-text-soft dark:text-dark-text-soft truncate mb-3';
  promptText.textContent = prompt;
  
  const downloadButton = document.createElement('button');
  downloadButton.textContent = 'Download';
  downloadButton.className = 'w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors';
  downloadButton.onclick = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `${prompt.slice(0, 20).replace(/\s/g, '_')}.jpeg`;
    a.click();
  };
  
  infoContainer.appendChild(promptText);
  infoContainer.appendChild(downloadButton);
  card.appendChild(img);
  card.appendChild(infoContainer);
  resultsGridEl.appendChild(card);
}


/**
 * Calls the Gemini API to generate an image.
 * @param prompt - The text prompt.
 * @param apiKey - The API key.
 * @param aspectRatio - The desired aspect ratio.
 * @param numberOfImages - The number of images to generate.
 */
async function generateImage(prompt: string, apiKey: string, aspectRatio: string, numberOfImages: number) {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt,
    config: {
      numberOfImages,
      aspectRatio,
      outputMimeType: 'image/jpeg',
    },
  });

  const images = response.generatedImages;
  if (images === undefined || images.length === 0) {
    throw new Error('No images were generated. The prompt may have been blocked.');
  }

  images.forEach(image => {
    const base64ImageBytes = image.image.imageBytes;
    const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
    createImageCard(imageUrl, prompt);
  });
}

/**
 * Main function to handle the generation process.
 */
async function generate() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    showStatusError('API key is not configured. Please add your API key.');
    await openApiKeyDialog();
    return;
  }

  const prompts = promptEl.value.trim().split('\n').filter(p => p.trim() !== '');
  if (prompts.length === 0) {
    showStatusError('Please enter at least one prompt.');
    return;
  }

  statusEl.innerText = '';
  // resultsGridEl.innerHTML = ''; // Uncomment to clear previous results
  showLoading(true);
  setControlsDisabled(true);

  try {
    const aspectRatio = aspectRatioSelect.value;
    const numberOfImages = parseInt(numImagesSelect.value, 10);
    
    for (const prompt of prompts) {
      statusEl.innerText = `Generating for prompt: "${prompt}"...`;
      await generateImage(prompt, apiKey, aspectRatio, numberOfImages);
    }
    
    statusEl.innerHTML = `<span class="text-green-400">All images generated successfully.</span>`;
    updateHistory(prompts);
  } catch (e) {
    console.error('Image generation failed:', e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    let userFriendlyMessage = `Error: ${errorMessage}`;
    let shouldOpenDialog = false;

    if (typeof errorMessage === 'string') {
      if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('API key not valid')) {
        userFriendlyMessage = 'Your API key is invalid. Please add a valid API key.';
        shouldOpenDialog = true;
      }
    }
    showStatusError(userFriendlyMessage, true);
    if (shouldOpenDialog) {
      await openApiKeyDialog();
    }
  } finally {
    showLoading(false);
    setControlsDisabled(false);
  }
}


// --- History Management ---
/**
 * Loads history from localStorage and renders it.
 */
function loadHistory() {
  const storedHistory = localStorage.getItem('imageGenHistory');
  if (storedHistory) {
    history = JSON.parse(storedHistory);
    renderHistory();
  }
}

/**
 * Renders the history list in the sidebar.
 */
function renderHistory() {
  historyListEl.innerHTML = '';
  history.forEach(prompt => {
    const li = document.createElement('li');
    li.textContent = prompt;
    li.className = 'text-light-text-soft dark:text-dark-text-soft hover:bg-gray-200 dark:hover:bg-gray-700';
    li.onclick = () => {
      promptEl.value = prompt;
    };
    historyListEl.prepend(li); // Show newest first
  });
}

/**
 * Updates history with new prompts and saves to localStorage.
 * @param newPrompts - An array of new prompts to add.
 */
function updateHistory(newPrompts: string[]) {
    newPrompts.forEach(p => {
        // Avoid duplicates
        if (!history.includes(p)) {
            history.push(p);
        }
    });
    // Keep history at a reasonable size
    if (history.length > 50) {
        history = history.slice(history.length - 50);
    }
    localStorage.setItem('imageGenHistory', JSON.stringify(history));
    renderHistory();
}

// --- Theme Management ---
/**
 * Applies the theme based on the toggle state and localStorage.
 */
function applyTheme() {
  const isDarkMode = themeToggle.checked;
  if (isDarkMode) {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
  }
  localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
}

/**
 * Initializes the theme based on localStorage or system preference.
 */
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
    themeToggle.checked = true;
  }
  applyTheme();
}

// --- Event Listeners ---
generateButton.addEventListener('click', generate);
themeToggle.addEventListener('change', applyTheme);

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  loadHistory();
});
