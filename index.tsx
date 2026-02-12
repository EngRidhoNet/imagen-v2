
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
    hasSelectedApiKey: () => Promise<boolean>;
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
const sizeSelect = document.querySelector('#size-select') as HTMLSelectElement;
const themeToggle = document.querySelector('#theme-toggle') as HTMLInputElement;
const historyListEl = document.querySelector('#history-list') as HTMLUListElement;
const keySetupOverlayEl = document.querySelector('#key-setup-overlay') as HTMLDivElement;
const selectKeyBtn = document.querySelector('#select-key-button') as HTMLButtonElement;
const reselectKeyBtn = document.querySelector('#reselect-key-button') as HTMLButtonElement;
const closeKeyOverlayBtn = document.querySelector('#close-key-overlay') as HTMLButtonElement;

// --- State Variables ---
let history: string[] = [];

// --- Functions ---

/**
 * Triggers the API key selection dialog.
 */
async function handleKeySelection() {
  if (window.aistudio?.openSelectKey) {
    await window.aistudio.openSelectKey();
    keySetupOverlayEl.classList.add('hidden');
    showStatusError('API Key updated. Please try generating again.', false, 'bg-green-100 border-green-400 text-green-700');
  }
}

/**
 * Displays a status message.
 */
function showStatusError(message: string, retry = false, customClasses = 'bg-red-100 border-red-400 text-red-700') {
  let content = `<div class="${customClasses} border px-4 py-3 rounded-xl relative shadow-sm mb-4 transition-all animate-in fade-in slide-in-from-top-2" role="alert">
    <strong class="font-bold">Notice:</strong>
    <span class="block sm:inline">${message}</span>`;
  
  if (message.includes('403') || message.includes('permission')) {
    content += `<button id="fix-permission-button" class="mt-3 bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 font-bold py-2 px-4 rounded-lg text-sm block transition-all">Select a Valid API Key</button>`;
  } else if (retry) {
    content += `<button id="retry-button" class="mt-3 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm block transition-all">Try Again</button>`;
  }
  
  content += `</div>`;
  statusEl.innerHTML = content;
  
  document.querySelector('#fix-permission-button')?.addEventListener('click', () => {
    keySetupOverlayEl.classList.remove('hidden');
  });
  
  if (retry) {
    document.querySelector('#retry-button')?.addEventListener('click', generate);
  }
}

/**
 * Disables or enables the main controls.
 */
function setControlsDisabled(disabled: boolean) {
  generateButton.disabled = disabled;
  promptEl.disabled = disabled;
  aspectRatioSelect.disabled = disabled;
  qualitySelect.disabled = disabled;
  sizeSelect.disabled = disabled;
}

/**
 * Toggles the loading overlay.
 */
function showLoading(show: boolean) {
  loadingOverlayEl.classList.toggle('hidden', !show);
}

/**
 * Creates and appends an image card to the results grid.
 */
