// script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const apiKeyInput = document.getElementById('apiKey');
    const promptInput = document.getElementById('prompt');
    const submitBtn = document.getElementById('submitBtn');
    const statusMsg = document.getElementById('status');
    const wpmSlider = document.getElementById('wpmSlider');
    const wpmValueSpan = document.getElementById('wpmValue');
    const rsvpDisplay = document.getElementById('rsvp-display');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const fullTextOutputDiv = document.getElementById('full-text-output');
    const fullTextPre = fullTextOutputDiv.querySelector('pre');
    const themeToggleBtn = document.getElementById('themeToggle');

    // --- State Variables ---
    let words = []; // Stores { text: string, start: int, end: int, index: int }
    let currentWordIndex = -1; // Index of the word currently focused/playing
    let isPlaying = false;
    let rsvpIntervalId = null; // Stores the timeout ID for the RSVP loop
    let currentWpm = parseInt(wpmSlider.value, 10);
    let currentApiKey = '';
    let fullText = ''; // Stores the raw response text
    let previousHighlightElement = null; // Stores the DOM element of the previously highlighted word span

    // --- Event Listeners ---
    submitBtn.addEventListener('click', handleSubmit);
    wpmSlider.addEventListener('input', handleSliderChange);
    playPauseBtn.addEventListener('click', togglePlayPause);
    stopBtn.addEventListener('click', stopRsvp);
    themeToggleBtn.addEventListener('click', toggleTheme);
    // Event delegation for clicks on words within the full text area
    fullTextPre.addEventListener('click', handleFullTextClick);

    // --- Initialization ---
    initializeTheme(); // Set theme based on localStorage or system preference
    wpmValueSpan.textContent = currentWpm;
    updateControlStates(); // Initial button states
    displayWord(null); // Show initial placeholder in RSVP display

    // --- Theme Functions ---
    function setLightTheme() {
        document.body.classList.remove('dark-mode');
        themeToggleBtn.textContent = '🌙';
        themeToggleBtn.setAttribute('aria-label', 'Switch to dark mode');
        localStorage.setItem('theme', 'light');
    }

    function setDarkTheme() {
        document.body.classList.add('dark-mode');
        themeToggleBtn.textContent = '☀️';
        themeToggleBtn.setAttribute('aria-label', 'Switch to light mode');
        localStorage.setItem('theme', 'dark');
    }

    function initializeTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            setDarkTheme();
        } else {
            setLightTheme();
        }
    }

    function toggleTheme() {
        if (document.body.classList.contains('dark-mode')) {
            setLightTheme();
        } else {
            setDarkTheme();
        }
    }

    // --- Core RSVP & API Functions ---

    /** Handles changes to the WPM slider */
    function handleSliderChange() {
        currentWpm = parseInt(wpmSlider.value, 10);
        wpmValueSpan.textContent = currentWpm;
        // If playing, the next delay calculation will use the new WPM
    }

    /** Handles the click on the 'Generate & Read' button */
    async function handleSubmit() {
        currentApiKey = apiKeyInput.value.trim();
        const prompt = promptInput.value.trim();

        if (!currentApiKey || !prompt) {
            showStatus("Please enter both API Key and Prompt.", true);
            return;
        }

        resetStateBeforeApiCall(); // Clear previous state and UI elements

        try {
            const responseText = await callGoogleAI(prompt, currentApiKey);

            if (responseText !== null && responseText.trim().length > 0) {
                fullText = responseText;
                words = preprocessText(fullText); // Process text into word objects

                if (words.length > 0) {
                    renderFullTextWithSpans(fullText, words); // Display text with clickable spans
                    fullTextOutputDiv.style.display = 'block';
                    currentWordIndex = 0; // Ready to start from the beginning
                    isPlaying = false;
                    showStatus(`Response received (${words.length} words). Press Play.`, false);
                    displayWord(words[currentWordIndex]); // Show first word & highlight it
                } else {
                    showStatus("LLM response processed, but no words found.", true);
                    fullTextPre.textContent = fullText; // Show raw text if parsing failed
                    fullTextOutputDiv.style.display = 'block';
                }
            } else if (responseText === '') { // Explicitly check for empty string response
                 showStatus("Received an empty response from the LLM.", true);
                 fullTextPre.textContent = "-- Empty Response --";
                 fullTextOutputDiv.style.display = 'block';
            }
            // Error status is set within callGoogleAI if responseText is null (API error)
        } catch (error) {
            console.error("Error during generation process:", error);
            showStatus(`Processing error: ${error.message}`, true);
        } finally {
            submitBtn.disabled = false; // Re-enable submit button
            updateControlStates(); // Update play/stop button states
        }
    }

    /** Resets state variables and UI elements before a new API call */
     function resetStateBeforeApiCall() {
        stopRsvp(); // Stop any ongoing RSVP, clear interval, reset index, remove highlights
        showStatus("Generating response...", false, true); // Show loading state
        submitBtn.disabled = true; // Disable buttons during generation
        playPauseBtn.disabled = true;
        stopBtn.disabled = true;
        wpmSlider.disabled = true; // Disable slider too
        fullTextOutputDiv.style.display = 'none'; // Hide old text output
        fullTextPre.innerHTML = ''; // Clear content
        words = []; // Clear word data
        fullText = '';
        currentWordIndex = -1; // Reset index
        previousHighlightElement = null; // Clear highlight tracker
        displayWord(null); // Clear RSVP display to placeholder
    }

    /** Calls the Google AI Gemini API */
    async function callGoogleAI(prompt, apiKey) {
        const API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }],
             // Optional safety settings can be added here
             // safetySettings: [ { category: "HARM_CATEGORY_...", threshold: "BLOCK_..." } ]
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                let errorData = null;
                let errorMsg = `API Error: ${response.status}`;
                try {
                    errorData = await response.json();
                    if (errorData.error?.message) {
                         errorMsg += ` - ${errorData.error.message}`;
                         if (response.status === 400 && errorData.error.message.toLowerCase().includes('api key not valid')) {
                              errorMsg = "API Key not valid. Please check your key and ensure it's enabled for the Generative Language API.";
                         } else if (response.status === 404) {
                              errorMsg = `Model/API version mismatch (Error 404). Ensure API key is correct and the model 'gemini-1.0-pro' is available via the v1 endpoint. Details: ${errorData.error.message}`;
                         } else if (response.status === 429) {
                             errorMsg = "Rate limit exceeded. Please wait and try again. (Error 429)";
                         }
                    }
                } catch (e) { errorMsg += ` (${response.statusText || 'Network error'})`; }
                 console.error("API Response Error Data:", errorData);
                 throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.candidates && data.candidates.length > 0) {
                const candidate = data.candidates[0];
                // Check for finish reason first (e.g., SAFETY)
                if (candidate.finishReason && candidate.finishReason !== "STOP" && candidate.finishReason !== "MAX_TOKENS") {
                    throw new Error(`Generation stopped: ${candidate.finishReason}. ${candidate.safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ') || ''}`);
                }
                // Then extract text
                if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                    return candidate.content.parts[0].text;
                }
            }
             // Handle prompt blocking
             if (data.promptFeedback?.blockReason) {
                  throw new Error(`Prompt blocked: ${data.promptFeedback.blockReason}`);
             }

            // If no text found for other reasons
            console.warn("Unexpected successful API response structure:", data);
            return ""; // Return empty string if no content but no explicit error/block

        } catch (error) {
            console.error("Google AI API call failed:", error);
            showStatus(`Error: ${error.message}`, true);
            return null; // Indicate API call failure
        }
    }

    /** Parses text into word objects with positional info */
    function preprocessText(text) {
        const wordObjects = [];
        const regex = /\S+/g; // Match sequences of non-whitespace characters
        let match;
        let index = 0;
        while ((match = regex.exec(text)) !== null) {
            wordObjects.push({
                text: match[0],
                start: match.index,
                end: match.index + match[0].length,
                index: index++
            });
        }
        return wordObjects;
    }

    /** Renders the full text with words wrapped in clickable spans */
    function renderFullTextWithSpans(fullText, wordObjects) {
        let htmlContent = '';
        let lastIndex = 0;
        wordObjects.forEach(word => {
            htmlContent += escapeHtml(fullText.substring(lastIndex, word.start)); // Whitespace
            htmlContent += `<span class="word" data-word-index="${word.index}">${escapeHtml(word.text)}</span>`; // Word span
            lastIndex = word.end;
        });
        htmlContent += escapeHtml(fullText.substring(lastIndex)); // Trailing text/whitespace
        fullTextPre.innerHTML = htmlContent;
    }

    /** Escapes HTML special characters */
    function escapeHtml(unsafe) {
        if (!unsafe) return "";
        return unsafe
             .replace(/&/g, "&")
             .replace(/</g, "<")
             .replace(/>/g, ">")
             .replace(/"/g, """)
             .replace(/'/g, "'");
     }

    /** Handles clicks within the full text area to navigate RSVP */
    function handleFullTextClick(event) {
        const target = event.target;
        if (target && target.matches('span.word[data-word-index]')) {
            const wordIndex = parseInt(target.getAttribute('data-word-index'), 10);
            if (!isNaN(wordIndex) && wordIndex >= 0 && wordIndex < words.length) {
                const wasPlaying = isPlaying; // Check if it was playing before stopping
                stopRsvp(); // Stop playback, clear interval, remove highlight
                currentWordIndex = wordIndex; // Set the new index
                displayWord(words[currentWordIndex]); // Show the clicked word & highlight it
                if (wasPlaying) {
                    // Optionally auto-resume or just update status
                    showStatus(`Navigated to word ${currentWordIndex + 1}. Press Play to resume.`, false);
                }
                updateControlStates(); // Ensure button states are correct
            }
        }
    }

    /** Toggles between playing and pausing the RSVP display */
    function togglePlayPause() {
        if (!words.length || currentWordIndex < 0 || currentWordIndex >= words.length) {
            // If at end, restart from beginning on Play click
             if (words.length > 0 && currentWordIndex >= words.length) {
                 currentWordIndex = 0;
             } else {
                 return; // Do nothing if no words or invalid index
             }
        }

        isPlaying = !isPlaying;
        playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';

        if (isPlaying) {
            displayWord(words[currentWordIndex]); // Ensure current word is shown/highlighted
            startRsvpLoop(); // Start the timer loop
        } else {
            clearTimeout(rsvpIntervalId); // Stop the timer
            rsvpIntervalId = null;
            // Highlight remains on the paused word
        }
        updateControlStates();
    }

    /** Stops RSVP playback, resets to the beginning */
    function stopRsvp() {
        isPlaying = false;
        clearTimeout(rsvpIntervalId);
        rsvpIntervalId = null;
        playPauseBtn.textContent = 'Play';
        removeHighlight(); // Remove highlight from full text

        if (words.length > 0) {
            currentWordIndex = 0; // Reset to first word
            displayWord(words[currentWordIndex]); // Show first word in RSVP (no highlight needed immediately)
            // Remove highlight *after* displaying the word (which might re-add it)
            removeHighlight();
        } else {
            currentWordIndex = -1;
            displayWord(null); // Show placeholder
        }
        updateControlStates();
    }

    /** Main loop for displaying words sequentially */
    function startRsvpLoop() {
        if (!isPlaying || currentWordIndex < 0 || currentWordIndex >= words.length) {
            // End of playback condition
            if (isPlaying && currentWordIndex >= words.length && words.length > 0) {
                isPlaying = false;
                playPauseBtn.textContent = 'Play';
                showStatus("RSVP finished.", false);
                // Decide whether to keep last word highlighted or remove
                // removeHighlight(); // Uncomment to clear highlight at the end
            }
            updateControlStates();
            return; // Exit loop
        }

        const wordObject = words[currentWordIndex];
        displayWord(wordObject); // Display word and update highlight

        const delay = calculateDelay(wordObject.text, currentWpm);

        // Set timeout for the *next* word
        rsvpIntervalId = setTimeout(() => {
            currentWordIndex++; // Move to next word index
            startRsvpLoop(); // Continue loop
        }, delay);
    }

    /** Calculates display duration based on WPM and word characteristics */
    function calculateDelay(word, wpm) {
        const baseDelayMs = 60000 / wpm;
        let multiplier = 1.0;
        const len = word.length;

        if (len > 6) multiplier += 0.3;
        if (len > 10) multiplier += 0.4;
        if (len < 4) multiplier -= 0.1;

        const lastChar = word[len - 1];
        if (/[.!?,;:]/.test(lastChar)) {
            multiplier += 0.6;
            if (/[.!?]/.test(lastChar)) multiplier += 0.4;
        } else if (len > 1 && /[,;:]/.test(word[len - 2]) && /["')\]}]/.test(lastChar)) {
            multiplier += 0.6;
        }

        const calculatedDelay = baseDelayMs * multiplier;
        const minDelay = 45;
        const maxDelay = 2000;
        return Math.max(minDelay, Math.min(calculatedDelay, maxDelay));
    }

    /** Calculates the Optimal Recognition Point (ORP) index */
    function calculateOrpIndex(word) {
        const effectiveLen = word.replace(/[^a-zA-Z0-9]/g, '').length;
        if (effectiveLen <= 1) return 0;
        if (effectiveLen <= 3) return 1;
        if (effectiveLen <= 5) return 2;
        return Math.floor(effectiveLen * 0.38);
    }

    /** Displays word in RSVP panel, centers ORP, and highlights in full text */
    function displayWord(wordObject) {
        const nbsp = '\u00A0';
        removeHighlight(); // Clear previous highlight

        if (wordObject && wordObject.text) {
            // Highlight in full text
            const wordElement = fullTextPre.querySelector(`span[data-word-index="${wordObject.index}"]`);
            if (wordElement) {
                wordElement.classList.add('current-rsvp-word');
                if (isPlaying) { // Only scroll when actively playing
                    wordElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
                previousHighlightElement = wordElement;
            }

            // Display in RSVP panel
            const word = wordObject.text;
            let orpIndex = calculateOrpIndex(word);

            // Adjust ORP off punctuation if possible
            while (orpIndex < word.length - 1 && /[^a-zA-Z0-9]/.test(word[orpIndex])) { orpIndex++; }
            while (orpIndex > 0 && /[^a-zA-Z0-9]/.test(word[orpIndex])) { orpIndex--; }
            if (/[^a-zA-Z0-9]/.test(word[orpIndex])) { orpIndex = 0; }

            const beforeOrp = word.substring(0, orpIndex);
            const orpLetter = word[orpIndex] || '';
            const afterOrp = word.substring(orpIndex + 1);

            // Calculate padding for centering
            const charDiff = beforeOrp.length - afterOrp.length;
            let paddingBefore = '', paddingAfter = '';
            const maxPadding = 15;
            if (charDiff > 0) paddingAfter = nbsp.repeat(Math.min(charDiff, maxPadding));
            else if (charDiff < 0) paddingBefore = nbsp.repeat(Math.min(Math.abs(charDiff), maxPadding));

            // Set RSVP display content (ensure parts are escaped)
             rsvpDisplay.innerHTML = `
                <span class="word-container">
                    <span class="orp-before">${paddingBefore}${escapeHtml(beforeOrp)}</span><span class="orp-letter">${escapeHtml(orpLetter)}</span><span class="orp-after">${escapeHtml(afterOrp)}${paddingAfter}</span>
                </span>`;

        } else {
            // Show placeholder if no word object
            const placeholderText = "Ready...";
            const placeholderPadding = nbsp.repeat(Math.max(0, 12 - placeholderText.length));
            rsvpDisplay.innerHTML = `<span class="placeholder">${placeholderPadding}${placeholderText}${placeholderPadding}</span>`;
        }
    }

    /** Removes the highlight class from the previously highlighted word */
    function removeHighlight() {
        if (previousHighlightElement) {
            previousHighlightElement.classList.remove('current-rsvp-word');
            previousHighlightElement = null;
        }
    }

    /** Displays status messages to the user */
    function showStatus(message, isError = false, isLoading = false) {
        statusMsg.textContent = message;
        statusMsg.className = 'status-message'; // Reset classes
        if (isError) {
            statusMsg.classList.add('error');
        } else if (!isLoading && message) {
            statusMsg.classList.add('success');
        }
    }

    /** Updates the enabled/disabled state of control buttons */
    function updateControlStates() {
        const hasWords = words.length > 0;
        const isReady = hasWords && currentWordIndex >= 0; // Ready if words loaded and index is valid
        const canPlay = isReady && currentWordIndex < words.length;

        playPauseBtn.disabled = !isReady; // Can toggle play/pause if ready
        stopBtn.disabled = !isReady || (!isPlaying && currentWordIndex === 0); // Can stop if ready AND (playing OR not at start)
        wpmSlider.disabled = !hasWords; // Enable slider if words are loaded

        // Submit button state is managed in handleSubmit/resetState
    }

}); // End DOMContentLoaded