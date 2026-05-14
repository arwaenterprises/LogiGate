// ============================================================================
// LogiGate Barcode Scanner Module
// Handles QR code and barcode scanning via camera using html5-qrcode library
// ============================================================================

let html5QrcodeScanner = null;
let scannerActive = false;

// ============================================================================
// SCAN BARCODE
// ============================================================================

/**
 * Open barcode/QR scanner and auto-fill manifest number field
 * Supports: QR codes, EAN-13, UPC, Code128, and other formats
 */
async function scanBarcode() {
    try {
        // Check if already scanning
        if (scannerActive) {
            showToast('Scanner already active', 'info');
            return;
        }

        // Create scanner modal
        createScannerModal();

        // Initialize scanner
        initializeScanner();

    } catch (error) {
        console.error('Barcode scan error:', error);
        showToast('Error opening scanner: ' + error.message, 'error');
    }
}

// ============================================================================
// CREATE SCANNER MODAL
// ============================================================================

/**
 * Create modal dialog for barcode scanner
 */
function createScannerModal() {
    // Check if modal already exists
    const existingModal = document.getElementById('barcode-scanner-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal HTML
    const modalHTML = `
        <div id="barcode-scanner-modal" class="scanner-modal">
            <div class="scanner-modal-content">
                <div class="scanner-modal-header">
                    <h3>📱 Scan Barcode / QR Code</h3>
                    <button class="scanner-close-btn" onclick="closeScanner()">✕</button>
                </div>
                
                <div class="scanner-modal-body">
                    <div id="qr-reader" style="width: 100%; height: 400px;"></div>
                    <p class="scanner-hint">Point camera at barcode or QR code</p>
                </div>

                <div class="scanner-modal-footer">
                    <input 
                        type="text" 
                        id="manual-barcode-input" 
                        class="manual-barcode-input" 
                        placeholder="Or enter barcode manually..."
                        onkeypress="handleManualBarcodeInput(event)"
                    >
                    <button class="btn btn-secondary" onclick="closeScanner()">Cancel</button>
                </div>
            </div>
        </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add modal styles
    addScannerStyles();
}

// ============================================================================
// ADD SCANNER STYLES
// ============================================================================

/**
 * Add CSS styles for scanner modal
 */
function addScannerStyles() {
    // Check if styles already added
    if (document.getElementById('scanner-styles')) {
        return;
    }

    const styleElement = document.createElement('style');
    styleElement.id = 'scanner-styles';
    styleElement.textContent = `
        .scanner-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            animation: fadeIn 0.3s ease-out;
        }

        .scanner-modal-content {
            background: white;
            border-radius: 12px;
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .scanner-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 2px solid #edf2f7;
        }

        .scanner-modal-header h3 {
            font-size: 16px;
            font-weight: 700;
            color: #2d3748;
            margin: 0;
        }

        .scanner-close-btn {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #718096;
            transition: color 0.3s;
        }

        .scanner-close-btn:hover {
            color: #2d3748;
        }

        .scanner-modal-body {
            padding: 20px;
            text-align: center;
        }

        #qr-reader {
            border: 2px solid #cbd5e0;
            border-radius: 8px;
            overflow: hidden;
            background: #f7fafc;
        }

        .scanner-hint {
            margin-top: 15px;
            font-size: 13px;
            color: #718096;
        }

        .scanner-modal-footer {
            padding: 20px;
            border-top: 2px solid #edf2f7;
            display: flex;
            gap: 10px;
        }

        .manual-barcode-input {
            flex: 1;
            padding: 10px 15px;
            border: 1px solid #cbd5e0;
            border-radius: 6px;
            font-size: 14px;
            font-family: monospace;
        }

        .manual-barcode-input:focus {
            outline: none;
            border-color: #5B4B9E;
            box-shadow: 0 0 0 3px rgba(91, 75, 158, 0.1);
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
            }
            to {
                opacity: 1;
            }
        }

        /* Responsive */
        @media (max-width: 600px) {
            .scanner-modal-content {
                width: 95%;
            }

            #qr-reader {
                height: 300px !important;
            }

            .scanner-modal-footer {
                flex-direction: column;
            }
        }
    `;

    document.head.appendChild(styleElement);
}

// ============================================================================
// INITIALIZE SCANNER
// ============================================================================

/**
 * Initialize html5-qrcode scanner instance
 */
function initializeScanner() {
    try {
        scannerActive = true;

        // Create scanner instance
        html5QrcodeScanner = new Html5QrcodeScanner(
            'qr-reader',
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: true,
                aspectRatio: 1.0
            },
            false // verbose
        );

        // On successful scan
        html5QrcodeScanner.render(
            (decodedText, decodedResult) => {
                handleBarcodeDetected(decodedText, decodedResult);
            },
            (errorMessage) => {
                // Ignore scanning errors
                // console.log('Scanning error:', errorMessage);
            }
        );

    } catch (error) {
        console.error('Scanner initialization error:', error);
        showToast('Error initializing scanner', 'error');
        scannerActive = false;
    }
}

// ============================================================================
// HANDLE BARCODE DETECTED
// ============================================================================

/**
 * Process detected barcode/QR code
 * @param {String} decodedText - Scanned barcode/QR text
 * @param {Object} decodedResult - Scan result object
 */
function handleBarcodeDetected(decodedText, decodedResult) {
    try {
        console.log('Barcode detected:', decodedText);

        // Clean up the barcode text
        const cleanBarcode = decodedText.trim();

        if (!cleanBarcode) {
            showToast('Empty barcode detected', 'error');
            return;
        }

        // Auto-fill manifest number field
        const manifestField = document.getElementById('manifest-number');
        if (manifestField) {
            manifestField.value = cleanBarcode;
            manifestField.focus();
        }

        // Close scanner
        closeScanner();

        // Show success toast
        showToast(`Barcode scanned: ${cleanBarcode}`, 'success');

    } catch (error) {
        console.error('Barcode processing error:', error);
        showToast('Error processing barcode', 'error');
    }
}

// ============================================================================
// HANDLE MANUAL BARCODE INPUT
// ============================================================================

/**
 * Handle manual barcode entry via keyboard
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleManualBarcodeInput(event) {
    if (event.key === 'Enter') {
        const manualInput = document.getElementById('manual-barcode-input');
        const barcodeValue = manualInput.value.trim();

        if (!barcodeValue) {
            showToast('Please enter a barcode', 'error');
            return;
        }

        // Process manual barcode
        handleBarcodeDetected(barcodeValue, null);
    }
}

// ============================================================================
// CLOSE SCANNER
// ============================================================================

/**
 * Close scanner modal and cleanup
 */
function closeScanner() {
    try {
        // Stop scanner
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }

        // Remove modal
        const modal = document.getElementById('barcode-scanner-modal');
        if (modal) {
            modal.remove();
        }

        scannerActive = false;

    } catch (error) {
        console.error('Close scanner error:', error);
    }
}

// ============================================================================
// BARCODE VALIDATION
// ============================================================================

/**
 * Validate barcode format
 * @param {String} barcode - Barcode string
 * @returns {Boolean} True if valid
 */
function isValidBarcode(barcode) {
    // Accept any non-empty string as valid barcode
    // Can add specific format validation here if needed
    return barcode && barcode.trim().length > 0;
}

// ============================================================================
// SUPPORTED BARCODE FORMATS
// ============================================================================

/**
 * Html5-qrcode library supports:
 * - QR Code
 * - EAN-13
 * - EAN-8
 * - UPC-E
 * - UPC-A
 * - Code-128
 * - Code-39
 * - Code-93
 * - DataMatrix
 * - Aztec
 * - PDF417
 * And more...
 */

// ============================================================================
// CAMERA PERMISSION CHECK
// ============================================================================

/**
 * Check if browser has camera permissions
 * @returns {Promise<Boolean>} True if camera is available
 */
async function checkCameraPermission() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === 'videoinput');
        return hasCamera;
    } catch (error) {
        console.error('Camera permission check error:', error);
        return false;
    }
}

// ============================================================================
// REQUEST CAMERA PERMISSION
// ============================================================================

/**
 * Request camera permission from user
 * @returns {Promise<Boolean>} True if permission granted
 */
async function requestCameraPermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        
        // Stop stream immediately
        stream.getTracks().forEach(track => track.stop());
        
        return true;
    } catch (error) {
        console.error('Camera permission denied:', error);
        showToast('Camera permission denied. Please enable camera access.', 'error');
        return false;
    }
}

// ============================================================================
// AUTO-SCAN ON PAGE LOAD (Optional)
// ============================================================================

/**
 * Optional: Auto-open scanner when page loads
 * Uncomment to enable
 */
/*
document.addEventListener('DOMContentLoaded', () => {
    // Auto-open scanner for testing
    setTimeout(() => {
        scanBarcode();
    }, 1000);
});
*/

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

// All functions are globally available for vanilla JS
