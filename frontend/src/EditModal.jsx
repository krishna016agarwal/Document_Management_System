import React, { useState, useEffect } from 'react';
import './EditModal.css';
import TagInput from './TagInput'; // Import TagInput

function EditModal({ isOpen, onClose, initialContent, initialTags = [], onSave, documentName }) {
    const [content, setContent] = useState(initialContent);
    const [tags, setTags] = useState(initialTags); // New state for tags

    useEffect(() => {
        if (isOpen) { // Reset when modal opens with new initial data
            setContent(initialContent);
            setTags(initialTags || []); // Ensure tags is an array
        }
    }, [initialContent, initialTags, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(content, tags); // Pass tags to onSave
    };

    const handleTagsChange = (newTags) => {
        setTags(newTags);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Edit: {documentName}</h2>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows="15" // Reduced rows a bit
                    cols="80"
                />
                <div className="form-group" style={{marginTop: '15px'}}> {/* Added form-group class for consistency */}
                    <label>Tags:</label>
                    <TagInput tags={tags} onChange={handleTagsChange} />
                </div>
                <div className="modal-actions" style={{marginTop: '20px'}}>
                    <button onClick={handleSave} className="save-btn">Save</button>
                    <button onClick={onClose} className="cancel-btn">Cancel</button>
                </div>
            </div>
        </div>
    );
}
export default EditModal;