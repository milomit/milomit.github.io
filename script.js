document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('text-input');
    const wpmInput = document.getElementById('wpm');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const display = document.getElementById('rsvp-display');

    let words = [];
    let currentWordIndex = 0;
    let isReading = false;
    let timeoutId = null;

    // Function to find the Optimal Recognition Point (ORP) index
    function getORPIndex(word) {
        const len = word.length;
        if (len <= 1) return 0; // First letter
        if (len <= 3) return 1; // Second letter (e.g., cat -> a)
        if (len <= 5) return 2; // Third letter (e.g., apple -> p)
        if (len <= 9) return 3; // Fourth letter (e.g., example -> m)
        return 4;             // Fifth letter (e.g., important -> o)
        // This is a common heuristic, adjust if needed
    }

    // Function to calculate delay based on word length and punctuation
    function calculateDelay(word, wpm) {
        const baseDelay = (60 / wpm) * 1000; // Base delay in ms
        let extraDelay = 0;

        // Add slight extra time for longer words
        if (word.length > 6) {
            extraDelay += baseDelay * 0.3; // Add 30% for long words
        }
        if (word.length > 10) {
            extraDelay += baseDelay * 0.2; // Add another 20% for very long words
        }

        // Add significant extra time for punctuation indicating pauses
        const lastChar = word.slice(-1);
        if (['.', ',', ';', ':', '!', '?'].includes(lastChar)) {
            extraDelay += baseDelay * 0.5; // Add 50% for end punctuation
        }

        return baseDelay + extraDelay;
    }

    // Function to display the next word
    function displayNextWord() {
        if (!isReading || currentWordIndex >= words.length) {
            stopReading();
            display.innerHTML = "Finished!";
            return;
        }

        const word = words[currentWordIndex];
        if (!word) { // Skip empty strings resulting from multiple spaces
            currentWordIndex++;
            displayNextWord(); // Immediately try the next word
            return;
        }

        const orpIndex = getORPIndex(word);
        const wpm = parseInt(wpmInput.value, 10) || 300;
        const delay = calculateDelay(word, wpm);

        // Format the word with the ORP highlighted
        const before = word.substring(0, orpIndex);
        const orpLetter = word.substring(orpIndex, orpIndex + 1);
        const after = word.substring(orpIndex + 1);

        // --- Centering Logic ---
        // While text-align:center centers the block, visually centering
        // *around* the ORP requires adjusting spacing.
        // A simple approximation using non-breaking spaces can help,
        // but true pixel-perfect centering is complex without canvas/svg.
        // We'll use the standard approach: center the word block, highlight ORP.
        // The monospace font and focus indicators help guide the eye.

        display.innerHTML = `${before}<span class="orp-letter">${orpLetter}</span>${after}`;

        currentWordIndex++;

        // Schedule the next word
        timeoutId = setTimeout(displayNextWord, delay);
    }

    // Function to start reading
    function startReading() {
        if (isReading) return; // Already reading

        const text = textInput.value.trim();
        if (!text) {
            display.innerHTML = "Enter text first.";
            return;
        }

        // Split into words, respecting whitespace
        words = text.split(/\s+/);
        currentWordIndex = 0;
        isReading = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        textInput.disabled = true;
        wpmInput.disabled = true;


        // Clear previous timeout if any
        clearTimeout(timeoutId);
        display.innerHTML = ""; // Clear display initially

        displayNextWord(); // Start the sequence
    }

    // Function to stop reading
    function stopReading() {
        isReading = false;
        clearTimeout(timeoutId);
        timeoutId = null;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        textInput.disabled = false;
        wpmInput.disabled = false;
        // Optional: Clear display or leave the last word
        // display.innerHTML = "Stopped.";
    }

    // Event Listeners
    startBtn.addEventListener('click', startReading);
    stopBtn.addEventListener('click', stopReading);

    // Initial state
    stopBtn.disabled = true;
});