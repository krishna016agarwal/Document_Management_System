import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import './RevisionHistoryModal.css';

function RevisionHistoryModal({ isOpen, onClose, documentId, documentName, onRevertSuccess }) {
    const [revisions, setRevisions] = useState([]);
    const [selectedRevisionContent, setSelectedRevisionContent] = useState(null);
    const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
    const [isLoadingContent, setIsLoadingContent] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && documentId) {
            setIsLoadingRevisions(true);
            setError('');
            setSelectedRevisionContent(null); // Reset preview
            fetch(`/api/documents/${documentId}/revisions`)
                .then(res => {
                    if (!res.ok) throw new Error('Failed to fetch revisions');
                    return res.json();
                })
                .then(data => {
                    setRevisions(data);
                    setIsLoadingRevisions(false);
                })
                .catch(err => {
                    console.error("Error fetching revisions:", err);
                    setError(err.message);
                    setIsLoadingRevisions(false);
                });
        }
    }, [isOpen, documentId]);

    const handleViewRevision = (revisionId) => {
        setIsLoadingContent(true);
        setSelectedRevisionContent(null);
        setError('');
        fetch(`/api/revisions/${revisionId}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch revision content');
                return res.json();
            })
            .then(data => {
                if (data.isMarkdownContent) {
                    setSelectedRevisionContent({ html: marked.parse(data.content), raw: data.content, version: data.version });
                } else {
                    setSelectedRevisionContent({ html: data.content, raw: data.content, version: data.version });
                }
                setIsLoadingContent(false);
            })
            .catch(err => {
                console.error("Error fetching revision content:", err);
                setError(err.message);
                setIsLoadingContent(false);
            });
    };

    const handleRevertToRevision = (revisionId, versionNumber) => {
        if (!window.confirm(`Are you sure you want to revert "${documentName}" to version ${versionNumber}? The current content will be saved as a new revision.`)) {
            return;
        }
        setError('');
        fetch(`/api/documents/${documentId}/revert/${revisionId}`, { method: 'POST' })
            .then(res => {
                if (!res.ok) throw new Error(`Failed to revert to version ${versionNumber}`);
                return res.json();
            })
            .then(data => {
                alert(data.message || "Successfully reverted.");
                onRevertSuccess(); // Callback to App.jsx to refetch structure/content
                onClose(); // Close modal
            })
            .catch(err => {
                console.error("Error reverting revision:", err);
                setError(err.message);
                alert(`Error: ${err.message}`);
            });
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay revision-modal-overlay" onClick={onClose}>
            <div className="modal-content revision-modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Revision History for: {documentName}</h2>
                {error && <p className="error-message">{error}</p>}

                <div className="revision-layout">
                    <div className="revision-list-pane">
                        <h3>Versions</h3>
                        {isLoadingRevisions ? <p>Loading revisions...</p> : (
                            revisions.length === 0 ? <p>No past revisions found.</p> : (
                                <ul>
                                    {revisions.map(rev => (
                                        <li key={rev.id} className={selectedRevisionContent?.version === rev.version ? 'active-revision' : ''}>
                                            <span>
                                                Version {rev.version} (Saved: {new Date(rev.savedAt).toLocaleString()})
                                            </span>
                                            <div>
                                                <button onClick={() => handleViewRevision(rev.id)} className="action-btn view-btn">View</button>
                                                <button onClick={() => handleRevertToRevision(rev.id, rev.version)} className="action-btn revert-btn">Revert to this</button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )
                        )}
                    </div>
                    <div className="revision-preview-pane">
                        <h3>Preview {selectedRevisionContent ? `(Version ${selectedRevisionContent.version})` : ''}</h3>
                        {isLoadingContent ? <p>Loading content...</p> : (
                            selectedRevisionContent ? (
                                <div className="document-body" dangerouslySetInnerHTML={{ __html: selectedRevisionContent.html }} />
                            ) : <p>Select a version to preview its content.</p>
                        )}
                    </div>
                </div>

                <div className="modal-actions">
                    <button onClick={onClose} className="cancel-btn">Close</button>
                </div>
            </div>
        </div>
    );
}

export default RevisionHistoryModal;