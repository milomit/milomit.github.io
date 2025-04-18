document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const apiKeyInput = document.getElementById('apiKey');
    const promptInput = document.getElementById('prompt');
    const submitBtn = document.getElementById('submitBtn');
    const statusMsg = document.getElementById('status');
    const wpmSlider = document.getElementById('wpmSlider');
    const wpmValueSpan = document.getElementById('wpmValue');
    const rsvpDisplay = document.getElementById('rsvp-display');
    const rsvpPlaceholder = rsvpDisplay.querySelector('.placeholder');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const fullTextOutputDiv = document.getElementById('full-text-output');
    const fullTextPre = fullTextOutputDiv.querySelector('pre');
    const themeToggleBtn = document.getElementById('themeToggle'); // Get toggle button


    // --- State Variables ---
    let words = [];
    let currentWordIndex = 0;
    let isPlaying = false;
    let rsvpIntervalId = null;
    let currentWpm = parseInt(wpmSlider.value, 10);
    let currentApiKey = '';
    let fullText = '';


    // --- Event Listeners ---
    submitBtn.addEventListener('click', handleSubmit);
    wpmSlider.addEventListener('input', handleSliderChange);
    playPauseBtn.addEventListener('click', togglePlayPause);
    stopBtn.addEventListener('click', stopRsvp);
    themeToggleBtn.addEventListener('click', toggleTheme); // Add listener for theme toggle


    // --- Initialization ---
    initializeTheme();
    wpmValueSpan.textContent = currentWpm;
    updateControlStates();
    displayWord(null); // Initialize with placeholder


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

        stopRsvp();
        showStatus("Generating response...", false, true);
        submitBtn.disabled = true;
        playPauseBtn.disabled = true; // Disable during generation
        stopBtn.disabled = true; // Disable during generation
        fullTextOutputDiv.style.display = 'none';

        try {
            const responseText = await callGoogleAI(prompt, currentApiKey);
            if (responseText) {
                fullText = responseText;
                words = preprocessText(responseText);
                if (words.length > 0) {
                    currentWordIndex = 0;
                    isPlaying = false;
                    showStatus("Response received. Press Play.", false);
                    displayWord(words[0]);
                    fullTextPre.textContent = fullText;
                    fullTextOutputDiv.style.display = 'block';
                } else {
                    showStatus("Received empty or unreadable response.", true);
                }
            }
            // Error status is set within callGoogleAI
        } catch (error) {
            console.error("Error during generation process:", error);
            // Status likely set by callGoogleAI, but could add a fallback here
            showStatus(`Processing error: ${error.message}`, true);
        } finally {
            submitBtn.disabled = false;
            updateControlStates(); // Update based on whether words were loaded
        }
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

    function preprocessText(text) {
        // Split by whitespace, filter empty strings
        return text.split(/[\s\n]+/).filter(word => word.length > 0);
    }

    function togglePlayPause() {
        if (!words.length) return;
        isPlaying = !isPlaying;
        playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
        if (isPlaying) {
            if (currentWordIndex >= words.length) currentWordIndex = 0; // Restart if at end
            startRsvpLoop();
        } else {
            clearTimeout(rsvpIntervalId);
            rsvpIntervalId = null;
        }
        updateControlStates();
    }

    function stopRsvp() {
        isPlaying = false;
        clearTimeout(rsvpIntervalId);
        rsvpIntervalId = null;
        currentWordIndex = 0;
        if (words.length > 0) displayWord(words[0]);
        else displayWord(null); // Show placeholder if no words
        playPauseBtn.textContent = 'Play';
        updateControlStates();
    }

    function startRsvpLoop() {
        if (!isPlaying || currentWordIndex >= words.length) {
            if (currentWordIndex >= words.length && words.length > 0) { // Check words.length > 0 to avoid message on initial load
                isPlaying = false;
                playPauseBtn.textContent = 'Play';
                showStatus("RSVP finished.", false);
                currentWordIndex = 0; // Reset for potential replay
                displayWord(words[0]); // Show first word again when finished
            }
            updateControlStates();
            return;
        }

        const word = words[currentWordIndex];
        displayWord(word);
        const delay = calculateDelay(word, currentWpm);

        rsvpIntervalId = setTimeout(() => {
            currentWordIndex++;
            startRsvpLoop();
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
     * Displays a word in the RSVP panel, centered around the ORP.
     * Uses non-breaking spaces and monospace font for approximate centering.
     * @param {string | null} word The word to display, or null to show placeholder.
     */
    function displayWord(word) {
        const nbsp = '\u00A0'; // Non-breaking space character

        if (!word) {
            // Use padding to roughly center the placeholder text
            const placeholderText = "Ready...";
            const placeholderPadding = nbsp.repeat(Math.max(0, 12 - placeholderText.length)); // Adjust padding as needed
            rsvpDisplay.innerHTML = `<span class="placeholder">${placeholderPadding}${placeholderText}${placeholderPadding}</span>`;
            return;
        }

        // --- ORP Calculation ---
        let orpIndex = calculateOrpIndex(word);

        // Ensure ORP doesn't land on leading/trailing punctuation if possible
        // Try to find the first *actual* letter/number if ORP is on initial punct
            while (orpIndex < word.length - 1 && /[^a-zA-Z0-9]/.test(word[orpIndex])) {
                orpIndex++;
            }
            // If it ends up on trailing punct, move left to the last letter/number
            while (orpIndex > 0 && /[^a-zA-Z0-9]/.test(word[orpIndex])) {
                orpIndex--;
            }
            // Final fallback: if the adjusted index is *still* punctuation (e.g. word IS punctuation), default to 0
            if (/[^a-zA-Z0-9]/.test(word[orpIndex])) {
                orpIndex = 0;
            }


        // --- String Splitting ---
        const beforeOrp = word.substring(0, orpIndex);
        const orpLetter = word[orpIndex] || ''; // Handle potential index out of bounds
        const afterOrp = word.substring(orpIndex + 1);

        // --- Padding Calculation for Centering ---
        // Calculate the character difference to determine padding needed
        // We use raw lengths here because monospace characters (including punctuation) have similar widths
        const charDiff = beforeOrp.length - afterOrp.length;

        let paddingBefore = '';
        let paddingAfter = '';
        const maxPadding = 15; // Limit max padding to prevent excessive width

        // If 'before' part is longer, pad 'after'
        if (charDiff > 0) {
            paddingAfter = nbsp.repeat(Math.min(charDiff, maxPadding));
        }
        // If 'after' part is longer, pad 'before'
        else if (charDiff < 0) {
            paddingBefore = nbsp.repeat(Math.min(Math.abs(charDiff), maxPadding));
        }

        // --- Construct HTML ---
        // Combine padding and word parts
        // The outer span is centered by flexbox (#rsvp-display)
        // The inner structure uses padding to shift the ORP visually
        rsvpDisplay.innerHTML = `
            <span class="word-container">
                <span class="orp-before">${paddingBefore}${beforeOrp}</span><span class="orp-letter">${orpLetter}</span><span class="orp-after">${afterOrp}${paddingAfter}</span>
            </span>
        `;
    }
    


    function displayWord(word) {
        if (!word) {
            rsvpDisplay.innerHTML = `<span class="placeholder">Ready...</span>`;
            return;
        }

        // Simple ORP calculation based on character index
        let orpIndex = calculateOrpIndex(word);

        // Adjust ORP index if it falls on punctuation, try moving left
        const nonWordRegex = /[^a-zA-Z0-9]/;
        while (orpIndex > 0 && nonWordRegex.test(word[orpIndex])) {
             orpIndex--;
        }
         // If the first char is punctuation, use the second if available
         if (orpIndex === 0 && nonWordRegex.test(word[orpIndex]) && word.length > 1) {
             orpIndex = 1;
         }
         // Final fallback if still on punctuation (e.g., short punctuation word like ';')
         if (nonWordRegex.test(word[orpIndex])) {
            orpIndex = 0;
         }


        const beforeOrp = word.substring(0, orpIndex);
        const orpLetter = word[orpIndex];
        const afterOrp = word.substring(orpIndex + 1);

        // Use non-breaking spaces for padding to help centering, but CSS handles main alignment
        const PADDING_SPACES = 15; // Adjust as needed for visual balance
        const nbsp = '\u00A0'; // Non-breaking space HTML entity

        let padBefore = nbsp.repeat(Math.max(0, PADDING_SPACES - beforeOrp.length));
        let padAfter = nbsp.repeat(Math.max(0, PADDING_SPACES - afterOrp.length));


        rsvpDisplay.innerHTML = `
            <span class="word-container">
                <span class="orp-before">${padBefore}${beforeOrp}</span><span class="orp-letter">${orpLetter}</span><span class="orp-after">${afterOrp}${padAfter}</span>
            </span>
        `;
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

    function updateControlStates() {
        const hasWords = words.length > 0;
        // Enable play/stop only if words are loaded
        playPauseBtn.disabled = !hasWords;
        // Disable stop if not playing OR if already at the beginning
        stopBtn.disabled = !hasWords || (!isPlaying && currentWordIndex === 0);

         // Re-enable submit button unless actively playing
         submitBtn.disabled = isPlaying;
    }

});