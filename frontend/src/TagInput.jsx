// frontend/src/TagInput.jsx
import React, { useState } from 'react';
import './TagInput.css';

const TagInput = ({ tags, onChange }) => {
    const [inputValue, setInputValue] = useState('');

    const handleInputChange = (e) => {
        setInputValue(e.target.value);
    };

    const handleInputKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const newTag = inputValue.trim();
            if (newTag && !tags.includes(newTag)) {
                onChange([...tags, newTag]);
            }
            setInputValue('');
        } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            onChange(tags.slice(0, -1)); // Remove last tag
        }
    };

    const removeTag = (tagToRemove) => {
        onChange(tags.filter(tag => tag !== tagToRemove));
    };

    return (
        <div className="tag-input-container">
            {tags.map(tag => (
                <span key={tag} className="tag-item">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="remove-tag-btn">×</button>
                </span>
            ))}
            <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder="Add tags (comma or Enter)"
                className="tag-input-field"
            />
        </div>
    );
};

export default TagInput;