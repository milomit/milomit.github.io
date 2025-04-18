document.addEventListener('DOMContentLoaded', () => {
    // --- RSVP Elements ---
    const textInput = document.getElementById('text-input');
    const wpmInput = document.getElementById('wpm');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const display = document.getElementById('rsvp-display');

    // --- AI Interaction Elements ---
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const keyStatus = document.getElementById('key-status');
    const aiPromptInput = document.getElementById('ai-prompt');
    const generateBtn = document.getElementById('generate-btn');
    const aiStatus = document.getElementById('ai-status');

    // --- RSVP State ---
    let words = [];
    let currentWordIndex = 0;
    let isReading = false;
    let timeoutId = null;

    // --- OpenAI API Configuration ---
    const API_URL = 'https://api.openai.com/v1/chat/completions';
    const LOCAL_STORAGE_KEY = 'openai_api_key';

    // --- API Key Handling ---
    let userApiKey = null;

    function loadApiKey() {
        const savedKey = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedKey) {
            userApiKey = savedKey;
            apiKeyInput.value = savedKey; // Show the key in the input (masked)
            keyStatus.textContent = 'Key loaded from storage.';
            validateKeyFormat(savedKey); // Enable/disable generate button
        } else {
            keyStatus.textContent = 'No key saved.';
            validateKeyFormat(null);
        }
    }

    function saveApiKey() {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem(LOCAL_STORAGE_KEY, key);
            userApiKey = key;
            keyStatus.textContent = 'Key saved!';
             validateKeyFormat(key);
            setTimeout(() => { keyStatus.textContent = 'Key loaded from storage.'; }, 2000);
        } else {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            userApiKey = null;
            keyStatus.textContent = 'Key cleared.';
            validateKeyFormat(null);
        }
    }

    function validateKeyFormat(key) {
        // Basic check - OpenAI keys usually start with 'sk-' and have significant length
        if (key && key.startsWith('sk-') && key.length > 40) {
            generateBtn.disabled = false;
            aiPromptInput.disabled = false;
            aiPromptInput.placeholder = "Enter your prompt...";
        } else {
            generateBtn.disabled = true;
            aiPromptInput.disabled = true;
            aiPromptInput.placeholder = "Enter & Save API Key first...";
             if (key && key.length > 0) { // Only show format warning if something is entered
                keyStatus.textContent = 'Invalid key format?';
             }
        }
    }

    // --- AI Functions ---
    async function generateAIText(prompt) {
        if (!userApiKey) {
            aiStatus.textContent = 'Error: OpenAI API Key is missing. Please enter and save your key.';
            return null;
        }
        if (!prompt) {
            aiStatus.textContent = 'Please enter a prompt.';
            return null;
        }

        aiStatus.textContent = 'Generating text... Please wait.';
        generateBtn.disabled = true; // Disable while generating
        aiPromptInput.disabled = true;
        saveKeyBtn.disabled = true; // Also disable save button during generation

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userApiKey}` // Use the user's key
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: [ { role: "user", content: prompt } ],
                    max_tokens: 500,
                    temperature: 0.7
                })
            });

            // Reset UI elements regardless of success/failure *before* potentially throwing
            generateBtn.disabled = false;
            aiPromptInput.disabled = false;
            saveKeyBtn.disabled = false;
            validateKeyFormat(userApiKey); // Re-validate to ensure button state is correct

            if (!response.ok) {
                const errorData = await response.json();
                console.error('OpenAI API Error:', errorData);
                let errorMessage = `API request failed: ${response.status}`;
                if (response.status === 401) {
                    errorMessage += " (Invalid API Key?)";
                } else if (errorData.error?.message) {
                    errorMessage += ` - ${errorData.error.message}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();

            if (data.choices?.[0]?.message?.content) {
                 aiStatus.textContent = 'Text generated successfully!';
                return data.choices[0].message.content.trim();
            } else {
                throw new Error('Invalid response structure from API.');
            }

        } catch (error) {
            console.error('Error fetching AI text:', error);
            aiStatus.textContent = `Error: ${error.message}`;
            // Ensure UI is re-enabled even after error
            generateBtn.disabled = false;
            aiPromptInput.disabled = false;
            saveKeyBtn.disabled = false;
            validateKeyFormat(userApiKey);
            return null;
        } finally {
             // Optional: clear status after a delay
            setTimeout(() => {
                if (aiStatus.textContent.startsWith('Error:') || aiStatus.textContent.startsWith('Text generated')) {
                     aiStatus.textContent = '';
                }
            }, 5000);
        }
    }

    // --- Existing RSVP Functions (Keep these as they were) ---
    function getORPIndex(word) { /* ... no changes ... */
        const len = word.length;
        if (len <= 1) return 0;
        if (len <= 3) return 1;
        if (len <= 5) return 2;
        if (len <= 9) return 3;
        return 4;
     }
    function calculateDelay(word, wpm) { /* ... no changes ... */
        const baseDelay = (60 / wpm) * 1000;
        let extraDelay = 0;
        if (word.length > 6) extraDelay += baseDelay * 0.3;
        if (word.length > 10) extraDelay += baseDelay * 0.2;
        const lastChar = word.slice(-1);
        if (['.', ',', ';', ':', '!', '?'].includes(lastChar)) {
            extraDelay += baseDelay * 0.5;
        }
        return baseDelay + extraDelay;
    }
    function displayNextWord() { /* ... no changes ... */
        if (!isReading || currentWordIndex >= words.length) {
            stopReading();
            display.innerHTML = "Finished!";
            return;
        }
        const word = words[currentWordIndex];
        if (!word) {
            currentWordIndex++;
            displayNextWord();
            return;
        }
        const orpIndex = getORPIndex(word);
        const wpm = parseInt(wpmInput.value, 10) || 300;
        const delay = calculateDelay(word, wpm);
        const before = word.substring(0, orpIndex);
        const orpLetter = word.substring(orpIndex, orpIndex + 1);
        const after = word.substring(orpIndex + 1);
        display.innerHTML = `${before}<span class="orp-letter">${orpLetter}</span>${after}`;
        currentWordIndex++;
        timeoutId = setTimeout(displayNextWord, delay);
     }
    function startReading() { /* ... Modify slightly to disable API key input during read ... */
        if (isReading) return;
        const text = textInput.value.trim();
        if (!text) {
            display.innerHTML = "Enter or generate text first.";
            return;
        }
        stopReading(); // Ensure any previous state is cleared cleanly
        words = text.split(/\s+/);
        currentWordIndex = 0;
        isReading = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        textInput.disabled = true;
        wpmInput.disabled = true;
        aiPromptInput.disabled = true; // Disable AI while reading
        generateBtn.disabled = true; // Disable AI while reading
        apiKeyInput.disabled = true;  // Disable key input
        saveKeyBtn.disabled = true;   // Disable save button

        clearTimeout(timeoutId);
        display.innerHTML = "";
        displayNextWord();
    }
    function stopReading() { /* ... Modify slightly to re-enable API key input ... */
        isReading = false;
        clearTimeout(timeoutId);
        timeoutId = null;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        textInput.disabled = false;
        wpmInput.disabled = false;
        apiKeyInput.disabled = false; // Re-enable key input
        saveKeyBtn.disabled = false;  // Re-enable save button
        // Re-enable AI controls *only if* a valid key is present
        validateKeyFormat(userApiKey);
        // display.innerHTML = "Stopped."; // Optional clear
    }

    // --- Event Listeners ---

    // API Key Handling
    saveKeyBtn.addEventListener('click', saveApiKey);
    // Optional: Validate format as user types
    apiKeyInput.addEventListener('input', () => validateKeyFormat(apiKeyInput.value.trim()));

    // AI Generate Button
    generateBtn.addEventListener('click', async () => {
        const prompt = aiPromptInput.value;
        const generatedText = await generateAIText(prompt);
        if (generatedText) {
            textInput.value = generatedText;
        }
    });

    // RSVP Buttons
    startBtn.addEventListener('click', startReading);
    stopBtn.addEventListener('click', stopReading);

    // --- Initialization ---
    loadApiKey(); // Load saved key on page load
    stopBtn.disabled = true; // Initial state for RSVP button

});