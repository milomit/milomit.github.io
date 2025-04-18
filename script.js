document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const apiKeyInput = document.getElementById('apiKey');
    const promptInput = document.getElementById('prompt');
    const submitBtn = document.getElementById('submitBtn');
    const statusMsg = document.getElementById('status');
    const wpmSlider = document.getElementById('wpmSlider');
    const wpmValueSpan = document.getElementById('wpmValue');
    const rsvpDisplay = document.getElementById('rsvp-display');
    // rsvpPlaceholder is managed dynamically now
    const playPauseBtn = document.getElementById('playPauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const fullTextOutputDiv = document.getElementById('full-text-output');
    const fullTextPre = fullTextOutputDiv.querySelector('pre');
    const themeToggleBtn = document.getElementById('themeToggle');

    // --- State Variables ---
    let words = []; // Now stores objects: { text: string, start: int, end: int, index: int }
    let currentWordIndex = -1; // Start at -1 to indicate nothing is selected initially
    let isPlaying = false;
    let rsvpIntervalId = null;
    let currentWpm = parseInt(wpmSlider.value, 10);
    let currentApiKey = '';
    let fullText = '';
    let previousHighlightElement = null; // To efficiently remove previous highlight


    // --- Event Listeners ---
    submitBtn.addEventListener('click', handleSubmit);
    wpmSlider.addEventListener('input', handleSliderChange);
    playPauseBtn.addEventListener('click', togglePlayPause);
    stopBtn.addEventListener('click', stopRsvp);
    themeToggleBtn.addEventListener('click', toggleTheme);
    // Add event listener to the full text container for word clicks (Event Delegation)
    fullTextPre.addEventListener('click', handleFullTextClick);


    // --- Initialization ---
    initializeTheme();
    wpmValueSpan.textContent = currentWpm;
    updateControlStates();
    displayWord(null); // Show initial placeholder


    // --- Theme Functions ---
    function setLightTheme() {
        document.body.classList.remove('dark-mode');
        themeToggleBtn.textContent = '🌙'; // Moon icon for switching to dark
        themeToggleBtn.setAttribute('aria-label', 'Switch to dark mode');
        localStorage.setItem('theme', 'light');
    }

    function setDarkTheme() {
        document.body.classList.add('dark-mode');
        themeToggleBtn.textContent = '☀️'; // Sun icon for switching to light
        themeToggleBtn.setAttribute('aria-label', 'Switch to light mode');
        localStorage.setItem('theme', 'dark');
    }

    function initializeTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (savedTheme === 'dark') {
            setDarkTheme();
        } else if (savedTheme === 'light') {
            setLightTheme();
        } else if (prefersDark) {
            setDarkTheme(); // Default to system preference if no explicit choice saved
        } else {
            setLightTheme(); // Default to light otherwise
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

    function handleSliderChange() {
        currentWpm = parseInt(wpmSlider.value, 10);
        wpmValueSpan.textContent = currentWpm;
        // Speed adjustment during playback is handled by calculateDelay using currentWpm
    }

    async function handleSubmit() {
        currentApiKey = apiKeyInput.value.trim();
        const prompt = promptInput.value.trim();

        if (!currentApiKey || !prompt) {
            showStatus("Please enter both API Key and Prompt.", true);
            return;
        }

        resetStateBeforeApiCall(); // Reset state variables and UI

        try {
            const responseText = await callGoogleAI(prompt, currentApiKey);
            if (responseText && responseText.trim().length > 0) {
                fullText = responseText;
                words = preprocessText(fullText); // Create word objects with indices

                if (words.length > 0) {
                    renderFullTextWithSpans(fullText, words); // Render text with clickable spans
                    fullTextOutputDiv.style.display = 'block';
                    currentWordIndex = 0; // Set index to the start
                    isPlaying = false;
                    showStatus(`Response received (${words.length} words). Press Play.`, false);
                    displayWord(words[currentWordIndex]); // Show the first word & highlight
                } else {
                    showStatus("LLM response processed, but no words found.", true);
                    fullTextPre.textContent = fullText; // Show raw text if no words parsed
                    fullTextOutputDiv.style.display = 'block';
                }
            } else if (responseText !== null) { // Handle empty response explicitly
                 showStatus("Received an empty response from the LLM.", true);
                 fullTextPre.textContent = "-- Empty Response --";
                 fullTextOutputDiv.style.display = 'block';
            }
            // Error status is set within callGoogleAI if responseText is null
        } catch (error) {
            console.error("Error during generation process:", error);
            showStatus(`Processing error: ${error.message}`, true);
        } finally {
            submitBtn.disabled = false; // Re-enable button
            updateControlStates(); // Update based on whether words were loaded
        }
    }

     function resetStateBeforeApiCall() {
        stopRsvp(); // Stop any ongoing RSVP and clear timeouts/highlights
        showStatus("Generating response...", false, true);
        submitBtn.disabled = true;
        playPauseBtn.disabled = true;
        stopBtn.disabled = true;
        fullTextOutputDiv.style.display = 'none';
        fullTextPre.innerHTML = ''; // Clear previous text content
        words = [];
        fullText = '';
        currentWordIndex = -1;
        previousHighlightElement = null;
        displayWord(null); // Clear RSVP display
    }

    async function callGoogleAI(prompt, apiKey) {
        // --- USE THIS URL (v1 and specific model name) ---
        const API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }],
            // Optional: Add safety settings/generation config if needed
            // generationConfig: { temperature: 0.7, topP: 1.0 },
            // safetySettings: [ { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" } ]
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                 // Attempt to parse error JSON for more details
                let errorData = null;
                let errorMsg = `API Error: ${response.status}`;
                try {
                    errorData = await response.json();
                    if (errorData.error?.message) {
                         errorMsg += ` - ${errorData.error.message}`;
                         // Specific check for key validity based on common error messages
                         if (response.status === 400 && errorData.error.message.toLowerCase().includes('api key not valid')) {
                              errorMsg = "API Key not valid. Please check your key and ensure it's enabled for the Generative Language API.";
                         }
                         // Check for the 404 error specifically
                         if (response.status === 404 && errorData.error.message.toLowerCase().includes('not found for api version')) {
                              errorMsg = `Model/API version mismatch (Error 404). Ensure API key is correct and the model 'gemini-1.0-pro' is available via the v1 endpoint. Details: ${errorData.error.message}`;
                         }
                    }
                } catch (e) {
                     errorMsg += ` (${response.statusText || 'Network error'})`;
                }
                 console.error("API Response Error Data:", errorData); // Log the detailed error
                 throw new Error(errorMsg);
            }

            const data = await response.json();

            // Refined text extraction with more checks
            if (data.candidates && data.candidates.length > 0) {
                const candidate = data.candidates[0];
                if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                    return candidate.content.parts[0].text;
                } else if (candidate.finishReason && candidate.finishReason !== "STOP") {
                     // Handle cases like safety blocks
                     throw new Error(`Generation stopped: ${candidate.finishReason}. ${candidate.safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ') || ''}`);
                }
            }
            // Check for prompt feedback block, though candidate check above is often better
            if (data.promptFeedback?.blockReason) {
                 throw new Error(`Prompt blocked: ${data.promptFeedback.blockReason}`);
            }

            console.warn("Unexpected successful API response structure:", data);
            throw new Error("Could not extract text from LLM response structure.");

        } catch (error) {
            console.error("Google AI API call failed:", error);
            showStatus(`Error: ${error.message}`, true); // Display the detailed error
            return null;
        }
    }

    /**
     * Processes the full text, identifies words, and returns an array of objects,
     * each containing the word's text, start/end indices, and its index in the array.
     * @param {string} text The full text response.
     * @returns {Array<object>} Array of { text, start, end, index }
     */
    function preprocessText(text) {
        const wordObjects = [];
        // Regex to find sequences of non-whitespace characters (words)
        // It captures the word and its index
        const regex = /\S+/g;
        let match;
        let index = 0;

        while ((match = regex.exec(text)) !== null) {
            wordObjects.push({
                text: match[0],
                start: match.index,
                end: match.index + match[0].length,
                index: index++ // Assign the sequential index
            });
        }
        return wordObjects;
    }

    /**
     * Renders the full text into the <pre> tag, wrapping each word
     * (identified in the wordObjects array) in a clickable span.
     * @param {string} fullText The original text.
     * @param {Array<object>} wordObjects Processed word data from preprocessText.
     */
    function renderFullTextWithSpans(fullText, wordObjects) {
        let htmlContent = '';
        let lastIndex = 0;

        wordObjects.forEach(word => {
            // Add the text between the last word and this word (whitespace)
            htmlContent += escapeHtml(fullText.substring(lastIndex, word.start));
            // Add the word wrapped in a span
            htmlContent += `<span class="word" data-word-index="${word.index}">${escapeHtml(word.text)}</span>`;
            lastIndex = word.end;
        });

        // Add any remaining text after the last word
        htmlContent += escapeHtml(fullText.substring(lastIndex));

        fullTextPre.innerHTML = htmlContent;
    }

     // Helper function to escape HTML entities for safe rendering
    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&")
             .replace(/</g, "<")
             .replace(/>/g, ">")
             .replace(/"/g, """)
             .replace(/'/g, "'");
    }

    /**
     * Handles clicks within the full text display area.
     * If a word span is clicked, jumps the RSVP to that word.
     * @param {Event} event The click event.
     */
    function handleFullTextClick(event) {
        const target = event.target;
        // Check if the clicked element is a word span with the data attribute
        if (target && target.matches('span.word[data-word-index]')) {
            const wordIndex = parseInt(target.getAttribute('data-word-index'), 10);

            if (!isNaN(wordIndex) && wordIndex >= 0 && wordIndex < words.length) {
                // Stop playback if it was running
                if (isPlaying) {
                    stopRsvp(); // Stops playback, resets index, clears highlight
                        currentWordIndex = wordIndex; // Set index AFTER stopping
                        displayWord(words[currentWordIndex]); // Display the clicked word & highlight
                        showStatus(`Navigated to word ${currentWordIndex + 1}. Press Play to resume.`, false);
                        updateControlStates(); // Update buttons
                } else {
                    // If already paused/stopped, just jump
                    currentWordIndex = wordIndex;
                    displayWord(words[currentWordIndex]); // Display word and update highlight
                    updateControlStates(); // Ensure buttons are correct (Play should be enabled)
                }
            }
        }
    }


    function togglePlayPause() {
        if (!words.length || currentWordIndex < 0) return; // Don't play if no words or not ready

        isPlaying = !isPlaying;
        playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';

        if (isPlaying) {
            // If starting from beginning or resuming after stop/click
            if (currentWordIndex < 0 || currentWordIndex >= words.length) {
                 currentWordIndex = 0;
            }
             // Ensure the word at the current index is displayed before starting loop
             displayWord(words[currentWordIndex]);
             startRsvpLoop();
        } else {
            // Pause: clear the timer but keep index and highlight
            clearTimeout(rsvpIntervalId);
            rsvpIntervalId = null;
        }
        updateControlStates();
    }


    function stopRsvp() {
        isPlaying = false;
        clearTimeout(rsvpIntervalId);
        rsvpIntervalId = null;
        playPauseBtn.textContent = 'Play';

        // Remove highlight from the full text view
        removeHighlight();

        if (words.length > 0) {
             currentWordIndex = 0; // Reset index to the beginning
             displayWord(words[currentWordIndex]); // Show the first word (without highlight initially)
        } else {
             currentWordIndex = -1; // No words, reset index
             displayWord(null); // Clear display
        }
         updateControlStates();
    }


    function startRsvpLoop() {
        if (!isPlaying || currentWordIndex < 0 || currentWordIndex >= words.length) {
            // Handle end of playback
            if (currentWordIndex >= words.length && words.length > 0) {
                isPlaying = false;
                playPauseBtn.textContent = 'Play';
                showStatus("RSVP finished.", false);
                // Optional: Keep the last word highlighted or remove highlight
                // removeHighlight(); // Uncomment to remove highlight at the end
                // currentWordIndex = 0; // Reset for potential replay from start
            }
            updateControlStates();
            return;
        }

        // Display word and update highlight *before* setting timeout for next word
        const wordObject = words[currentWordIndex];
        displayWord(wordObject); // This now also handles highlighting

        const delay = calculateDelay(wordObject.text, currentWpm);

        rsvpIntervalId = setTimeout(() => {
            currentWordIndex++;
            startRsvpLoop(); // Schedule the next word
        }, delay);
    }

    /**
     * Calculates the display duration for a word based on WPM and word characteristics.
     * @param {string} word The word to calculate delay for.
     * @param {number} wpm Current words per minute setting.
     * @returns {number} Delay in milliseconds.
     */
    function calculateDelay(word, wpm) {
        // Base delay: time per word in milliseconds
        const baseDelayMs = 60000 / wpm;

        // --- Dynamic Delay Logic ---
        let multiplier = 1.0; // Start with a standard delay multiplier

        // 1. Adjust for word length
        const len = word.length;
        if (len > 6) {
            multiplier += 0.3; // Add 30% for moderately long words
        }
        if (len > 10) {
            multiplier += 0.4; // Add another 40% (total 70%) for very long words
        }
        if (len < 4) {
            multiplier -= 0.1; // Slightly speed up very short words (optional)
        }

        // 2. Adjust for punctuation (indicating natural pauses)
        // Check last character primarily
        const lastChar = word[len - 1];
        if (/[.!?,;:]/.test(lastChar)) {
            multiplier += 0.6; // Add 60% for common end-of-clause punctuation
            // Add extra pause for sentence terminators
            if (/[.!?]/.test(lastChar)) {
                multiplier += 0.4; // Add another 40% (total 100% or 1x base extra)
            }
        } else if (len > 1 && /[,;:]/.test(word[len - 2]) && /["')\]}]/.test(lastChar)) {
            // Catch punctuation followed by closing quote/bracket (e.g., "word," or word;)
             multiplier += 0.6;
        }

        // 3. Apply multiplier and ensure minimum delay
        const calculatedDelay = baseDelayMs * multiplier;
        const minDelay = 45; // Minimum milliseconds to prevent visual glitches at high WPM
        const maxDelay = 2000; // Maximum reasonable delay for very long words/pauses

        return Math.max(minDelay, Math.min(calculatedDelay, maxDelay));
    }

    /**
 * Calculates the Optimal Recognition Point (ORP) index for a word.
 * This is the letter the eye should focus on.
 * @param {string} word The word to calculate ORP for.
 * @returns {number} The index of the ORP letter.
 */
    function calculateOrpIndex(word) {
        // Remove punctuation for length calculation, as it affects visual balance less in monospace
        const effectiveLen = word.replace(/[^a-zA-Z0-9]/g, '').length;

        if (effectiveLen <= 1) return 0;          // First letter for 1 char words
        if (effectiveLen <= 3) return 1;          // Second letter for 2-3 char words
        if (effectiveLen <= 5) return 2;          // Third letter for 4-5 char words
        // General heuristic: approx 35-40% into the word's alphanumeric characters
        return Math.floor(effectiveLen * 0.38);
    }

/**
     * Displays a word in the RSVP panel, centers it, AND highlights
     * the corresponding word in the full text view.
     * @param {object | null} wordObject The word object {text, index,...} or null.
     */
    function displayWord(wordObject) {
        const nbsp = '\u00A0';

        // --- Update Full Text Highlight ---
        removeHighlight(); // Remove previous highlight first

        if (wordObject) {
            const wordElement = fullTextPre.querySelector(`span[data-word-index="${wordObject.index}"]`);
            if (wordElement) {
                wordElement.classList.add('current-rsvp-word');
                // Scroll the highlighted word into view if needed
                wordElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                previousHighlightElement = wordElement; // Store for efficient removal later
            }

            // --- Display Word in RSVP Panel ---
            const word = wordObject.text;
            let orpIndex = calculateOrpIndex(word);

            // Adjust ORP (same logic as before)
            while (orpIndex < word.length - 1 && /[^a-zA-Z0-9]/.test(word[orpIndex])) { orpIndex++; }
            while (orpIndex > 0 && /[^a-zA-Z0-9]/.test(word[orpIndex])) { orpIndex--; }
            if (/[^a-zA-Z0-9]/.test(word[orpIndex])) { orpIndex = 0; }

            const beforeOrp = word.substring(0, orpIndex);
            const orpLetter = word[orpIndex] || '';
            const afterOrp = word.substring(orpIndex + 1);

            const charDiff = beforeOrp.length - afterOrp.length;
            let paddingBefore = '';
            let paddingAfter = '';
            const maxPadding = 15;

            if (charDiff > 0) paddingAfter = nbsp.repeat(Math.min(charDiff, maxPadding));
            else if (charDiff < 0) paddingBefore = nbsp.repeat(Math.min(Math.abs(charDiff), maxPadding));

            rsvpDisplay.innerHTML = `
                <span class="word-container">
                    <span class="orp-before">${paddingBefore}${escapeHtml(beforeOrp)}</span><span class="orp-letter">${escapeHtml(orpLetter)}</span><span class="orp-after">${escapeHtml(afterOrp)}${paddingAfter}</span>
                </span>`;

        } else {
            // Display Placeholder if wordObject is null
            const placeholderText = "Ready...";
            const placeholderPadding = nbsp.repeat(Math.max(0, 12 - placeholderText.length));
            rsvpDisplay.innerHTML = `<span class="placeholder">${placeholderPadding}${placeholderText}${placeholderPadding}</span>`;
        }
    }

     /** Removes the highlight class from the previously highlighted word span. */
    function removeHighlight() {
        if (previousHighlightElement) {
            previousHighlightElement.classList.remove('current-rsvp-word');
            previousHighlightElement = null;
        }
        // Fallback in case state gets messed up (slower)
        // const highlighted = fullTextPre.querySelector('span.current-rsvp-word');
        // if (highlighted) highlighted.classList.remove('current-rsvp-word');
    }


    function showStatus(message, isError = false, isLoading = false) {
        statusMsg.textContent = message;
        statusMsg.className = 'status-message'; // Reset classes
        if (isError) {
            statusMsg.classList.add('error');
        } else if (!isLoading && message) { // Only add success if not loading and there's a message
            statusMsg.classList.add('success');
        }
    }

 /** Updates the enabled/disabled state of control buttons. */
    function updateControlStates() {
    const hasWords = words.length > 0;
    const canPlay = hasWords && currentWordIndex < words.length; // Can play if words exist and not past the end

    playPauseBtn.disabled = !canPlay;
    // Stop button enabled if playing OR if paused not at the very beginning
    stopBtn.disabled = !hasWords || (!isPlaying && currentWordIndex <= 0);

    // Submit button should be enabled unless actively generating (handled in handleSubmit)
    // Or maybe disable if currently playing? Your choice. Let's keep it enabled.
     submitBtn.disabled = false; // Or: submitBtn.disabled = isPlaying;
}

});