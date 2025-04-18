document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const textInput = document.getElementById('text-input');
    const wpmInput = document.getElementById('wpm');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const display = document.getElementById('rsvp-display');
    const providerSelect = document.getElementById('api-provider');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const keyStatus = document.getElementById('key-status');
    const aiPromptInput = document.getElementById('ai-prompt');
    const generateBtn = document.getElementById('generate-btn');
    const aiStatus = document.getElementById('ai-status');

    // --- State ---
    let words = [];
    let currentWordIndex = 0;
    let isReading = false;
    let timeoutId = null;
    let userApiKey = null; // Holds the currently loaded/saved key

    // Use different local storage keys per provider if desired, or one generic one
    // For simplicity here, we use one key, assuming user enters the correct one.
    const LOCAL_STORAGE_KEY = 'llm_api_key';

    // --- API Configuration (Provider Specific) ---
    const API_CONFIG = {
        openai: {
            url: 'https://api.openai.com/v1/chat/completions',
            buildHeaders: (apiKey) => ({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }),
            buildBody: (prompt) => JSON.stringify({
                model: "gpt-3.5-turbo", // Or allow model selection
                messages: [{ role: "user", content: prompt }],
                max_tokens: 500,
                temperature: 0.7
            }),
            parseResponse: (data) => data?.choices?.[0]?.message?.content,
            parseError: (errorData) => errorData?.error?.message || 'Unknown OpenAI error'
        },
        gemini: {
            // Note: Model name is part of the URL for the basic REST API
            getUrl: (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
            buildHeaders: () => ({ // Gemini REST API uses key in URL, basic headers
                'Content-Type': 'application/json',
            }),
            buildBody: (prompt) => JSON.stringify({
                // Structure specific to Gemini API
                contents: [{ parts: [{ text: prompt }] }],
                 // Optional: Add generationConfig here if needed
                 // "generationConfig": {
                 //   "temperature": 0.7,
                 //   "maxOutputTokens": 500
                 // }
            }),
            parseResponse: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text,
            parseError: (errorData) => errorData?.error?.message || 'Unknown Gemini error'
        }
        // Add configurations for other providers (Anthropic, Cohere, etc.) here
    };

    // --- API Key Handling ---
    function loadApiKey() {
        const savedKey = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedKey) {
            userApiKey = savedKey;
            apiKeyInput.value = savedKey;
            keyStatus.textContent = 'Key loaded.';
            checkCanGenerate(); // Enable generate button if key exists
        } else {
            userApiKey = null;
            keyStatus.textContent = 'No key saved.';
            checkCanGenerate();
        }
    }

    function saveApiKey() {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem(LOCAL_STORAGE_KEY, key);
            userApiKey = key;
            keyStatus.textContent = 'Key saved!';
             checkCanGenerate();
            setTimeout(() => { keyStatus.textContent = 'Key loaded.'; }, 2000);
        } else {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            userApiKey = null;
            keyStatus.textContent = 'Key cleared.';
            checkCanGenerate();
        }
    }

    // Simple check: enable generation if *any* key is entered
    function checkCanGenerate() {
         const hasKey = !!userApiKey;
         generateBtn.disabled = !hasKey;
         aiPromptInput.disabled = !hasKey;
         aiPromptInput.placeholder = hasKey ? "Enter your prompt..." : "Enter & Save API Key first...";
    }

    // --- AI Call Logic ---
    async function generateAIText(prompt) {
        const selectedProvider = providerSelect.value;
        const config = API_CONFIG[selectedProvider];

        if (!config) {
            aiStatus.textContent = 'Error: Invalid API provider selected.';
            return null;
        }
        if (!userApiKey) {
            aiStatus.textContent = 'Error: API Key is missing. Please enter and save your key.';
            return null;
        }
        if (!prompt) {
            aiStatus.textContent = 'Please enter a prompt.';
            return null;
        }

        aiStatus.textContent = `Generating text via ${selectedProvider}... Please wait.`;
        setAIControlsEnabled(false); // Disable controls during request

        let requestUrl;
        try {
            // Get URL (might depend on key for some APIs like Gemini)
             requestUrl = typeof config.getUrl === 'function' ? config.getUrl(userApiKey) : config.url;

            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: config.buildHeaders(userApiKey),
                body: config.buildBody(prompt)
            });

            if (!response.ok) {
                let errorMessage = `API request failed: ${response.status}`;
                let errorDetails = '';
                try {
                    const errorData = await response.json();
                    console.error(`${selectedProvider} API Error Response:`, errorData);
                    errorDetails = config.parseError(errorData);
                } catch (e) {
                    console.error("Failed to parse error response:", e);
                    errorDetails = await response.text(); // Get raw text if JSON fails
                }
                // Add specific checks if needed (e.g., 401 for bad key)
                if (response.status === 401) errorMessage += " (Invalid API Key?)";
                if (errorDetails) errorMessage += ` - ${errorDetails}`;
                throw new Error(errorMessage);
            }

            const data = await response.json();
            console.log(`${selectedProvider} API Success Response:`, data);
            const generatedText = config.parseResponse(data);

            if (generatedText !== null && generatedText !== undefined) {
                 aiStatus.textContent = 'Text generated successfully!';
                return generatedText.trim();
            } else {
                console.error("Could not extract text from response:", data);
                throw new Error(`Invalid response structure from ${selectedProvider} API.`);
            }

        } catch (error) {
            console.error(`Error fetching AI text from ${selectedProvider}:`, error);
            aiStatus.textContent = `Error (${selectedProvider}): ${error.message}`;
            return null;
        } finally {
             setAIControlsEnabled(true); // Re-enable controls
             // Optional: clear status after a delay
             setTimeout(() => {
                if (aiStatus.textContent.startsWith('Error') || aiStatus.textContent.startsWith('Text generated')) {
                     aiStatus.textContent = '';
                }
             }, 6000);
        }
    }

    function setAIControlsEnabled(enabled) {
        generateBtn.disabled = !enabled || !userApiKey; // Also check key
        aiPromptInput.disabled = !enabled || !userApiKey;
        apiKeyInput.disabled = !enabled;
        saveKeyBtn.disabled = !enabled;
        providerSelect.disabled = !enabled;

        // Also disable RSVP controls if AI is busy
        if (isReading) return; // Don't override if RSVP is running
        startBtn.disabled = !enabled;
        textInput.disabled = !enabled;
        wpmInput.disabled = !enabled;
    }


    // --- Existing RSVP Functions (Keep as they were, but check interactions) ---
    function getORPIndex(word) { /* ... no changes ... */
        const len = word.length; if (len <= 1) return 0; if (len <= 3) return 1; if (len <= 5) return 2; if (len <= 9) return 3; return 4;
    }
    function calculateDelay(word, wpm) { /* ... no changes ... */
        const baseDelay = (60 / wpm) * 1000; let extraDelay = 0; if (word.length > 6) extraDelay += baseDelay * 0.3; if (word.length > 10) extraDelay += baseDelay * 0.2; const lastChar = word.slice(-1); if (['.', ',', ';', ':', '!', '?'].includes(lastChar)) { extraDelay += baseDelay * 0.5; } return baseDelay + extraDelay;
    }
    function displayNextWord() { /* ... no changes ... */
        if (!isReading || currentWordIndex >= words.length) { stopReading(); display.innerHTML = "Finished!"; return; } const word = words[currentWordIndex]; if (!word) { currentWordIndex++; displayNextWord(); return; } const orpIndex = getORPIndex(word); const wpm = parseInt(wpmInput.value, 10) || 300; const delay = calculateDelay(word, wpm); const before = word.substring(0, orpIndex); const orpLetter = word.substring(orpIndex, orpIndex + 1); const after = word.substring(orpIndex + 1); display.innerHTML = `${before}<span class="orp-letter">${orpLetter}</span>${after}`; currentWordIndex++; timeoutId = setTimeout(displayNextWord, delay);
    }
    function startReading() { /* Disable AI controls during read */
        if (isReading) return;
        const text = textInput.value.trim();
        if (!text) { display.innerHTML = "Enter or generate text first."; return; }
        stopReading();
        words = text.split(/\s+/);
        currentWordIndex = 0;
        isReading = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        textInput.disabled = true;
        wpmInput.disabled = true;
        setAIControlsEnabled(false); // Disable all AI controls

        clearTimeout(timeoutId);
        display.innerHTML = "";
        displayNextWord();
    }
    function stopReading() { /* Re-enable AI controls after stopping */
        const wasReading = isReading;
        isReading = false;
        clearTimeout(timeoutId);
        timeoutId = null;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        textInput.disabled = false;
        wpmInput.disabled = false;
         if (wasReading) { // Only re-enable AI controls if we were actually reading
            setAIControlsEnabled(true);
         }
        // display.innerHTML = "Stopped.";
    }

    // --- Event Listeners ---
    providerSelect.addEventListener('change', () => {
        // Optional: Clear key status or update placeholder if provider changes?
        apiKeyInput.placeholder = `Enter API Key for ${providerSelect.options[providerSelect.selectedIndex].text}`;
        // Re-check button states based on current key and new provider
        checkCanGenerate();
    });
    saveKeyBtn.addEventListener('click', saveApiKey);
    apiKeyInput.addEventListener('input', () => {
        // Give visual feedback immediately if typing might enable button
         checkCanGenerate();
    });
    generateBtn.addEventListener('click', async () => {
        const prompt = aiPromptInput.value;
        const generatedText = await generateAIText(prompt);
        if (generatedText) {
            textInput.value = generatedText;
        }
    });
    startBtn.addEventListener('click', startReading);
    stopBtn.addEventListener('click', stopReading);

    // --- Initialization ---
    loadApiKey(); // Load key first
    checkCanGenerate(); // Set initial state of generate button/prompt
    stopBtn.disabled = true;

});