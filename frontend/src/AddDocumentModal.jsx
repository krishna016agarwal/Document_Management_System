import { useState } from 'react';
import './AddDocumentModal.css';

function AddDocumentModal({ isOpen, onClose, onSave, parentName }) {
    const [docName, setDocName] = useState('');
    const [docCreationType, setDocCreationType] = useState('blank'); // 'blank', 'upload'
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
            isMarkdownContent: false, // Default, will be updated
            content: '',
        };

        if (docCreationType === 'blank') {
            newDocData.content = '<h1>New Document</h1><p>Start editing your content here.</p>';
            newDocData.isMarkdownContent = false; // Assuming blank is HTML initially
        } else if (docCreationType === 'upload') {
            if (!localFile) {
                setFileError('Please select a file to upload.');
                return;
            }
            try {
                const fileContent = await readFileContent(localFile);
                newDocData.content = fileContent;
                if (localFile.name.endsWith('.md')) {
                    newDocData.isMarkdownContent = true;
                }
                setFileError('');
            } catch (error) {
                console.error("Error reading file:", error);
                setFileError('Error reading file content.');
                return;
            }
        }

        onSave(newDocData); // Pass to App.jsx's handleSaveNewItem
        handleClose();
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            if (!file.name.endsWith('.md') && !file.name.endsWith('.html')) {
                setFileError('Please select a .md or .html file.');
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
                            /> New Blank Document
                        </label>
                        <label className="radio-label">
                            <input type="radio" name="docCreationType" value="upload"
                                checked={docCreationType === 'upload'} onChange={(e) => setDocCreationType(e.target.value)}
                            /> Create from Local File (Upload Content)
                        </label>
                    </div>
                </div>
                {docCreationType === 'upload' && (
                    <div className="form-group">
                        <label htmlFor="localFileUploaderModal">Select Local File (.md or .html):</label>
                        <input type="file" id="localFileUploaderModal"
                            accept=".md,.html,text/markdown,text/html"
                            onChange={handleFileChange}
                        />
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