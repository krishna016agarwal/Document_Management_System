import { useState } from 'react';
import './AddDocumentModal.css';

const ALLOWED_FILE_EXTENSIONS_MAP = {
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const ACCEPT_STRING = Object.keys(ALLOWED_FILE_EXTENSIONS_MAP).join(',');


function AddDocumentModal({ isOpen, onClose, onSave, parentName }) {
    const [docName, setDocName] = useState('');
    const [docCreationType, setDocCreationType] = useState('blank');
    const [localFile, setLocalFile] = useState(null);
    const [fileError, setFileError] = useState('');

    if (!isOpen) return null;

    const resetForm = () => {
        setDocName('');
        setDocCreationType('blank');
        setLocalFile(null);
        setFileError('');
        const fileInput = document.getElementById('localFileUploaderModal');
        if (fileInput) fileInput.value = '';
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleSave = async () => {
        if (!docName.trim()) {
            alert('Document name is required.');
            return;
        }

        let newDocData = {
            name: docName.trim(),
            type: 'document',
        };

        if (docCreationType === 'blank') {
            newDocData.content = '<h1>New Document</h1><p>Start editing your content here.</p>';
            newDocData.isMarkdownContent = false;
            // storageType will be 'inline', set by backend if not FormData
        } else if (docCreationType === 'upload') {
            if (!localFile) {
                setFileError('Please select a file to upload.');
                return;
            }

            const fileName = localFile.name.toLowerCase();
            if (fileName.endsWith('.md') || fileName.endsWith('.html')) {
                try {
                    const fileContent = await readFileContent(localFile);
                    newDocData.content = fileContent;
                    newDocData.isMarkdownContent = fileName.endsWith('.md');
                    // storageType will be 'inline'
                } catch (error) {
                    console.error("Error reading .md/.html file:", error);
                    setFileError('Error reading text file content.');
                    return;
                }
            } else {
                // For PDF, images, DOCX etc., pass the File object to be handled by FormData
                newDocData.localFile = localFile; // This signals App.jsx to use FormData
                newDocData.isMarkdownContent = false; // Not applicable for binary files
                // storageType will be 'r2', set by backend
            }
        }
        setFileError('');
        onSave(newDocData);
        handleClose();
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
            if (!Object.keys(ALLOWED_FILE_EXTENSIONS_MAP).includes(fileExtension) && !Object.values(ALLOWED_FILE_EXTENSIONS_MAP).includes(file.type)) {
                setFileError(`Unsupported file type. Allowed extensions: ${ACCEPT_STRING}`);
                setLocalFile(null);
                event.target.value = '';
                return;
            }
            setLocalFile(file);
            setFileError('');
        } else {
            setLocalFile(null);
        }
    };

    const readFileContent = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = (error) => reject(error);
            reader.readAsText(file);
        });
    };

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content add-doc-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Add New Document {parentName ? `to '${parentName}'` : ''}</h2>
                <div className="form-group">
                    <label htmlFor="docNameModal">Document Name:</label>
                    <input
                        type="text" id="docNameModal" value={docName}
                        onChange={(e) => setDocName(e.target.value)}
                        placeholder="My Awesome Document"
                    />
                </div>
                <div className="form-group">
                    <label>Document Type:</label>
                    <div>
                        <label className="radio-label">
                            <input type="radio" name="docCreationType" value="blank"
                                checked={docCreationType === 'blank'} onChange={(e) => setDocCreationType(e.target.value)}
                            /> New Blank Document (HTML Editor)
                        </label>
                        <label className="radio-label">
                            <input type="radio" name="docCreationType" value="upload"
                                checked={docCreationType === 'upload'} onChange={(e) => setDocCreationType(e.target.value)}
                            /> Create from Local File
                        </label>
                    </div>
                </div>
                {docCreationType === 'upload' && (
                    <div className="form-group">
                        <label htmlFor="localFileUploaderModal">Select Local File:</label>
                        <input type="file" id="localFileUploaderModal"
                            accept={ACCEPT_STRING}
                            onChange={handleFileChange}
                        />
                         <small>Allowed: .md, .html, .pdf, images, .doc, .docx</small>
                        {fileError && <p className="error-message">{fileError}</p>}
                    </div>
                )}
                <div className="modal-actions">
                    <button onClick={handleSave} className="save-btn">Add Document</button>
                    <button onClick={handleClose} className="cancel-btn">Cancel</button>
                </div>
            </div>
        </div>
    );
}
export default AddDocumentModal;