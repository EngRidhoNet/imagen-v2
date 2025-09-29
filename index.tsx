/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Modality } from '@google/genai';

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
const resolutionSelect = document.querySelector('#resolution-select') as HTMLSelectElement;
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
  resolutionSelect.disabled = disabled;
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
 * Gets the dimensions of a base64 encoded image.
 * @param base64 The base64 string of the image.
 * @param mimeType The MIME type of the image.
 * @returns A promise that resolves with the image's width and height.
 */
function getImageDimensions(base64: string, mimeType: string): Promise<{width: number, height: number}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = (err) => {
      reject(new Error('Could not load image to get dimensions.'));
    };
    img.src = `data:${mimeType};base64,${base64}`;
  });
}


/**
 * Upscales a generated image using a different model.
 * @param card The image card element containing the image and button.
 * @param originalBase64 The base64 string of the original image.
 * @param mimeType The MIME type of the original image.
 */
async function upscaleImage(card: HTMLDivElement, originalBase64: string, mimeType: string) {
  const upscaleButton = card.querySelector('button') as HTMLButtonElement;
  const upscaleSelect = card.querySelector('.upscale-select') as HTMLSelectElement;
  const upscaleFactor = parseInt(upscaleSelect.value.replace('x', ''), 10);
  const img = card.querySelector('img') as HTMLImageElement;

  // 1. Show loading state
  upscaleButton.disabled = true;
  upscaleSelect.disabled = true;
  upscaleButton.textContent = 'Upscaling...';
  img.style.opacity = '0.5';

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    showStatusError('API key is not configured.');
    upscaleButton.disabled = false;
    upscaleSelect.disabled = false;
    upscaleButton.textContent = 'Upscale';
    img.style.opacity = '1';
    return;
  }

  try {
    // 2. Get original dimensions and calculate target
    const { width, height } = await getImageDimensions(originalBase64, mimeType);
    const targetWidth = width * upscaleFactor;
    const targetHeight = height * upscaleFactor;

    // 3. Create a highly technical and strict prompt
    const upscalePrompt = `
      TASK DEFINITION: High-Resolution Image Upscaling
      MODEL: You are an image processing model. Your task is to perform a high-fidelity upscale of the provided input image.
      INPUT RESOLUTION: ${width}x${height} pixels.
      REQUIRED OUTPUT RESOLUTION: EXACTLY ${targetWidth}x${targetHeight} pixels.
      CRITICAL INSTRUCTION: The output image's dimensions MUST match the required output resolution precisely. Do not alter the aspect ratio.
      PROCESS: Analyze the input image's content, structure, and details. Regenerate the image at the target resolution, intelligently adding photorealistic details, enhancing textures, and sharpening lines. Avoid introducing artifacts. The final output must be a clean, high-resolution version of the original.
      FAILURE CONDITION: Any output that does not match the exact target resolution of ${targetWidth}x${targetHeight} is considered a failed execution of this task.
    `;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: originalBase64,
              mimeType: mimeType,
            },
          },
          {
            text: upscalePrompt,
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    let upscaledBase64: string | null = null;
    let upscaledMimeType: string | null = mimeType;

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        upscaledBase64 = part.inlineData.data;
        upscaledMimeType = part.inlineData.mimeType;
        break;
      }
    }

    if (!upscaledBase64) {
      throw new Error("Upscaling did not return an image.");
    }

    // 4. Update card with upscaled image
    const newImageUrl = `data:${upscaledMimeType};base64,${upscaledBase64}`;
    img.src = newImageUrl;
    img.style.opacity = '1';

    // 5. Replace "Upscale" controls with "Download"
    upscaleSelect.remove();
    upscaleButton.textContent = 'Download';
    upscaleButton.disabled = false;
    upscaleButton.className = 'w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors';
    upscaleButton.onclick = () => {
      const a = document.createElement('a');
      a.href = newImageUrl;
      const extension = upscaledMimeType === 'image/png' ? 'png' : 'jpeg';
      const prompt = img.alt;
      a.download = `${prompt.slice(0, 20).replace(/\s/g, '_')}_upscaled_${upscaleFactor}x.${extension}`;
      a.click();
    };

  } catch (error) {
    console.error("Upscaling failed:", error);
    upscaleButton.disabled = false;
    upscaleSelect.disabled = false;
    upscaleButton.textContent = 'Upscale Failed - Retry';
    img.style.opacity = '1';
    upscaleButton.onclick = () => upscaleImage(card, originalBase64, mimeType);
  }
}


/**
 * Creates and appends an image card to the results grid.
 * @param originalBase64 - The base64 data of the generated image.
 * @param prompt - The prompt used to generate the image.
 * @param format - The MIME type of the image.
 */
function createImageCard(originalBase64: string, prompt: string, format: string) {
  const card = document.createElement('div');
  card.className = 'image-card bg-light-card dark:bg-dark-card';

  const imageUrl = `data:${format};base64,${originalBase64}`;
  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = prompt;
  img.className = 'w-full h-auto object-cover';

  const infoContainer = document.createElement('div');
  infoContainer.className = 'p-4';
  
  const promptText = document.createElement('p');
  promptText.className = 'text-sm text-light-text-soft dark:text-dark-text-soft truncate mb-3';
  promptText.textContent = prompt;
  
  const actionContainer = document.createElement('div');
  actionContainer.className = 'flex items-center gap-2';

  const upscaleSelect = document.createElement('select');
  upscaleSelect.className = 'upscale-select bg-light-input dark:bg-dark-input border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-sm text-light-text-strong dark:text-dark-text-strong focus:ring-2 focus:ring-blue-500';
  const options = ['2x', '3x', '4x'];
  options.forEach(val => {
    const option = document.createElement('option');
    option.value = val;
    option.textContent = val;
    upscaleSelect.appendChild(option);
  });
  
  const actionButton = document.createElement('button');
  actionButton.textContent = 'Upscale';
  actionButton.className = 'flex-grow bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors';
  actionButton.onclick = () => {
    upscaleImage(card, originalBase64, format);
  };
  
  actionContainer.appendChild(upscaleSelect);
  actionContainer.appendChild(actionButton);
  infoContainer.appendChild(promptText);
  infoContainer.appendChild(actionContainer);
  card.appendChild(img);
  card.appendChild(infoContainer);
  resultsGridEl.appendChild(card);
}

/**
 * Calls the Gemini API to generate an image.
 * @param prompt - The text prompt.
 * @param apiKey - The API key.
 * @param aspectRatio - The desired aspect ratio.
 * @param resolution - The desired output pixel size.
 * @param numberOfImages - The number of images to generate.
 * @param format - The desired output MIME type.
 */
async function generateImage(prompt: string, apiKey: string, aspectRatio: string, resolution: number, numberOfImages: number, format: string) {
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

  const prompt = promptEl.value.trim();
  if (!prompt) {
    showStatusError('Please enter a prompt.');
    return;
  }

  statusEl.innerText = '';
  showLoading(true);
  setControlsDisabled(true);

  try {
    const aspectRatio = aspectRatioSelect.value;
    const resolution = parseInt(resolutionSelect.value, 10);
    const numberOfImages = parseInt(numImagesSelect.value, 10);
    const format = formatSelect.value;
    
    statusEl.innerText = `Generating images...`;
    
    await generateImage(prompt, apiKey, aspectRatio, resolution, numberOfImages, format);

    if (!history.includes(prompt)) {
      history.unshift(prompt);
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