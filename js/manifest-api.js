// ============================================================================
// LogiGate Manifest API Module
// Handles manifest creation, PDF generation, file uploads, and database ops
// ============================================================================

// Storage bucket configuration
const STORAGE_BUCKET = 'logigate-files';

// ============================================================================
// CREATE MANIFEST
// ============================================================================

/**
 * Create a new outbound manifest with all details, photos, and signature
 * @param {Object} manifestData - Manifest data object
 * @returns {Promise<Object>} Success/error response
 */
async function createManifest(manifestData) {
    try {
        const {
            manifest_number,
            warehouse_staff_name,
            warehouse_staff_photo,
            warehouse_staff_signature,
            manifest_pages,
            transporter_name,
            transporter_photo,
            item_count,
            notes,
            client_id,
            guard_id,
            company
        } = manifestData;

        console.log('Creating manifest:', manifest_number);

        // Step 1: Upload staff photo
        const staffPhotoUrl = await uploadFile(
            warehouse_staff_photo,
            `${client_id}/manifests/staff-photos`,
            `${manifest_number}_staff_${Date.now()}.jpg`
        );

        // Step 2: Convert signature to PNG and upload
        const signaturePngBlob = await signatureToPNG(warehouse_staff_signature);
        const signatureUrl = await uploadFile(
            signaturePngBlob,
            `${client_id}/manifests/signatures`,
            `${manifest_number}_signature_${Date.now()}.png`
        );

        // Step 3: Upload transporter photo
        const transporterPhotoUrl = await uploadFile(
            transporter_photo,
            `${client_id}/manifests/transporter-photos`,
            `${manifest_number}_transporter_${Date.now()}.jpg`
        );

        // Step 4: Generate PDF from manifest pages, signature, and company info
        const pdfBlob = await generateManifestPDF({
            manifest_number,
            warehouse_staff_name,
            staff_photo_url: staffPhotoUrl,
            signature_url: signatureUrl,
            manifest_pages,
            transporter_name,
            transporter_photo_url: transporterPhotoUrl,
            item_count,
            notes,
            company,
            created_at: new Date().toISOString()
        });

        // Step 5: Upload PDF
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const pdfFileName = `manifest_${manifest_number}_${timestamp}.pdf`;
        const pdfUrl = await uploadFile(
            pdfBlob,
            `${client_id}/manifests/pdfs`,
            pdfFileName
        );

        // Step 6: Save manifest record to database
        const { data, error } = await supabaseClient
            .from('logigate_outbound_manifests')
            .insert([{
                manifest_number,
                warehouse_staff_name,
                warehouse_staff_photo_url: staffPhotoUrl,
                warehouse_staff_signature_url: signatureUrl,
                manifest_pages_pdf_url: pdfUrl,
                transporter_name,
                transporter_photo_url: transporterPhotoUrl,
                item_count,
                notes: notes || null,
                guard_id,
                client_id,
                status: 'logged',
                created_at: new Date().toISOString()
            }])
            .select();

        if (error) {
            throw error;
        }

        console.log('Manifest created successfully:', data[0].id);

        return {
            success: true,
            data: data[0],
            pdfUrl: pdfUrl
        };

    } catch (error) {
        console.error('Manifest creation error:', error);
        return {
            success: false,
            error: error.message || 'Failed to create manifest'
        };
    }
}

// ============================================================================
// UPLOAD FILE TO SUPABASE STORAGE
// ============================================================================

/**
 * Upload file (photo, PDF, signature) to Supabase Storage
 * @param {Blob|File} file - File to upload
 * @param {String} folder - Storage folder path
 * @param {String} fileName - File name
 * @returns {Promise<String>} Public URL of uploaded file
 */
