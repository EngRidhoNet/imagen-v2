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
const qualitySelect = document.querySelector('#quality-select') as HTMLSelectElement;
const numImagesSelect = document.querySelector('#num-images-select') as HTMLSelectElement;
const formatSelect = document.querySelector('#format-select') as HTMLSelectElement;
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
  qualitySelect.disabled = disabled;
  numImagesSelect.disabled = disabled;
  formatSelect.disabled = disabled;
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
 * @param base64 - The base64 data of the generated image.
 * @param prompt - The prompt used to generate the image.
 * @param format - The MIME type of the image.
 */
function createImageCard(base64: string, prompt: string, format: string) {
  const card = document.createElement('div');
  card.className = 'image-card bg-light-card dark:bg-dark-card';

  const imageUrl = `data:${format};base64,${base64}`;
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
    const extension = format === 'image/png' ? 'png' : 'jpeg';
    a.download = `${prompt.slice(0, 30).replace(/\s/g, '_')}.${extension}`;
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
 * @param format - The desired output MIME type.
 */
async function generateImage(prompt: string, apiKey: string, aspectRatio: string, numberOfImages: number, format: string) {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt,
    config: {
      numberOfImages,
      aspectRatio,
      outputMimeType: format,
    },
  });

  const images = response.generatedImages;
  if (images === undefined || images.length === 0) {
    throw new Error('No images were generated. The prompt may have been blocked.');
  }

  images.forEach(image => {
    const base64ImageBytes = image.image.imageBytes;
    createImageCard(base64ImageBytes, prompt, format);
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

  const userPrompt = promptEl.value.trim();
  if (!userPrompt) {
    showStatusError('Please enter a prompt.');
    return;
  }

  statusEl.innerText = '';
  showLoading(true);
  setControlsDisabled(true);
  resultsGridEl.innerHTML = ''; // Clear previous results

  try {
    const aspectRatio = aspectRatioSelect.value;
    const quality = qualitySelect.value;
    const numberOfImages = parseInt(numImagesSelect.value, 10);
    const format = formatSelect.value;
    
    let finalPrompt = userPrompt;
    if (quality === 'high') {
      finalPrompt += ', 8k, photorealistic, ultra high detail, sharp focus, professional photography';
    }

    statusEl.innerText = `Generating images...`;
    
    await generateImage(finalPrompt, apiKey, aspectRatio, numberOfImages, format);

    if (!history.includes(userPrompt)) {
      history.unshift(userPrompt);
      if (history.length > 50) history.pop();
      saveHistory();
      renderHistory();
    }
  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    showStatusError(`Generation failed: ${errorMessage}`, true);
  } finally {
    showLoading(false);
    setControlsDisabled(false);
    statusEl.innerText = '';
  }
}


/**
 * Loads history from local storage.
 */
function loadHistory() {
  const storedHistory = localStorage.getItem('image-gen-history');
  if (storedHistory) {
    history = JSON.parse(storedHistory);
  }
}

/**
 * Saves history to local storage.
 */
function saveHistory() {
  localStorage.setItem('image-gen-history', JSON.stringify(history));
}

/**
 * Renders the history list in the sidebar.
 */
function renderHistory() {
  historyListEl.innerHTML = '';
  if (history.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No history yet.';
    li.className = 'text-sm text-light-text-soft dark:text-dark-text-soft italic';
    historyListEl.appendChild(li);
    return;
  }
  history.forEach(prompt => {
    const li = document.createElement('li');
    li.textContent = prompt;
    li.className = 'text-light-text-soft dark:text-dark-text-soft hover:bg-light-input dark:hover:bg-dark-input';
    li.onclick = () => {
      promptEl.value = prompt;
      resultsGridEl.innerHTML = ''; // Clear results when clicking history
      generate();
    };
    historyListEl.appendChild(li);
  });
}

/**
 * Sets up all the event listeners for the application.
 */
function setupEventListeners() {
  generateButton.addEventListener('click', generate);
  promptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      generate();
    }
  });

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const savedTheme = localStorage.getItem('theme');

  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.body.classList.add('dark');
    themeToggle.checked = true;
  }

  themeToggle.addEventListener('change', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  });
}

// --- Initialization ---
loadHistory();
renderHistory();
setupEventListeners();