function createImageCard(base64: string, prompt: string) {
  const card = document.createElement('div');
  card.className = 'image-card bg-light-card dark:bg-dark-card group';

  const imageUrl = `data:image/png;base64,${base64}`;
  const imgContainer = document.createElement('div');
  imgContainer.className = 'relative overflow-hidden aspect-square';
  
  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = prompt;
  img.className = 'w-full h-full object-cover cursor-zoom-in group-hover:scale-105 transition-transform duration-700';
  img.onclick = () => window.open(imageUrl, '_blank');

  const overlay = document.createElement('div');
  overlay.className = 'absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center';
  const zoomIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
  overlay.innerHTML = zoomIcon;
  imgContainer.appendChild(img);
  imgContainer.appendChild(overlay);

  const infoContainer = document.createElement('div');
  infoContainer.className = 'p-5';
  
  const promptText = document.createElement('p');
  promptText.className = 'text-sm text-light-text-soft dark:text-dark-text-soft line-clamp-2 mb-4 h-10';
  promptText.textContent = prompt;
  
  const downloadButton = document.createElement('button');
  downloadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Save to Device`;
  downloadButton.className = 'w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md active:scale-[0.98]';
  downloadButton.onclick = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `gemini_${Date.now()}.png`;
    a.click();
  };
  
  infoContainer.appendChild(promptText);
  infoContainer.appendChild(downloadButton);
  card.appendChild(imgContainer);
  card.appendChild(infoContainer);
  resultsGridEl.prepend(card); // Show newest first
}

/**
 * Calls the Gemini API to generate an image.
 */
async function generateImage(prompt: string, quality: string, aspectRatio: string, imageSize: string) {
  // Always create a fresh instance to catch the most recent environment/selected key
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = quality === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  const response = await ai.models.generateContent({
    model: modelName,
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any,
        ...(quality === 'pro' ? { imageSize: imageSize as any } : {})
      }
    }
  });

  if (!response.candidates?.[0]?.content?.parts) {
    throw new Error('No valid response parts received.');
  }

  let foundImage = false;
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      createImageCard(part.inlineData.data, prompt);
      foundImage = true;
    }
  }

  if (!foundImage) {
    throw new Error('Image generation blocked. Try rephrasing your prompt.');
  }
}

/**
 * Main function to handle the generation process.
 */
async function generate() {
  const userPrompt = promptEl.value.trim();
  if (!userPrompt) {
    showStatusError('Please describe the image you want to create.');
    return;
  }

  statusEl.innerHTML = '';
  showLoading(true);
  setControlsDisabled(true);

  try {
    const quality = qualitySelect.value;
    const aspectRatio = aspectRatioSelect.value;
    const imageSize = sizeSelect.value;
    
    await generateImage(userPrompt, quality, aspectRatio, imageSize);

    if (!history.includes(userPrompt)) {
      history.unshift(userPrompt);
      if (history.length > 50) history.pop();
      saveHistory();
      renderHistory();
    }
  } catch (error: any) {
    console.error(error);
    const errorMessage = error.message || 'Unknown error occurred.';
    
    if (errorMessage.includes("403") || errorMessage.includes("permission")) {
      showStatusError('Permission Denied (403). Your current API key might not have access to this model. Please select a valid key via settings.');
    } else if (errorMessage.includes("Requested entity was not found")) {
      showStatusError('Project not found. You may need to select a project with billing enabled.');
    } else {
      showStatusError(`Failed: ${errorMessage}`, true);
    }
  } finally {
    showLoading(false);
    setControlsDisabled(false);
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
    li.textContent = 'No previous generations';
    li.className = 'text-xs text-light-text-soft dark:text-dark-text-soft italic text-center py-8 opacity-50';
    historyListEl.appendChild(li);
    return;
  }
  history.forEach(prompt => {
    const li = document.createElement('li');
    li.textContent = prompt;
    li.className = 'text-light-text-soft dark:text-dark-text-soft hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all cursor-pointer rounded-xl p-3 border border-transparent hover:border-blue-200 dark:hover:border-blue-800 line-clamp-2 text-sm';
    li.onclick = () => {
      promptEl.value = prompt;
      generate();
    };
    historyListEl.appendChild(li);
  });
}

/**
 * Updates the size select visibility based on quality.
 */
function updateQualitySettings() {
  const isPro = qualitySelect.value === 'pro';
  const sizeContainer = sizeSelect.parentElement;
  if (sizeContainer) {
    sizeContainer.classList.toggle('opacity-50', !isPro);
    sizeSelect.disabled = !isPro;
  }
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

  qualitySelect.addEventListener('change', updateQualitySettings);

  selectKeyBtn.addEventListener('click', handleKeySelection);
  reselectKeyBtn.addEventListener('click', () => keySetupOverlayEl.classList.remove('hidden'));
  closeKeyOverlayBtn.addEventListener('click', () => keySetupOverlayEl.classList.add('hidden'));

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
updateQualitySettings();