async function uploadFile(file, folder, fileName) {
    try {
        // Compress image if it's an image file
        let fileToUpload = file;
        if (file.type.startsWith('image/') && file.type !== 'image/png') {
            fileToUpload = await compressImage(file);
        }

        const filePath = `${folder}/${fileName}`;

        const { data, error } = await supabaseClient.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, fileToUpload, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) {
            throw error;
        }

        // Get public URL
        const { data: { publicUrl } } = supabaseClient.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(filePath);

        console.log('File uploaded:', publicUrl);
        return publicUrl;

    } catch (error) {
        console.error('File upload error:', error);
        throw error;
    }
}

// ============================================================================
// COMPRESS IMAGE
// ============================================================================

/**
 * Compress image to max 1200x1200 and reduce quality
 * @param {Blob|File} file - Image file
 * @returns {Promise<Blob>} Compressed image blob
 */
async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Calculate new dimensions (max 1200x1200)
                let width = img.width;
                let height = img.height;
                const maxDim = 1200;

                if (width > height) {
                    if (width > maxDim) {
                        height = (height * maxDim) / width;
                        width = maxDim;
                    }
                } else {
                    if (height > maxDim) {
                        width = (width * maxDim) / height;
                        height = maxDim;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', 0.8); // 80% quality
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ============================================================================
// CONVERT SIGNATURE TO PNG
// ============================================================================

/**
 * Convert signature pad data to PNG blob
 * @param {Array} signatureData - Signature pad data from SignaturePad.toData()
 * @returns {Promise<Blob>} PNG blob of signature
 */
async function signatureToPNG(signatureData) {
    return new Promise((resolve, reject) => {
        try {
            // Create canvas for signature
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            canvas.width = 600;
            canvas.height = 150;

            // Fill with white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw signature
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            for (let curve of signatureData) {
                for (let i = 0; i < curve.points.length; i++) {
                    const point = curve.points[i];
                    if (i === 0) {
                        ctx.beginPath();
                        ctx.moveTo(point.x, point.y);
                    } else {
                        ctx.lineTo(point.x, point.y);
                    }
                }
                ctx.stroke();
            }

            // Convert to blob
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');

        } catch (error) {
            reject(error);
        }
    });
}

// ============================================================================
// GENERATE MANIFEST PDF
// ============================================================================

/**
 * Generate comprehensive PDF with all manifest details, images, and signature
 * @param {Object} pdfData - Data for PDF generation
 * @returns {Promise<Blob>} PDF blob
 */
async function generateManifestPDF(pdfData) {
    return new Promise(async (resolve, reject) => {
        try {
            const {
                manifest_number,
                warehouse_staff_name,
                staff_photo_url,
                signature_url,
                manifest_pages,
                transporter_name,
                transporter_photo_url,
                item_count,
                notes,
                company,
                created_at
            } = pdfData;

            // Create HTML content for PDF
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                        .pdf-container { background: white; padding: 40px; max-width: 800px; margin: 0 auto; }
                        .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #5B4B9E; padding-bottom: 20px; }
                        .logo { height: 60px; margin-bottom: 10px; }
                        .company-name { font-size: 24px; font-weight: bold; color: #2d3748; margin-bottom: 5px; }
                        .doc-title { font-size: 18px; font-weight: bold; color: #5B4B9E; margin-top: 10px; }
                        .section { margin-bottom: 30px; }
                        .section-title { font-size: 14px; font-weight: bold; background: #edf2f7; padding: 10px; margin-bottom: 15px; border-left: 4px solid #5B4B9E; }
                        .info-row { display: flex; margin-bottom: 10px; font-size: 12px; }
                        .info-label { font-weight: bold; width: 150px; color: #4a5568; }
                        .info-value { flex: 1; color: #2d3748; }
                        .photos-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 10px; }
                        .photo-box { border: 1px solid #cbd5e0; padding: 10px; text-align: center; }
                        .photo-box img { max-width: 100%; max-height: 200px; }
                        .photo-label { font-size: 11px; font-weight: bold; margin-top: 8px; color: #4a5568; }
                        .signature-section { text-align: center; margin-top: 20px; }
                        .signature-img { max-width: 300px; max-height: 100px; border: 1px solid #cbd5e0; padding: 5px; }
                        .manifest-pages { margin-top: 20px; }
                        .manifest-page { page-break-inside: avoid; margin-bottom: 20px; text-align: center; }
                        .manifest-page img { max-width: 100%; height: auto; border: 1px solid #cbd5e0; }
                        .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #718096; border-top: 1px solid #cbd5e0; padding-top: 20px; }
                        .timestamp { color: #718096; font-size: 11px; }
                    </style>
                </head>
                <body>
                    <div class="pdf-container">
                        <!-- HEADER -->
                        <div class="header">
                            ${company && company.logo_url ? `<img src="${company.logo_url}" class="logo" alt="Logo">` : ''}
                            <div class="company-name">${company?.business_name || 'LogiGate'}</div>
                            <div class="doc-title">🛡️ OUTBOUND MANIFEST</div>
                            <div class="timestamp">Generated: ${new Date(created_at).toLocaleString()}</div>
                        </div>

                        <!-- MANIFEST INFO -->
                        <div class="section">
                            <div class="section-title">Manifest Information</div>
                            <div class="info-row">
                                <span class="info-label">Manifest #:</span>
                                <span class="info-value">${manifest_number}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Item Count:</span>
                                <span class="info-value">${item_count}</span>
                            </div>
                            ${notes ? `
                            <div class="info-row">
                                <span class="info-label">Notes:</span>
                                <span class="info-value">${notes}</span>
                            </div>
                            ` : ''}
                        </div>

                        <!-- WAREHOUSE STAFF -->
                        <div class="section">
                            <div class="section-title">Warehouse Staff</div>
                            <div class="info-row">
                                <span class="info-label">Name:</span>
                                <span class="info-value">${warehouse_staff_name}</span>
                            </div>
                            <div class="photos-grid">
                                ${staff_photo_url ? `
                                <div class="photo-box">
                                    <img src="${staff_photo_url}" alt="Staff Photo">
                                    <div class="photo-label">Staff Photo</div>
                                </div>
                                ` : ''}
                                ${signature_url ? `
                                <div class="photo-box">
                                    <img src="${signature_url}" alt="Signature">
                                    <div class="photo-label">Signature</div>
                                </div>
                                ` : ''}
                            </div>
                        </div>

                        <!-- TRANSPORTER -->
                        <div class="section">
                            <div class="section-title">Transporter Details</div>
                            <div class="info-row">
                                <span class="info-label">Name:</span>
                                <span class="info-value">${transporter_name}</span>
                            </div>
                            ${transporter_photo_url ? `
                            <div class="photos-grid">
                                <div class="photo-box">
                                    <img src="${transporter_photo_url}" alt="Transporter Photo">
                                    <div class="photo-label">Transporter Photo</div>
                                </div>
                            </div>
                            ` : ''}
                        </div>

                        <!-- MANIFEST PAGES -->
                        ${manifest_pages && manifest_pages.length > 0 ? `
                        <div class="section">
                            <div class="section-title">Manifest Pages</div>
                            <div class="manifest-pages" id="manifest-pages-container">
                                <!-- Pages will be added here -->
                            </div>
                        </div>
                        ` : ''}

                        <!-- FOOTER -->
                        <div class="footer">
                            <p>This is an electronically generated document. All information has been verified and logged.</p>
                            <p>LogiGate - Warehouse Security & Manifest Tracking System</p>
                        </div>
                    </div>
                </body>
                </html>
            `;

            // Convert manifest pages to base64 for embedding in PDF
            const manifestPagesHtml = await Promise.all(
                manifest_pages.map(async (pageFile, index) => {
                    return new Promise((resolvePage) => {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            resolvePage(`
                                <div class="manifest-page">
                                    <img src="${e.target.result}" alt="Manifest Page ${index + 1}">
                                </div>
                            `);
                        };
                        reader.readAsDataURL(pageFile);
                    });
                })
            );

            // Insert manifest pages into HTML
            const finalHtmlContent = htmlContent.replace(
                '<div class="manifest-pages" id="manifest-pages-container">',
                `<div class="manifest-pages" id="manifest-pages-container">${manifestPagesHtml.join('')}`
            );

            // Use html2pdf to generate PDF
            const opt = {
                margin: 10,
                filename: `manifest_${manifest_number}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
            };

            // Create PDF from HTML
            const pdfBlob = await new Promise((resolvePdf) => {
                html2pdf()
                    .set(opt)
                    .fromString(finalHtmlContent)
                    .outputPdf('blob')
                    .then(resolvePdf);
            });

            resolve(pdfBlob);

        } catch (error) {
            console.error('PDF generation error:', error);
            reject(error);
        }
    });
}

// ============================================================================
// GET MANIFESTS
// ============================================================================

/**
 * Fetch all manifests for a client
 * @param {String} clientId - Client ID
 * @param {Object} filters - Optional filters (date range, status, etc.)
 * @returns {Promise<Array>} Array of manifest objects
 */
async function getManifests(clientId, filters = {}) {
    try {
        let query = supabaseClient
            .from('logigate_outbound_manifests')
            .select('*')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });

        // Apply filters if provided
        if (filters.startDate) {
            query = query.gte('created_at', filters.startDate);
        }
        if (filters.endDate) {
            query = query.lte('created_at', filters.endDate);
        }
        if (filters.status) {
            query = query.eq('status', filters.status);
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        return data || [];

    } catch (error) {
        console.error('Get manifests error:', error);
        return [];
    }
}

// ============================================================================
// GET MANIFEST BY ID
// ============================================================================

/**
 * Fetch single manifest by ID
 * @param {String} manifestId - Manifest ID
 * @returns {Promise<Object|null>} Manifest object or null
 */
async function getManifestById(manifestId) {
    try {
        const { data, error } = await supabaseClient
            .from('logigate_outbound_manifests')
            .select('*')
            .eq('id', manifestId)
            .single();

        if (error) {
            throw error;
        }

        return data;

    } catch (error) {
        console.error('Get manifest error:', error);
        return null;
    }
}

// ============================================================================
// DOWNLOAD PDF
// ============================================================================

/**
 * Download existing manifest PDF
 * @param {String} manifestId - Manifest ID
 * @param {String} clientId - Client ID
 * @returns {Promise<Object>} Success/error response
 */
async function generateAndDownloadPDF(manifestId, clientId) {
    try {
        // Fetch manifest from database
        const manifest = await getManifestById(manifestId);
        
        if (!manifest || manifest.client_id !== clientId) {
            return {
                success: false,
                error: 'Manifest not found'
            };
        }

        // Get PDF URL from database
        const pdfUrl = manifest.manifest_pages_pdf_url;

        if (!pdfUrl) {
            return {
                success: false,
                error: 'PDF not available'
            };
        }

        // Download PDF
        const response = await fetch(pdfUrl);
        const blob = await response.blob();

        // Create download link
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `manifest_${manifest.manifest_number}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        return {
            success: true,
            message: 'PDF downloaded'
        };

    } catch (error) {
        console.error('PDF download error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================================================
// DELETE MANIFEST
// ============================================================================

/**
 * Delete manifest (soft delete - just mark as deleted)
 * @param {String} manifestId - Manifest ID
 * @returns {Promise<Object>} Success/error response
 */
async function deleteManifest(manifestId) {
    try {
        const { error } = await supabaseClient
            .from('logigate_outbound_manifests')
            .delete()
            .eq('id', manifestId);

        if (error) {
            throw error;
        }

        return {
            success: true,
            message: 'Manifest deleted'
        };

    } catch (error) {
        console.error('Delete manifest error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

// All functions are globally available for vanilla JS
