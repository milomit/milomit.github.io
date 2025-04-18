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


    // --- State Variables ---
    let words = [];
    let currentWordIndex = 0;
    let isPlaying = false;
    let rsvpIntervalId = null; // Will store the timeout ID
    let currentWpm = parseInt(wpmSlider.value, 10);
    let currentApiKey = '';
    let fullText = ''; // To store the complete response


    // --- Event Listeners ---
    submitBtn.addEventListener('click', handleSubmit);
    wpmSlider.addEventListener('input', handleSliderChange);
    playPauseBtn.addEventListener('click', togglePlayPause);
    stopBtn.addEventListener('click', stopRsvp);


    // --- Initialization ---
    wpmValueSpan.textContent = currentWpm;
    updateControlStates();


    // --- Functions ---

    function handleSliderChange() {
        currentWpm = parseInt(wpmSlider.value, 10);
        wpmValueSpan.textContent = currentWpm;
        // If playing, restarting the interval *could* adjust speed immediately,
        // but it's simpler to let the current word finish and use the new speed for the next.
        // For immediate change, we'd need to clear and reset the timeout in startRsvpLoop.
    }

    async function handleSubmit() {
        currentApiKey = apiKeyInput.value.trim();
        const prompt = promptInput.value.trim();

        if (!currentApiKey || !prompt) {
            showStatus("Please enter both API Key and Prompt.", true);
            return;
        }

        stopRsvp(); // Stop any previous RSVP
        showStatus("Generating response...", false, true); // Show loading state
        submitBtn.disabled = true;
        fullTextOutputDiv.style.display = 'none'; // Hide previous full text

        try {
            const responseText = await callGoogleAI(prompt, currentApiKey);
            if (responseText) {
                fullText = responseText; // Store the full text
                words = preprocessText(responseText);
                if (words.length > 0) {
                    currentWordIndex = 0;
                    isPlaying = false; // Start in paused state
                    showStatus("Response received. Press Play to start RSVP.", false);
                    displayWord(words[0]); // Show the first word immediately
                    fullTextPre.textContent = fullText; // Display full text
                    fullTextOutputDiv.style.display = 'block'; // Show the full text area
                } else {
                    showStatus("Received empty response from LLM.", true);
                }
            }
            // Error handling within callGoogleAI shows status messages
        } catch (error) {
            console.error("Error during API call or processing:", error);
            // Status is likely already set by callGoogleAI
        } finally {
            submitBtn.disabled = false; // Re-enable button
            updateControlStates(); // Enable/disable Play/Stop buttons
        }
    }

    async function callGoogleAI(prompt, apiKey) {
        // Using gemini-pro model via REST API
        const API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.0-pro:generateContent?key=${apiKey}`;

        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            // Optional: Add safety settings or generation config if needed
            // generationConfig: { ... },
            // safetySettings: [ ... ]
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                let errorMsg = `API Error: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg += ` - ${errorData.error?.message || 'Unknown error'}`;
                    if (response.status === 400 && errorData.error?.message.toLowerCase().includes('api key not valid')) {
                         errorMsg = "API Key not valid. Please check your key.";
                    }
                } catch (e) { /* Ignore parsing error */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();

            // Extract text - check structure carefully based on actual API response
            if (data.candidates && data.candidates.length > 0 &&
                data.candidates[0].content && data.candidates[0].content.parts &&
                data.candidates[0].content.parts.length > 0) {
                return data.candidates[0].content.parts[0].text;
            } else {
                // Handle cases like blocked content due to safety settings
                if (data.promptFeedback?.blockReason) {
                     throw new Error(`Content blocked: ${data.promptFeedback.blockReason}`);
                }
                console.warn("Unexpected API response structure:", data);
                throw new Error("Could not extract text from LLM response.");
            }

        } catch (error) {
            console.error("Google AI API call failed:", error);
            showStatus(`Error: ${error.message}`, true);
            return null; // Indicate failure
        }
    }

    function preprocessText(text) {
        // Simple split by whitespace. More complex regex could handle punctuation better.
        return text.split(/\s+/).filter(word => word.length > 0);
    }

    function togglePlayPause() {
        if (!words.length) return;

        isPlaying = !isPlaying;
        if (isPlaying) {
            playPauseBtn.textContent = 'Pause';
            if (currentWordIndex >= words.length) {
                currentWordIndex = 0; // Restart if finished
            }
            startRsvpLoop();
        } else {
            playPauseBtn.textContent = 'Play';
            clearTimeout(rsvpIntervalId); // Stop the loop
            rsvpIntervalId = null;
        }
         updateControlStates();
    }

    function stopRsvp() {
        isPlaying = false;
        clearTimeout(rsvpIntervalId);
        rsvpIntervalId = null;
        currentWordIndex = 0; // Reset index
        if (words.length > 0) {
             displayWord(words[0]); // Show the first word again
        } else {
             displayWord(null); // Clear display or show placeholder
        }
        playPauseBtn.textContent = 'Play';
        updateControlStates();
    }

    function startRsvpLoop() {
        if (!isPlaying || currentWordIndex >= words.length) {
            // End of words or paused
            if (currentWordIndex >= words.length) {
                isPlaying = false;
                playPauseBtn.textContent = 'Play'; // Reset button text
                showStatus("RSVP finished.", false);
            }
            updateControlStates();
            return;
        }

        const word = words[currentWordIndex];
        displayWord(word);

        const delay = calculateDelay(word, currentWpm);

        rsvpIntervalId = setTimeout(() => {
            currentWordIndex++;
            startRsvpLoop(); // Schedule the next word
        }, delay);
    }

    function calculateDelay(word, wpm) {
        const baseDelay = 60000 / wpm; // milliseconds per word

        // --- Dynamic Delay Logic ---
        let dynamicFactor = 0;
        const len = word.length;

        // Add slight delay for longer words
        if (len > 6) {
            dynamicFactor += baseDelay * 0.3; // Add 30% for words > 6 chars
        }
        if (len > 10) {
            dynamicFactor += baseDelay * 0.3; // Add another 30% for words > 10 chars
        }

        // Add delay for punctuation (especially end-of-sentence)
        const lastChar = word[len - 1];
        if (/[.,?!;:]/.test(lastChar)) {
            dynamicFactor += baseDelay * 0.5; // Add 50% for common punctuation
        }
        if (/[.?!]/.test(lastChar)) {
             dynamicFactor += baseDelay * 0.3; // Add extra for sentence enders
        }

        return baseDelay + dynamicFactor;
    }

    function calculateOrpIndex(word) {
        const len = word.length;
        if (len <= 1) return 0; // First letter
        if (len <= 3) return 1; // Second letter
        // Heuristic: Roughly 1/3rd to 40% into the word
        return Math.floor(len * 0.35); // Adjust this multiplier as needed
        // Alternative: Math.ceil(len / 2.5) - 1; // Slightly left-biased center
    }


    function displayWord(word) {
        if (!word) {
            rsvpDisplay.innerHTML = `<span class="placeholder">Ready...</span>`;
             rsvpPlaceholder.style.display = 'inline';
            return;
        }

        rsvpPlaceholder.style.display = 'none'; // Hide placeholder

        const orpIndex = calculateOrpIndex(word);
        const orpLetter = word[orpIndex];
        const beforeOrp = word.substring(0, orpIndex);
        const afterOrp = word.substring(orpIndex + 1);

        // Using spans to style the ORP letter
        // The visual centering relies mostly on the CSS `text-align: center`
        // on the container and the fixed-width font. The red letter draws focus.
        rsvpDisplay.innerHTML = `
            <span class="word-container">
                <span class="orp-before">${beforeOrp}</span><span class="orp-letter">${orpLetter}</span><span class="orp-after">${afterOrp}</span>
            </span>
        `;
    }

    function showStatus(message, isError = false, isLoading = false) {
        statusMsg.textContent = message;
        statusMsg.className = 'status-message'; // Reset classes
        if (isError) {
            statusMsg.classList.add('error');
        } else if (!isLoading) { // Don't add success class if it's just loading
            statusMsg.classList.add('success');
        }
         // Optionally add a loading class for styling spinners etc.
         // if (isLoading) statusMsg.classList.add('loading');
    }

    function updateControlStates() {
        const hasWords = words.length > 0;
        playPauseBtn.disabled = !hasWords;
        stopBtn.disabled = !hasWords || (!isPlaying && currentWordIndex === 0); // Disable stop if already stopped/at start
    }

});